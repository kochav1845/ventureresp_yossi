// Auto-provisions an email-app inbox account for the signed-in Venture user, so
// every user in an org that has email configured lands in the embedded inbox
// without any manual setup. Idempotent: if the user is already linked it no-ops.
// Called by the Mailbox on load with the user's session.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const genPw = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map((n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62])
    .join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await sb.auth.getUser((req.headers.get("Authorization") || "").replace("Bearer ", ""));
    if (!user?.email) return j({ ok: false, reason: "not signed in" }, 401);
    const email = user.email;

    // Only for orgs that actually have the embedded email system configured.
    const { data: prof } = await sb.from("user_profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) return j({ ok: false, reason: "no org" });
    const { data: oes } = await sb.from("org_email_settings").select("organization_id").eq("organization_id", orgId).maybeSingle();
    if (!oes) return j({ ok: false, reason: "email not configured for org" });

    // Already linked -> nothing to do.
    const { data: cred } = await sb.from("user_inbox_credentials").select("inbox_password").eq("user_id", user.id).maybeSingle();
    if (cred?.inbox_password) return j({ ok: true, already: true });

    const EURL = Deno.env.get("EMAIL_APP_URL")!;
    const EKEY = Deno.env.get("EMAIL_SERVICE_KEY")!;
    const H = { apikey: EKEY, Authorization: `Bearer ${EKEY}`, "Content-Type": "application/json" };
    const pw = genPw();

    // Create the email-app account (or reset the password if it already exists).
    let res = await fetch(`${EURL}/auth/v1/admin/users`, {
      method: "POST", headers: H, body: JSON.stringify({ email, password: pw, email_confirm: true }),
    });
    if (res.status === 422 || res.status === 409) {
      const list = await (await fetch(`${EURL}/auth/v1/admin/users?per_page=200`, { headers: H })).json();
      const arr = list.users || list || [];
      const existing = arr.find((x: any) => (x.email || "").toLowerCase() === email.toLowerCase());
      if (!existing) return j({ ok: false, reason: "email exists but not found" });
      const r2 = await fetch(`${EURL}/auth/v1/admin/users/${existing.id}`, {
        method: "PUT", headers: H, body: JSON.stringify({ password: pw, email_confirm: true }),
      });
      if (!r2.ok) return j({ ok: false, reason: "reset failed", detail: await r2.text() });
    } else if (!res.ok) {
      return j({ ok: false, reason: "create failed", detail: await res.text() });
    }

    await sb.from("user_inbox_credentials").upsert(
      { user_id: user.id, inbox_email: email, inbox_password: pw, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return j({ ok: true, provisioned: true });
  } catch (e) {
    return j({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
