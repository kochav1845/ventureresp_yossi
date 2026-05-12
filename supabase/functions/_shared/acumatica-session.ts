import { createClient } from 'npm:@supabase/supabase-js@2';

interface AcumaticaCredentials {
  acumaticaUrl: string;
  username: string;
  password: string;
  company?: string;
  branch?: string;
}

export class AcumaticaSessionManager {
  private supabase;

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
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: username,
        password: password,
        company: company || '',
        branch: branch || '',
      }),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Authentication failed: ${errorText}`);
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
