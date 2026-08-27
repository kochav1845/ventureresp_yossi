import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Public signup for non-demo orgs. Creates the auth account with the password the
// user CHOSE (email pre-confirmed), then files a pending_users request. Access stays
// gated by pending_users (the sign-in page blocks pending/declined) until an admin
// approves — approval then just unlocks it, so the user logs in with THEIR password
// (no throwaway temporary password).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const { email, password, full_name, org_slug } = await req.json().catch(() => ({}));
    if (!email || !password) return json({ success: false, error: "Email and password are required" });
    if (String(password).length < 6) return json({ success: false, error: "Password must be at least 6 characters" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Already requested?
    const { data: existing } = await admin.from("pending_users").select("id").eq("email", email).maybeSingle();
    if (existing) {
      return json({ success: false, error: "An account request with this email already exists. Please check your status or contact an administrator." });
    }

    // Create the account with the user's chosen password (email pre-confirmed).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "", org_slug: org_slug || "" },
    });
    if (createErr) {
      const msg = /already|registered|exists/i.test(createErr.message || "")
        ? "An account with this email already exists."
        : (createErr.message || "Could not create account");
      return json({ success: false, error: msg });
    }

    // Resolve org for the pending row (the profile trigger also sets it from org_slug).
    let orgId: string | null = null;
    if (org_slug) {
      const { data: org } = await admin.from("organizations").select("id").eq("slug", org_slug).maybeSingle();
      orgId = org?.id || null;
    }

    const { error: pendErr } = await admin.from("pending_users").insert({
      full_name: full_name || "", email, status: "pending", organization_id: orgId,
    });
    if (pendErr) return json({ success: false, error: pendErr.message });

    return json({ success: true, user_id: created.user?.id });
  } catch (e: any) {
    return json({ success: false, error: String(e?.message || e) }, 500);
  }
});
