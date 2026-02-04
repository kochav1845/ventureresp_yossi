import { createClient } from 'npm:@supabase/supabase-js@2';

interface AcumaticaCredentials {
  acumaticaUrl: string;
  username: string;
  password: string;
  company?: string;
  branch?: string;
}

interface SessionInfo {
  cookie: string;
  expiresAt: Date;
}

export class AcumaticaSessionManager {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get a valid session cookie, reusing cached session if available
   */
  async getSession(credentials: AcumaticaCredentials): Promise<string> {
    // Try to get a valid cached session
    const cachedSession = await this.getCachedSession();
    if (cachedSession) {
      console.log('Using cached Acumatica session');
      await this.updateLastUsed(cachedSession.id);
      return cachedSession.session_cookie;
    }

    // No valid session, create a new one
    console.log('Creating new Acumatica session');
    return await this.createNewSession(credentials);
  }

  /**
   * Get a valid cached session from database
   */
  private async getCachedSession() {
    const { data, error } = await this.supabase
      .from('acumatica_session_cache')
      .select('*')
      .eq('is_valid', true)
      .gt('expires_at', new Date().toISOString())
      .order('last_used_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching cached session:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new Acumatica session and cache it
   */
  private async createNewSession(credentials: AcumaticaCredentials): Promise<string> {
    const { acumaticaUrl, username, password, company, branch } = credentials;

    // Check one more time if a session was created by another concurrent request
    const existingSession = await this.getCachedSession();
    if (existingSession) {
      console.log('Another request created a session, using that one');
      return existingSession.session_cookie;
    }

    // Only invalidate expired or invalid sessions, not ALL sessions
    await this.invalidateExpiredSessions();

    // Perform login
    const loginUrl = `${acumaticaUrl}/entity/auth/login`;
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

    // Extract session cookie from Set-Cookie header
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No session cookie received from Acumatica');
    }

    // Parse the cookie (typically looks like: .AspNet.ApplicationCookie=...)
    const sessionCookie = this.parseSessionCookie(setCookieHeader);
    if (!sessionCookie) {
      throw new Error('Failed to parse session cookie');
    }

    // Cache the session (expires in 25 minutes to be safe, actual timeout might be 30)
    const expiresAt = new Date(Date.now() + 25 * 60 * 1000);

    const { error: insertError } = await this.supabase
      .from('acumatica_session_cache')
      .insert({
        session_cookie: sessionCookie,
        expires_at: expiresAt.toISOString(),
        is_valid: true,
      });

    if (insertError) {
      console.error('Error caching session:', insertError);
      // Continue anyway, we have the cookie
    }

    console.log('New session created and cached');
    return sessionCookie;
  }

  /**
   * Parse session cookie from Set-Cookie header
   */
  private parseSessionCookie(setCookieHeader: string): string | null {
    // The Set-Cookie header may contain multiple cookies separated by commas
    // We're looking for the .AspNet.ApplicationCookie or similar
    const cookies = setCookieHeader.split(',').map(c => c.trim());

    for (const cookie of cookies) {
      // Extract the cookie name=value part (before any semicolon)
      const cookiePart = cookie.split(';')[0].trim();

      // Look for AspNet cookie
      if (cookiePart.includes('.AspNet') || cookiePart.includes('ARRAffinity')) {
        return cookiePart;
      }
    }

    // If no specific cookie found, return the first cookie
    return cookies[0]?.split(';')[0].trim() || null;
  }

  /**
   * Update last_used_at timestamp for a session
   */
  private async updateLastUsed(sessionId: string) {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  /**
   * Invalidate expired sessions only
   */
  async invalidateExpiredSessions() {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ is_valid: false })
      .lt('expires_at', new Date().toISOString())
      .eq('is_valid', true);
  }

  /**
   * Invalidate all cached sessions
   */
  async invalidateAllSessions() {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ is_valid: false })
      .eq('is_valid', true);
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(cookie: string) {
    await this.supabase
      .from('acumatica_session_cache')
      .update({ is_valid: false })
      .eq('session_cookie', cookie)
      .eq('is_valid', true);
  }

  /**
   * Make an authenticated request to Acumatica with automatic session management
   */
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

    // If we get a 401, the session might be invalid - invalidate and retry once
    if (response.status === 401) {
      console.log('Session invalid (401), creating new session');
      await this.invalidateSession(sessionCookie);

      // Retry with new session
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
   * Logout from Acumatica (optional, but good practice)
   */
  async logout(credentials: AcumaticaCredentials, sessionCookie: string) {
    try {
      const logoutUrl = `${credentials.acumaticaUrl}/entity/auth/logout`;
      await fetch(logoutUrl, {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      await this.invalidateSession(sessionCookie);
      console.log('Logged out from Acumatica');
    } catch (error) {
      console.error('Error during logout:', error);
      // Invalidate anyway
      await this.invalidateSession(sessionCookie);
    }
  }
}
