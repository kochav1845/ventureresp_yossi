// Auto-provisions the signed-in Venture user's email identity so opening the
// inbox "just works": a dedicated <slug>@venture.stardev.dev login (isolated
// from any personal email account), a personal alias, and membership in the
// shared/general mailboxes (ar@ / credit@ / info@) that the whole team sees.
// Idempotent -- safe to call on every inbox open. Called by Mailbox on load.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const slugify = (email: string) => {
  const local = (email.split("@")[0] || "").toLowerCase();
  return local.replace(/[^a-z0-9._-]/g, "") || "user";
};
const genpw = () => {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => a[b % a.length]).join("");
};

async function getOrCreateUser(admin: any, email: string, pw: string) {
  const { data: created } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (created?.user) return { id: created.user.id as string, created: true };
  // Already exists -> find its id by paging the user list.
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = (data?.users || []).find((x: any) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) return { id: u.id as string, created: false };
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  throw new Error("account lookup failed after create conflict");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // --- Venture side (this project) ---
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await sb.auth.getUser((req.headers.get("Authorization") || "").replace("Bearer ", ""));
    if (!user?.email) return j({ ok: false, reason: "not signed in" }, 401);

    const { data: prof } = await sb.from("user_profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) return j({ ok: false, reason: "no org" });
    const { data: oes } = await sb.from("org_email_settings").select("organization_id").eq("organization_id", orgId).maybeSingle();
    if (!oes) return j({ ok: false, reason: "email not configured for org" });

    // --- Email app side (cross-project, service role) ---
    const emailUrl = Deno.env.get("EMAIL_PROJECT_URL");
    const emailKey = Deno.env.get("EMAIL_SERVICE_ROLE_KEY");
    const domain = Deno.env.get("VENTURE_EMAIL_DOMAIN") || "venture.stardev.dev";
    const general = (Deno.env.get("GENERAL_MAILBOXES") || "ar,credit,info")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!emailUrl || !emailKey) return j({ ok: false, reason: "email project not configured" });
    const em = createClient(emailUrl, emailKey);

    const { data: dom } = await em.from("user_domains").select("id, user_id").eq("domain", domain).maybeSingle();
    if (!dom) return j({ ok: false, reason: "domain not provisioned in email app" });
    const domainId = dom.id, owner = dom.user_id;

    const slug = slugify(user.email);
    const reserved = general.includes(slug);
    const login = reserved ? `u-${user.id.slice(0, 8)}@${domain}` : `${slug}@${domain}`;

    // Ensure the dedicated login account + point the venture user at it.
    const { data: cred } = await sb.from("user_inbox_credentials").select("inbox_email").eq("user_id", user.id).maybeSingle();
    let acct: string;
    if (cred?.inbox_email === login) {
      // Already pointed here: don't churn the password, just resolve the id.
      const found = await getOrCreateUser(em, login, genpw());
      acct = found.id;
    } else {
      const pw = genpw();
      const gc = await getOrCreateUser(em, login, pw);
      acct = gc.id;
      if (!gc.created) await em.auth.admin.updateUserById(acct, { password: pw, email_confirm: true });
      await sb.from("user_inbox_credentials").upsert(
        { user_id: user.id, inbox_email: login, inbox_password: pw, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    }

    // Ensure general/shared aliases exist, collect their ids.
    const aliasIds: string[] = [];
    for (const g of general) {
      const addr = `${g}@${domain}`;
      await em.from("email_aliases").upsert(
        { alias_email: addr, user_id: owner, domain_id: domainId, is_active: true, is_default: false, display_name: g.toUpperCase() },
        { onConflict: "alias_email" },
      );
      const { data: ga } = await em.from("email_aliases").select("id").eq("alias_email", addr).maybeSingle();
      if (ga?.id) aliasIds.push(ga.id);
    }

    // Personal alias (skip for reserved-slug role accounts).
    if (!reserved) {
      const personal = `${slug}@${domain}`;
      await em.from("email_aliases").upsert(
        { alias_email: personal, user_id: acct, domain_id: domainId, is_active: true, is_default: true, display_name: slug },
        { onConflict: "alias_email" },
      );
      const { data: pa } = await em.from("email_aliases").select("id").eq("alias_email", personal).maybeSingle();
      if (pa?.id) aliasIds.push(pa.id);
    }

    // Grant membership in every alias this user should see.
    for (const aid of aliasIds) {
      await em.from("alias_users").upsert(
        { auth_user_id: acct, alias_id: aid, is_approved: true, approved_at: new Date().toISOString() },
        { onConflict: "auth_user_id,alias_id" },
      );
    }

    return j({ ok: true, login, reserved, aliases: aliasIds.length });
  } catch (e) {
    return j({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
