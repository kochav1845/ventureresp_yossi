import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Rule {
  id: string;
  organization_id: string | null;
  rule_type: string;
  conditions: Record<string, unknown>;
  assignee_strategy: string;
  default_assignee_id: string | null;
  offset_days: number;
  offset_hours: number;
  priority: string;
  reminder_type: string;
  title_template: string;
  description_template: string;
  gpt_prompt: string;
  gpt_model: string;
}

interface InboundEmail {
  id: string;
  sender_email: string;
  subject: string;
  body: string;
  customer_id: string | null;
  acumatica_reference_number: string | null;
  acumatica_customer_name: string | null;
  raw_data: Record<string, unknown> | null;
}

interface QueueRow {
  id: string;
  inbound_email_id: string;
  rule_id: string;
  organization_id: string | null;
}

function renderTemplate(
  template: string,
  email: InboundEmail,
  customerName: string,
  invoiceReference: string,
): string {
  return (template ?? "")
    .replaceAll("{sender_email}", email.sender_email ?? "")
    .replaceAll("{subject}", email.subject ?? "")
    .replaceAll("{customer_name}", customerName ?? "")
    .replaceAll("{invoice_reference}", invoiceReference ?? "");
}

async function evaluateGptRule(
  rule: Rule,
  email: InboundEmail,
  openaiKey: string,
): Promise<{ matches: boolean; reasoning: string }> {
  const userPrompt = `Evaluate whether this email should trigger a reminder based on the following criteria:

CRITERIA:
${rule.gpt_prompt}

EMAIL:
From: ${email.sender_email}
Subject: ${email.subject}
Body: ${email.body}

Return strictly valid JSON with the shape: {"matches": boolean, "reasoning": string}.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: rule.gpt_model || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that decides whether an email should generate a follow-up reminder. Always respond with valid JSON only.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 300,
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI error ${resp.status}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  return {
    matches: Boolean(parsed.matches),
    reasoning: String(parsed.reasoning ?? ""),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: queue, error: queueErr } = await supabase
      .from("pending_gpt_rule_evaluations")
      .select("id, inbound_email_id, rule_id, organization_id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);

    if (queueErr) throw queueErr;

    const results: Array<Record<string, unknown>> = [];

    for (const item of (queue ?? []) as QueueRow[]) {
      await supabase
        .from("pending_gpt_rule_evaluations")
        .update({ status: "processing" })
        .eq("id", item.id);

      try {
        const { data: rule, error: ruleErr } = await supabase
          .from("proposed_reminder_rules")
          .select("*")
          .eq("id", item.rule_id)
          .maybeSingle();
        if (ruleErr || !rule) throw new Error("Rule not found");

        const { data: email, error: emailErr } = await supabase
          .from("inbound_emails")
          .select(
            "id, sender_email, subject, body, customer_id, acumatica_reference_number, acumatica_customer_name, raw_data",
          )
          .eq("id", item.inbound_email_id)
          .maybeSingle();
        if (emailErr || !email) throw new Error("Email not found");

        if (!openaiKey) {
          throw new Error("OPENAI_API_KEY not configured");
        }

        const evalResult = await evaluateGptRule(rule as Rule, email as InboundEmail, openaiKey);

        if (evalResult.matches) {
          let invoiceId: string | null = null;
          if (email.acumatica_reference_number) {
            const { data: inv } = await supabase
              .from("acumatica_invoices")
              .select("id")
              .eq("reference_number", email.acumatica_reference_number)
              .maybeSingle();
            invoiceId = inv?.id ?? null;
          }

          let assignee = rule.default_assignee_id;
          if (rule.assignee_strategy === "customer_collector" && email.customer_id) {
            const { data: assignment } = await supabase
              .from("collector_customer_assignments")
              .select("assigned_collector_id")
              .eq("customer_id", email.customer_id)
              .maybeSingle();
            assignee = assignment?.assigned_collector_id ?? rule.default_assignee_id;
          }

          const customerName = email.acumatica_customer_name ?? "";
          const invoiceRef = email.acumatica_reference_number ?? "";
          const reminderDate = new Date(
            Date.now() +
              rule.offset_days * 86_400_000 +
              rule.offset_hours * 3_600_000,
          ).toISOString();

          await supabase.from("invoice_reminders").insert({
            user_id: assignee,
            invoice_id: invoiceId,
            invoice_reference_number: email.acumatica_reference_number,
            reminder_date: reminderDate,
            title: renderTemplate(rule.title_template, email as InboundEmail, customerName, invoiceRef),
            description: renderTemplate(rule.description_template, email as InboundEmail, customerName, invoiceRef),
            priority: rule.priority,
            reminder_type: rule.reminder_type,
            is_proposed: true,
            proposal_status: "pending",
            source_email_id: email.id,
            proposed_by_rule_id: rule.id,
          });
        }

        await supabase
          .from("pending_gpt_rule_evaluations")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
            error_message: evalResult.matches ? null : `No match: ${evalResult.reasoning}`,
          })
          .eq("id", item.id);

        results.push({ id: item.id, matches: evalResult.matches });
      } catch (err) {
        await supabase
          .from("pending_gpt_rule_evaluations")
          .update({
            status: "error",
            processed_at: new Date().toISOString(),
            error_message: (err as Error).message,
          })
          .eq("id", item.id);
        results.push({ id: item.id, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
