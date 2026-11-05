// The owner's side of "ask the bot for a change" (owner 2026-11-05): the text he
// gets, and the YES / NO he answers with. The chat lives in the app's AI widget;
// the bot and the build run on the owner's PC (C:\Users\yosef\vr-devbot).
// Schema: migration 20261105120000_change_bot.sql.
//
//   POST from Twilio (SMS webhook of +1 845-999-0844, a number used for nothing
//   else -- the Invites/OpsCenter number +1 845-393-2608 is on a Twilio account
//   whose credentials return 401, so this does not go near it):
//     "YES"            -> the change in the last text sent goes live
//     "YES 48213"      -> that one by its code
//     "NO make it blue" -> back to the bot with the note
//     "NO"             -> turned down
//   Only from DEVBOT_OWNER_PHONE, and only for a request in waiting_approval.
//
//   POST {action:'text', request_id, kind:'approve'|'done'|'failed', detail?}
//   from the PC worker, header x-devbot-key = DEVBOT_KEY.
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DEVBOT_KEY,
//          DEVBOT_SMS_FROM (default +18459990844),
//          DEVBOT_OWNER_PHONE (default +13478893351).
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OWNER = () => Deno.env.get('DEVBOT_OWNER_PHONE') || '+13478893351';
const FROM = () => Deno.env.get('DEVBOT_SMS_FROM') || '+18459990844';

const db = () => createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const digits = (p: unknown) => String(p ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const cut = (s: unknown, n: number) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const twiml = (reply?: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${reply ? `<Message>${xmlEsc(reply)}</Message>` : ''}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Twilio signs the URL plus the sorted form fields. */
async function validTwilio(sig: string | null, url: string, params: Record<string, string>): Promise<boolean> {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  if (!token || !sig) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expect = await hmacSha1Base64(token, data);
  // Constant-time-ish compare.
  if (expect.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  if (!sid || !token) { console.error('change-bot: Twilio credentials are not set'); return false; }
  const form = new URLSearchParams({ To: to, From: FROM(), Body: body });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!r.ok) console.error('change-bot: Twilio send failed', r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const ctype = req.headers.get('content-type') || '';

  // ── The PC worker asking for a text to be sent ──────────────────────────
  if (ctype.includes('application/json')) {
    const key = req.headers.get('x-devbot-key') || '';
    const expected = Deno.env.get('DEVBOT_KEY') || '';
    if (!expected || key !== expected) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'text') return json({ error: 'Unknown action' }, 400);

    const rid = Number(body.request_id);
    if (!Number.isFinite(rid)) return json({ error: 'request_id required' }, 400);

    const sb = db();
    const { data: r } = await sb.from('devbot_requests')
      .select('id, title, summary, server, approval_code, preview_url, status, requester_email')
      .eq('id', rid).maybeSingle();
    if (!r) return json({ error: 'No such request' }, 404);

    let text: string;
    if (body.kind === 'approve') {
      text = `VentureResp change #${r.id}\n${cut(r.title, 90)}\n\n${cut(r.summary, 420)}`
        + (r.server ? `\n\nServer: ${cut(r.server, 180)}` : '')
        + (r.preview_url ? `\n\nPreview: ${r.preview_url}` : '')
        + `\n\nReply YES ${r.approval_code} to put it live, or NO plus what to change.`;
    } else if (body.kind === 'done') {
      text = `VentureResp change #${r.id} is live.\n${cut(r.title, 90)}`;
    } else if (body.kind === 'failed') {
      text = `VentureResp change #${r.id} could not go live.\n${cut(r.title, 90)}\n${cut(body.detail, 300)}`;
    } else {
      return json({ error: 'Unknown kind' }, 400);
    }

    const ok = await sendSms(OWNER(), text);
    return json({ sent: ok });
  }

  // ── Twilio inbound ──────────────────────────────────────────────────────
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  // Twilio signs the exact URL configured on the number. Behind the Supabase
  // edge, req.url is not that URL, so check the candidates it could be rather
  // than guessing one.
  const u = new URL(req.url);
  const fwdHost = req.headers.get('x-forwarded-host');
  const candidates = [
    `${SB_URL}/functions/v1/change-bot`,
    fwdHost ? `https://${fwdHost}${u.pathname}` : '',
    `https://${u.host}${u.pathname}`,
    u.toString(),
  ].filter(Boolean);

  const sig = req.headers.get('x-twilio-signature');
  let signedOk = false;
  for (const c of candidates) {
    if (await validTwilio(sig, c, params)) { signedOk = true; break; }
  }
  if (!signedOk) {
    console.error('change-bot: bad Twilio signature; tried', JSON.stringify(candidates));
    return json({ error: 'Bad signature', tried: Deno.env.get('DEVBOT_DEBUG') === '1' ? candidates : undefined }, 403);
  }

  const from = digits(params.From);
  if (from !== digits(OWNER())) {
    // Not the approver. Say nothing rather than confirm the number exists.
    return twiml();
  }

  const said = String(params.Body || '').trim();
  const m = /^(yes|y|no|n)\b[\s,.:-]*(\d{4,6})?\s*(.*)$/is.exec(said);
  if (!m) return twiml('Reply YES <code> to put a change live, or NO plus what to change.');

  const yes = /^y/i.test(m[1]);
  const code = m[2] || null;
  const note = (m[3] || '').trim();

  const sb = db();
  let q = sb.from('devbot_requests')
    .select('id, title, approval_code')
    .eq('status', 'waiting_approval')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (code) q = q.eq('approval_code', code);

  const { data: rows } = await q;
  const r = rows?.[0];
  if (!r) {
    return twiml(code
      ? `No change is waiting with code ${code}.`
      : 'No change is waiting for approval.');
  }

  if (yes) {
    await sb.from('devbot_requests')
      .update({ status: 'approved', approval_code: null, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    await sb.from('devbot_messages').insert({
      request_id: r.id, role: 'owner', body: 'Approved by text.', handled: true,
    });
    return twiml(`Putting change #${r.id} live. You will get a text when it is done.`);
  }

  if (note) {
    await sb.from('devbot_requests')
      .update({ status: 'new', approval_code: null, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    await sb.from('devbot_messages').insert([
      { request_id: r.id, role: 'owner', body: note, handled: false },
      { request_id: r.id, role: 'system', body: 'Sent back to the bot by text.', handled: true },
    ]);
    return twiml(`Sent change #${r.id} back to the bot with your note.`);
  }

  await sb.from('devbot_requests')
    .update({ status: 'rejected', approval_code: null, updated_at: new Date().toISOString() })
    .eq('id', r.id);
  await sb.from('devbot_messages').insert({
    request_id: r.id, role: 'owner', body: 'Turned down by text.', handled: true,
  });
  return twiml(`Change #${r.id} turned down.`);
});
