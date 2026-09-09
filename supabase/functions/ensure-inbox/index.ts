// Points the signed-in Venture user at the org's SHARED team inbox, so everyone
// in an org that has email configured opens the same mailbox (e.g. the shared
// venture.stardev.dev / ar@ inbox) with no manual setup. Idempotent.
// Called by the Mailbox on load with the user's session.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await sb.auth.getUser((req.headers.get("Authorization") || "").replace("Bearer ", ""));
    if (!user?.email) return j({ ok: false, reason: "not signed in" }, 401);

    // Only for orgs that have the embedded email system configured.
    const { data: prof } = await sb.from("user_profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) return j({ ok: false, reason: "no org" });
    const { data: oes } = await sb.from("org_email_settings").select("organization_id").eq("organization_id", orgId).maybeSingle();
    if (!oes) return j({ ok: false, reason: "email not configured for org" });

    const sharedEmail = Deno.env.get("SHARED_INBOX_EMAIL");
    const sharedPw = Deno.env.get("SHARED_INBOX_PASSWORD");
    if (!sharedEmail || !sharedPw) return j({ ok: false, reason: "shared inbox not configured" });

    // Already pointed at the shared inbox -> nothing to do.
    const { data: cred } = await sb.from("user_inbox_credentials").select("inbox_email").eq("user_id", user.id).maybeSingle();
    if (cred?.inbox_email === sharedEmail) return j({ ok: true, already: true });

    await sb.from("user_inbox_credentials").upsert(
      { user_id: user.id, inbox_email: sharedEmail, inbox_password: sharedPw, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return j({ ok: true, linked: true });
  } catch (e) {
    return j({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
