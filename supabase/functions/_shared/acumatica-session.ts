import { createClient } from 'npm:@supabase/supabase-js@2';
import { AcumaticaAccessError, classifyAcumaticaFailure, summarizeAcumaticaBody } from './acumatica-errors.ts';

export * from './acumatica-errors.ts';

interface AcumaticaCredentials {
  acumaticaUrl: string;
  username: string;
  password: string;
  company?: string;
  branch?: string;
}

// A cached session is handed out until expires_at; a run that picked it up just
// before then can keep using it for at most the edge wall-clock limit (400s).
// Only sessions past expiry + this grace are logged out, so no run is cut off.
const RETIRE_GRACE_MS = 7 * 60 * 1000;
// Older than this, Acumatica has timed the session out on its own.
const RETIRE_WINDOW_MS = 90 * 60 * 1000;
// Marker for "logged out": the cookie is wiped (it stays usable as an auth
// ticket after logout, so it should not sit in the table anyway).
const LOGGED_OUT = '';

export class AcumaticaSessionManager {
  private supabase;
  private cookie: string | null = null;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getSession(credentials: AcumaticaCredentials): Promise<string> {
    // Use the database function with advisory lock to safely get or create a session
    const { data, error } = await this.supabase.rpc('acquire_acumatica_session');

    if (!error && data && data.length > 0 && data[0].session_cookie) {
      console.log('Using cached Acumatica session');
      // Update last_used_at in the background
      this.supabase
        .from('acumatica_session_cache')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data[0].session_id)
        .then(() => {});
      return data[0].session_cookie;
    }

    // No valid session exists, create a new one
    console.log('Creating new Acumatica session');
    return await this.createNewSession(credentials);
  }

  private async createNewSession(credentials: AcumaticaCredentials): Promise<string> {
    const { acumaticaUrl, username, password, company, branch } = credentials;

    const loginUrl = `${acumaticaUrl}/entity/auth/login`;
    let loginResponse: Response;
    try {
      loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: username,
          password: password,
          company: company || '',
          branch: branch || '',
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err: any) {
      throw new AcumaticaAccessError('unavailable', null, `Acumatica unreachable at login (${err?.message || err})`);
    }

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      const access = classifyAcumaticaFailure(loginResponse.status, errorText, true);
      if (access) throw access;
      throw new Error(`Authentication failed: HTTP ${loginResponse.status}: ${summarizeAcumaticaBody(errorText)}`);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No session cookie received from Acumatica');
    }

    const sessionCookie = this.parseSessionCookie(setCookieHeader);
    if (!sessionCookie) {
      throw new Error('Failed to parse session cookie');
    }

    const expiresAt = new Date(Date.now() + 25 * 60 * 1000);

    // Register via the locked database function to prevent duplicates
    const { data: sessionId, error: regError } = await this.supabase.rpc('register_acumatica_session', {
      p_session_cookie: sessionCookie,
      p_expires_at: expiresAt.toISOString(),
    });

    if (regError) {
      console.error('Error registering session:', regError);
    } else if (sessionId) {
      // register_acumatica_session returns the EXISTING session when another run
      // logged in at the same moment and registered first. Use that one and log
      // ours out, instead of leaving an untracked session open on Acumatica.
      const { data: winner } = await this.supabase
        .from('acumatica_session_cache')
        .select('session_cookie')
        .eq('id', sessionId)
        .maybeSingle();
      if (winner?.session_cookie && winner.session_cookie !== sessionCookie) {
        await this.logoutCookie(acumaticaUrl, sessionCookie);
        console.log('Another run registered an Acumatica session first; using it and logged ours out');
        return winner.session_cookie;
      }
    }

    console.log('New session created and registered');
    return sessionCookie;
  }

  private parseSessionCookie(setCookieHeader: string): string | null {
    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    return cookies || null;
  }

  async invalidateExpiredSessions() {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ is_valid: false })
      .lt('expires_at', new Date().toISOString())
      .eq('is_valid', true);
  }

  async invalidateAllSessions() {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ is_valid: false })
      .eq('is_valid', true);
  }

  async invalidateSession(cookie: string) {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ is_valid: false })
      .eq('session_cookie', cookie)
      .eq('is_valid', true);
  }

  async makeAuthenticatedRequest(
    credentials: AcumaticaCredentials,
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const sessionCookie = await this.getSession(credentials);

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Cookie': sessionCookie,
      },
    });

    if (response.status === 401) {
      console.log('Session invalid (401), creating new session');
      await this.invalidateSession(sessionCookie);

      const newSessionCookie = await this.getSession(credentials);
      return await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Cookie': newSessionCookie,
        },
      });
    }

    return response;
  }

  /**
   * GET an Acumatica REST resource and parse the JSON. Keeps one session for the
   * life of this manager (one request), re-logs in once on a 401, and turns the
   * "Acumatica is not there" answers (network error, 502/503/504/429, an HTML
   * maintenance page instead of JSON) into an AcumaticaAccessError so the caller
   * can skip the run instead of failing it. Other HTTP errors throw a plain Error.
   */
  async getJson(credentials: AcumaticaCredentials, url: string, what = 'Acumatica data'): Promise<any> {
    // A hung Acumatica becomes a clean skip instead of the edge wall-clock kill.
    const send = async (cookie: string) => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Cookie': cookie },
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 401) {
          await res.body?.cancel();
          return { res, text: '' };
        }
        return { res, text: await res.text() };
      } catch (err: any) {
        throw new AcumaticaAccessError('unavailable', null, `Acumatica unreachable while fetching ${what} (${err?.message || err})`);
      }
    };

    if (!this.cookie) this.cookie = await this.getSession(credentials);
    let { res, text } = await send(this.cookie);
    if (res.status === 401) {
      console.log(`Session rejected (401) while fetching ${what}; logging in again`);
      await this.invalidateSession(this.cookie);
      this.cookie = await this.getSession(credentials);
      ({ res, text } = await send(this.cookie));
    }

    if (!res.ok) {
      const access = classifyAcumaticaFailure(res.status, text);
      if (access) throw access;
      throw new Error(`Failed to fetch ${what}: ${res.status} ${res.statusText}. Details: ${summarizeAcumaticaBody(text)}`);
    }
    if (text.trim().startsWith('<')) {
      throw new AcumaticaAccessError('unavailable', res.status,
        `Acumatica returned an HTML page instead of JSON for ${what} (${summarizeAcumaticaBody(text)})`);
    }
    try {
      return JSON.parse(text);
    } catch (err: any) {
      throw new Error(`Failed to parse ${what}: ${err.message} (response may be incomplete)`);
    }
  }

  /** POST /entity/auth/logout. true = Acumatica answered (session is gone), false = could not reach it. */
  private async logoutCookie(acumaticaUrl: string, cookie: string): Promise<boolean> {
    try {
      const res = await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': cookie },
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel();
      // 204 = logged out; 401 = already gone. 5xx / HTML = Acumatica down, try later.
      return res.ok || res.status === 401;
    } catch {
      return false;
    }
  }

  /**
   * Log out cached sessions that have expired (past a grace period, so nobody is
   * still using them) and wipe their cookies. Acumatica limits concurrent API
   * logins; before this, every 25-minute cache entry was simply abandoned
   * (~48 sessions/day never logged out). Safe to call from any run; best-effort.
   */
  async retireExpiredSessions(credentials: AcumaticaCredentials): Promise<{ loggedOut: number; failed: number }> {
    const now = Date.now();
    const result = { loggedOut: 0, failed: 0 };
    try {
      const { data: rows, error } = await this.supabase
        .from('acumatica_session_cache')
        .select('id, session_cookie')
        .lt('expires_at', new Date(now - RETIRE_GRACE_MS).toISOString())
        .gt('expires_at', new Date(now - RETIRE_WINDOW_MS).toISOString())
        .neq('session_cookie', LOGGED_OUT)
        .limit(10);
      if (error) throw error;

      for (const row of rows || []) {
        if (await this.logoutCookie(credentials.acumaticaUrl, row.session_cookie)) {
          result.loggedOut++;
          await this.supabase
            .from('acumatica_session_cache')
            .update({ is_valid: false, session_cookie: LOGGED_OUT })
            .eq('id', row.id);
        } else {
          // Acumatica is not answering; the rest would wait out the same timeout.
          // They stay queued and are retried next run (until they age out).
          result.failed = (rows || []).length - result.loggedOut;
          break;
        }
      }

      // Sessions that aged out unretired (before this existed, or while Acumatica
      // was down) are dead on Acumatica's side; just stop storing their cookies.
      await this.supabase
        .from('acumatica_session_cache')
        .update({ is_valid: false, session_cookie: LOGGED_OUT })
        .lt('expires_at', new Date(now - RETIRE_WINDOW_MS).toISOString())
        .neq('session_cookie', LOGGED_OUT);
    } catch (err: any) {
      console.warn('[acumatica-session] Could not retire expired sessions:', err?.message || err);
    }
    if (result.loggedOut || result.failed) {
      console.log(`[acumatica-session] Retired expired sessions: ${result.loggedOut} logged out${result.failed ? `, ${result.failed} to retry (Acumatica unreachable)` : ''}`);
    }
    return result;
  }

  async logout(credentials: AcumaticaCredentials, sessionCookie: string) {
    try {
      const logoutUrl = `${credentials.acumaticaUrl}/entity/auth/logout`;
      await fetch(logoutUrl, {
        method: 'POST',
        headers: { 'Cookie': sessionCookie },
      });

      await this.invalidateSession(sessionCookie);
      console.log('Logged out from Acumatica');
    } catch (error) {
      console.error('Error during logout:', error);
      await this.invalidateSession(sessionCookie);
    }
  }
}
