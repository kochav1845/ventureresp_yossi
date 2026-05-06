import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function countFromAcumatica(
  sessionManager: AcumaticaSessionManager,
  credentials: any,
  acumaticaUrl: string,
  type: string,
  status: string
): Promise<{ count: number; totalBalance: number; totalAmount: number }> {
  const filter = `Type eq '${type}' and Status eq '${status}'`;
  let skip = 0;
  const top = 1000;
  let count = 0;
  let totalBalance = 0;
  let totalAmount = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Balance,Amount&$top=${top}&$skip=${skip}&$orderby=ReferenceNbr asc`;

    const response = await sessionManager.makeAuthenticatedRequest(credentials, url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error for ${type}/${status}: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];

    for (const item of items) {
      count++;
      totalBalance += Number(item.Balance?.value || 0);
      totalAmount += Number(item.Amount?.value || 0);
    }

    hasMore = items.length >= top;
    skip += top;
  }

  return { count, totalBalance, totalAmount };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const filterType = body.type || null;
    const filterStatus = body.status || null;

    const { data: config } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!config?.acumatica_url || !config?.username || !config?.password) {
      return new Response(
        JSON.stringify({ error: "Acumatica credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const acumaticaUrl = config.acumatica_url.startsWith("http")
      ? config.acumatica_url
      : `https://${config.acumatica_url}`;

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);
    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || "",
      branch: config.branch || "",
    };

    const typeStatusPairs: { type: string; status: string }[] = [];

    if (filterType && filterStatus) {
      typeStatusPairs.push({ type: filterType, status: filterStatus });
    } else if (filterType) {
      const statuses = ["Open", "Closed", "Balanced", "On Hold", "Credit Hold", "Canceled", "Voided", "Scheduled"];
      for (const s of statuses) {
        typeStatusPairs.push({ type: filterType, status: s });
      }
    } else {
      const pairs = [
        { type: "Invoice", status: "Open" },
        { type: "Invoice", status: "Balanced" },
        { type: "Invoice", status: "On Hold" },
        { type: "Invoice", status: "Credit Hold" },
        { type: "Invoice", status: "Scheduled" },
        { type: "Credit Memo", status: "Open" },
        { type: "Credit Memo", status: "Balanced" },
        { type: "Debit Memo", status: "Open" },
        { type: "Debit Memo", status: "Closed" },
        { type: "Credit WO", status: "Closed" },
        { type: "Overdue Charge", status: "Open" },
      ];
      typeStatusPairs.push(...pairs);
    }

    const results: Record<string, Record<string, { acumatica: { count: number; balance: number; amount: number }; db: { count: number; balance: number; amount: number }; diff: { count: number; balance: number; amount: number } }>> = {};
    const summary = { acumaticaTotal: 0, dbTotal: 0, totalCountDiff: 0, totalBalanceDiff: 0 };

    for (const pair of typeStatusPairs) {
      console.log(`Querying Acumatica: ${pair.type} / ${pair.status}...`);
      const acResult = await countFromAcumatica(sessionManager, credentials, acumaticaUrl, pair.type, pair.status);

      const { count: exactCount } = await supabase
        .from("acumatica_invoices")
        .select("*", { count: "exact", head: true })
        .eq("type", pair.type)
        .eq("status", pair.status);

      const dbCount = exactCount || 0;

      const { data: dbAggRows } = await supabase
        .from("acumatica_invoices")
        .select("balance, amount")
        .eq("type", pair.type)
        .eq("status", pair.status)
        .limit(50000);

      let dbBalance = 0;
      let dbAmount = 0;
      if (dbAggRows) {
        for (const row of dbAggRows) {
          dbBalance += Number(row.balance || 0);
          dbAmount += Number(row.amount || 0);
        }
      }

      if (!results[pair.type]) results[pair.type] = {};
      results[pair.type][pair.status] = {
        acumatica: { count: acResult.count, balance: Math.round(acResult.totalBalance * 100) / 100, amount: Math.round(acResult.totalAmount * 100) / 100 },
        db: { count: dbCount, balance: Math.round(dbBalance * 100) / 100, amount: Math.round(dbAmount * 100) / 100 },
        diff: { count: acResult.count - dbCount, balance: Math.round((acResult.totalBalance - dbBalance) * 100) / 100, amount: Math.round((acResult.totalAmount - dbAmount) * 100) / 100 },
      };

      summary.acumaticaTotal += acResult.count;
      summary.dbTotal += dbCount;
      summary.totalCountDiff += acResult.count - dbCount;

      console.log(`  ${pair.type}/${pair.status}: Acumatica=${acResult.count}, DB=${dbCount}, diff=${acResult.count - dbCount}`);
    }

    return new Response(
      JSON.stringify({ success: true, summary, results }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error comparing invoice totals:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
