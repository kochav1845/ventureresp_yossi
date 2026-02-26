import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendEmailResult {
  assignment_id: string;
  customer_id: string;
  customer_name: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  scheduled_time?: string;
}

const getTimeInTimezone = (timezone: string): { day: number; hour: number; minute: number; year: number; month: number } => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
  };
};

const isTimeToSend = (
  startDayOfMonth: number,
  scheduleDay: number,
  sendTime: string,
  timezone: string
): boolean => {
  const tz = getTimeInTimezone(timezone);

  const targetDayOfMonth = startDayOfMonth + (scheduleDay - 1);
  const daysInMonth = new Date(tz.year, tz.month, 0).getDate();

  let effectiveTargetDay = targetDayOfMonth;
  if (effectiveTargetDay > daysInMonth) {
    effectiveTargetDay = daysInMonth;
  }

  if (tz.day !== effectiveTargetDay) {
    return false;
  }

  const [schedHour, schedMin] = sendTime.split(':').map(Number);
  const currentMinutes = tz.hour * 60 + tz.minute;
  const scheduledMinutes = schedHour * 60 + schedMin;
  const diffMinutes = Math.abs(currentMinutes - scheduledMinutes);

  return diffMinutes <= 2;
};

const sendEmail = async (
  to: string,
  subject: string,
  body: string,
  fromEmail: string,
  sendgridApiKey: string
): Promise<{ success: boolean; error?: string }> => {
  const emailData = {
    personalizations: [
      {
        to: [{ email: to }],
        subject: subject,
      },
    ],
    from: { email: fromEmail },
    content: [
      {
        type: 'text/html',
        value: body,
      },
    ],
    tracking_settings: {
      click_tracking: {
        enable: false,
        enable_text: false,
      },
      open_tracking: {
        enable: false,
      },
    },
  };

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

const processEmailSchedule = async (
  supabase: any,
  sendgridApiKey: string | undefined,
  fromEmail: string
): Promise<{ results: SendEmailResult[]; debugInfo: any }> => {
  const now = new Date();
  const results: SendEmailResult[] = [];

  const { data: assignments, error: assignmentsError } = await supabase
    .from('customer_assignments')
    .select('id, customer_id, template_id, formula_id, start_day_of_month, timezone, is_active')
    .eq('is_active', true);

  if (assignmentsError) {
    throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`);
  }

  if (!assignments || assignments.length === 0) {
    return { results, debugInfo: { assignmentCount: 0, error: 'No active assignments found' } };
  }

  const customerIds = [...new Set(assignments.map((a: any) => a.customer_id))];
  const formulaIds = [...new Set(assignments.map((a: any) => a.formula_id))];
  const templateIds = [...new Set(assignments.map((a: any) => a.template_id))];

  const [customersRes, formulasRes, templatesRes] = await Promise.all([
    supabase.from('customers').select('id, name, email, is_active, responded_this_month, postpone_until').in('id', customerIds),
    supabase.from('email_formulas').select('id, name, description, schedule').in('id', formulaIds),
    supabase.from('email_templates').select('id, name, subject, body').in('id', templateIds),
  ]);

  if (customersRes.error) throw new Error(`Failed to fetch customers: ${customersRes.error.message}`);
  if (formulasRes.error) throw new Error(`Failed to fetch formulas: ${formulasRes.error.message}`);
  if (templatesRes.error) throw new Error(`Failed to fetch templates: ${templatesRes.error.message}`);

  const customersMap = new Map((customersRes.data || []).map((c: any) => [c.id, c]));
  const formulasMap = new Map((formulasRes.data || []).map((f: any) => [f.id, f]));
  const templatesMap = new Map((templatesRes.data || []).map((t: any) => [t.id, t]));

  const debugInfo = {
    assignmentCount: assignments.length,
    customerCount: customersRes.data?.length || 0,
    formulaCount: formulasRes.data?.length || 0,
    templateCount: templatesRes.data?.length || 0,
  };

  for (const assignment of assignments) {
    const customer = customersMap.get(assignment.customer_id);
    const formula = formulasMap.get(assignment.formula_id);
    const template = templatesMap.get(assignment.template_id);

    if (!customer || !formula || !template) {
      results.push({
        assignment_id: assignment.id,
        customer_id: assignment.customer_id,
        customer_name: customer?.name || 'Unknown',
        status: 'skipped',
        reason: `Missing data: customer=${!!customer}, formula=${!!formula}, template=${!!template}`,
      });
      continue;
    }

    if (!customer.is_active) {
      results.push({
        assignment_id: assignment.id,
        customer_id: customer.id,
        customer_name: customer.name,
        status: 'skipped',
        reason: 'Customer is inactive',
      });
      continue;
    }

    if (customer.postpone_until && new Date(customer.postpone_until) > now) {
      results.push({
        assignment_id: assignment.id,
        customer_id: customer.id,
        customer_name: customer.name,
        status: 'skipped',
        reason: `Postponed until ${customer.postpone_until}`,
      });
      continue;
    }

    if (customer.responded_this_month) {
      results.push({
        assignment_id: assignment.id,
        customer_id: customer.id,
        customer_name: customer.name,
        status: 'skipped',
        reason: 'Customer responded this month',
      });
      continue;
    }

    const schedule = formula.schedule || [];
    for (const scheduleItem of schedule) {
      for (const sendTime of scheduleItem.times || []) {
        const shouldSend = isTimeToSend(
          assignment.start_day_of_month,
          scheduleItem.day,
          sendTime,
          assignment.timezone || 'America/New_York'
        );

        if (shouldSend) {
          const { data: recentLogs } = await supabase
            .from('email_logs')
            .select('id')
            .eq('customer_id', customer.id)
            .eq('assignment_id', assignment.id)
            .gte('sent_at', new Date(now.getTime() - 10 * 60 * 1000).toISOString())
            .limit(1);

          if (recentLogs && recentLogs.length > 0) {
            results.push({
              assignment_id: assignment.id,
              customer_id: customer.id,
              customer_name: customer.name,
              status: 'skipped',
              reason: 'Email already sent within the last 10 minutes',
              scheduled_time: sendTime,
            });
            continue;
          }

          let emailStatus: 'sent' | 'failed' = 'sent';
          let emailError: string | undefined;

          if (sendgridApiKey) {
            const result = await sendEmail(
              customer.email,
              template.subject,
              template.body,
              fromEmail,
              sendgridApiKey
            );

            if (!result.success) {
              emailStatus = 'failed';
              emailError = result.error;
            }
          }

          await supabase.from('email_logs').insert({
            customer_id: customer.id,
            assignment_id: assignment.id,
            template_id: template.id,
            sent_at: now.toISOString(),
            subject: template.subject,
            body: template.body,
            status: emailStatus,
            scheduled_for: now.toISOString(),
            error_message: emailError,
          });

          results.push({
            assignment_id: assignment.id,
            customer_id: customer.id,
            customer_name: customer.name,
            status: emailStatus,
            scheduled_time: sendTime,
            reason: emailError,
          });
        }
      }
    }
  }

  return { results, debugInfo };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const startTime = Date.now();
    const executionId = crypto.randomUUID();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "ventureresp@starwork.dev";

    const testMode = !sendgridApiKey;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { results, debugInfo } = await processEmailSchedule(supabase, sendgridApiKey, fromEmail);

    const executionTime = Date.now() - startTime;
    const sentCount = results.filter(r => r.status === 'sent').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    await supabase.from('scheduler_execution_logs').insert({
      execution_id: executionId,
      executed_at: new Date().toISOString(),
      execution_time_ms: executionTime,
      total_assignments_checked: results.length,
      emails_queued: 0,
      emails_sent: sentCount,
      emails_failed: failedCount,
      test_mode: testMode,
      detailed_recipients: results.filter(r => r.status === 'sent').concat([{ debug: debugInfo } as any]),
      skipped_customers: results.filter(r => r.status === 'skipped'),
      error_summary: failedCount > 0 ? `${failedCount} emails failed` : null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        execution_id: executionId,
        execution_time_ms: executionTime,
        test_mode: testMode,
        debug: debugInfo,
        summary: {
          total: results.length,
          sent: sentCount,
          failed: failedCount,
          skipped: skippedCount,
        },
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
