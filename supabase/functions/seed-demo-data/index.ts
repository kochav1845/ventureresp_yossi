import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEMO_ORG_ID = "cc534e42-cf01-42a0-9337-afd66aca67a7";

const DEMO_USERS = [
  { email: "sarah.johnson@demo.com", name: "Sarah Johnson", role: "manager", color: "#10B981" },
  { email: "mike.chen@demo.com", name: "Mike Chen", role: "collector", color: "#3B82F6" },
  { email: "jessica.rivera@demo.com", name: "Jessica Rivera", role: "collector", color: "#F59E0B" },
  { email: "david.thompson@demo.com", name: "David Thompson", role: "collector", color: "#EF4444" },
  { email: "rachel.williams@demo.com", name: "Rachel Williams", role: "collector", color: "#8B5CF6" },
  { email: "tom.anderson@demo.com", name: "Tom Anderson", role: "collector", color: "#06B6D4" },
  { email: "lisa.martinez@demo.com", name: "Lisa Martinez", role: "secretary", color: "#EC4899" },
  { email: "james.wilson@demo.com", name: "James Wilson", role: "viewer", color: "#6B7280" },
];

const CUSTOMER_NAMES = [
  "Sunrise Healthcare Group", "Mountain View Medical Center", "Pacific Coast Rehabilitation",
  "Valley General Hospital", "Cedar Creek Nursing Home", "Lakeside Senior Living",
  "Greenfield Medical Associates", "Riverside Community Health", "Summit Care Partners",
  "Coastal Wellness Center", "Heritage Health Services", "Pinewood Recovery Center",
  "Golden State Home Health", "Meadowbrook Assisted Living", "Northstar Medical Group",
  "Bayview Rehabilitation", "Harmony Health Systems", "Crestwood Care Facility",
  "Silver Lining Hospice", "Parkside Medical Plaza", "Willowbrook Senior Care",
  "Eagle Rock Health Center", "Horizon Home Health", "Maple Grove Rehabilitation",
  "Clearwater Medical Group", "Stonebridge Nursing", "Redwood Health Partners",
  "Aspen Care Services", "Brookdale Medical Center", "Sunflower Home Health",
  "Oceanview Rehabilitation", "Prairie Health Associates", "Canyon Ridge Medical",
  "Birchwood Senior Living", "Falcon Medical Group", "Evergreen Health Systems",
  "Windmill Care Facility", "Sapphire Health Services", "Timberline Medical Center",
  "Crystal Springs Rehab", "Landmark Health Group", "Dogwood Medical Associates",
  "Summit Peak Healthcare", "Riverbend Nursing Home", "Starlight Senior Care",
  "Blue Ridge Medical Center", "Whispering Pines Health", "Ironwood Rehabilitation",
  "Magnolia Care Partners", "Coral Bay Health Services", "Westwind Medical Group",
  "Foxglove Senior Living", "Desert Rose Healthcare", "Thunderbird Medical Center",
  "Ivy League Health", "Sandstone Rehabilitation", "Wildflower Home Health",
  "Granite Peak Medical", "Primrose Care Facility", "Cascade Health Systems",
  "Mariposa Medical Group", "Sequoia Health Partners", "Bluebell Senior Care",
  "Cloverfield Medical", "Hawthorne Health Services", "Sycamore Rehabilitation",
  "Palmetto Medical Center", "Juniper Health Group", "Cottonwood Care Services",
  "Laurel Creek Medical", "Fern Valley Health", "Alder Grove Rehabilitation",
  "Peachtree Medical Center", "Holly Hill Health Center", "Elm Street Medical",
  "Cypress Point Healthcare", "Walnut Creek Senior", "Olive Branch Health",
  "Cherry Blossom Medical", "Hickory Ridge Care", "Poplar Springs Rehab",
  "Spruce Mountain Health", "Willow Bank Medical", "Dogwood Lane Senior Care",
  "Hazelnut Health Group", "Mulberry Medical Center", "Chestnut Hill Rehab",
  "Rosemary Health Services", "Lilac Ridge Medical", "Sunstone Care Partners",
  "Amber Wave Healthcare", "Cobalt Medical Group", "Jade Valley Health",
  "Ruby Creek Rehabilitation", "Opal Ridge Medical", "Topaz Senior Living",
  "Emerald Isle Health", "Pearl Harbor Medical", "Quartz Mountain Care",
];

const STATUSES = ["Open", "Open", "Open", "Open", "Closed", "Closed", "Closed"];
const TYPES = ["Invoice", "Invoice", "Invoice", "Invoice", "Invoice", "Credit Memo", "Debit Memo"];
const PRIORITIES = ["low", "medium", "medium", "high", "urgent"];
const TICKET_STATUSES = ["open", "open", "open", "in_progress", "in_progress", "resolved", "closed"];
const TICKET_TYPES = ["overdue payment", "overdue payment", "disputed invoice", "payment plan", "follow-up", "escalation"];

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split("T")[0];
}

function randomDatetime(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { step = "all" } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: any = {};

    // Step 1: Create users
    if (step === "all" || step === "users") {
      const created: string[] = [];
      const errors: string[] = [];
      for (const user of DEMO_USERS) {
        const { data: existing } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();

        if (existing) {
          created.push(`${user.email} (existed)`);
          continue;
        }

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: "demo1234",
          email_confirm: true,
          user_metadata: { full_name: user.name, org_slug: "demo" },
        });

        if (authError) {
          errors.push(`${user.email}: ${authError.message}`);
          continue;
        }

        const { error: updateError } = await supabase.from("user_profiles").update({
          role: user.role,
          full_name: user.name,
          organization_id: DEMO_ORG_ID,
          account_status: "approved",
          assigned_color: user.color,
          can_be_assigned_as_collector: user.role === "collector" || user.role === "manager",
        }).eq("id", authData.user.id);

        if (updateError) {
          errors.push(`${user.email} profile update: ${updateError.message}`);
        }

        created.push(`${user.email} (new: ${authData.user.id})`);
      }
      results.users = { created, errors };
    }

    // Step 2: Create customers
    if (step === "all" || step === "customers") {
      const customers: any[] = [];
      const existingCount = await supabase
        .from("acumatica_customers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", DEMO_ORG_ID);

      if ((existingCount.count || 0) < 100) {
        for (let i = 0; i < 500; i++) {
          const baseName = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length];
          const suffix = i >= CUSTOMER_NAMES.length ? ` - Branch ${Math.floor(i / CUSTOMER_NAMES.length) + 1}` : "";
          const custId = `DEMO${String(i + 1).padStart(5, "0")}`;
          customers.push({
            customer_id: custId,
            customer_name: `${baseName}${suffix}`,
            status: "Active",
            organization_id: DEMO_ORG_ID,
            terms: ["Net 30", "Net 45", "Net 60", "Net 90"][randomBetween(0, 3)],
            credit_limit: randomBetween(5000, 500000),
            balance: randomBetween(0, 100000),
          });
        }

        const BATCH = 100;
        for (let i = 0; i < customers.length; i += BATCH) {
          await supabase.from("acumatica_customers").upsert(
            customers.slice(i, i + BATCH),
            { onConflict: "customer_id" }
          );
        }
      }
      results.customers = { total: 500 };
    }

    return new Response(
      JSON.stringify({ success: true, step, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
