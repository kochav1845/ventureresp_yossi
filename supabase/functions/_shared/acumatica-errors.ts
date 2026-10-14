// Pure helpers (no imports) so they can be unit-tested outside Deno.

/**
 * Why a sync could not talk to Acumatica at all.
 *  - unavailable: Acumatica (or the IIS in front of it) is down / in maintenance /
 *    unreachable. 2026-10-14 07:15-08:35 UTC it answered every login with IIS's
 *    "HTTP Error 503. The service is unavailable." HTML page. Retry next run.
 *  - login_limit: Acumatica refused a new API session ("API Login Limit"). Retry
 *    next run; our expired sessions are logged out by retireExpiredSessions().
 *  - credentials: Acumatica rejected the user name / password. NOT retryable —
 *    the owner has to fix the sync credentials (repeating it can lock the user).
 */
export type AcumaticaAccessKind = 'unavailable' | 'login_limit' | 'credentials';

export class AcumaticaAccessError extends Error {
  kind: AcumaticaAccessKind;
  status: number | null;
  retryable: boolean;

  constructor(kind: AcumaticaAccessKind, status: number | null, message: string) {
    super(message);
    this.name = 'AcumaticaAccessError';
    this.kind = kind;
    this.status = status;
    this.retryable = kind !== 'credentials';
  }
}

export const isAcumaticaAccessError = (e: unknown): e is AcumaticaAccessError =>
  e instanceof AcumaticaAccessError || (e as any)?.name === 'AcumaticaAccessError';

/** One readable line out of whatever Acumatica (or the IIS in front of it) sent back. */
export function summarizeAcumaticaBody(body: string): string {
  const t = (body || '').trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      return String(j.exceptionMessage || j.message || t).replace(/\s+/g, ' ').slice(0, 200);
    } catch { /* fall through */ }
  }
  if (t.startsWith('<')) {
    const title = t.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const detail = t.match(/HTTP Error \d{3}[^<]*/i)?.[0]?.trim();
    return [title, detail].filter(Boolean).join(' - ') || 'HTML page';
  }
  return t.replace(/\s+/g, ' ').slice(0, 200);
}

const LOGIN_LIMIT_RE = /login limit|concurrent (api )?(sessions|logins|users)|maximum number of (api )?(sessions|logins|users)/i;
const CREDENTIALS_RE = /invalid credentials|user ?name or password|password (has )?expired|account (is )?(locked|disabled)|locked out|user is (disabled|inactive)/i;

/**
 * Classify a failed Acumatica response. Returns an AcumaticaAccessError for the
 * "Acumatica is not there / will not let us in" cases, or null when it is an
 * ordinary error the caller should report as such.
 */
export function classifyAcumaticaFailure(status: number, body: string, isLogin = false): AcumaticaAccessError | null {
  const summary = summarizeAcumaticaBody(body);
  if (LOGIN_LIMIT_RE.test(summary)) {
    return new AcumaticaAccessError('login_limit', status, `Acumatica API login limit reached (HTTP ${status}: ${summary})`);
  }
  if (isLogin && CREDENTIALS_RE.test(summary)) {
    return new AcumaticaAccessError('credentials', status, `Acumatica rejected the sync login (HTTP ${status}: ${summary})`);
  }
  const isHtml = (body || '').trim().startsWith('<');
  if (status === 502 || status === 503 || status === 504 || status === 429 || isHtml) {
    return new AcumaticaAccessError('unavailable', status, `Acumatica unavailable (HTTP ${status}: ${summary})`);
  }
  return null;
}

/**
 * What a sync function answers when it could not reach Acumatica at all.
 * Retryable (down / maintenance / login limit): HTTP 200 + skipped:true, one
 * warning line, nothing marked failed; the next cron run simply tries again.
 * Credentials rejected: HTTP 502 + one error line naming the owner action.
 */
export function acumaticaAccessResponse(err: AcumaticaAccessError, entity: string, headers: Record<string, string>): Response {
  const body = {
    success: false,
    skipped: true,
    reason: err.kind,
    acumaticaStatus: err.status,
    error: err.retryable
      ? `skipped: ${err.message}; the next run will retry`
      : `${err.message}. Owner action needed: fix the Acumatica sync user/password (acumatica_sync_credentials) - syncing is stopped until then`,
  };
  if (err.retryable) {
    console.warn(`[${entity}-sync] ${body.error}`);
  } else {
    console.error(`[${entity}-sync] ${body.error}`);
  }
  return new Response(JSON.stringify(body), {
    status: err.retryable ? 200 : 502,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
