import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncStatusRow {
  entity_type: string;
  last_successful_sync: string | null;
  status: string;
  records_synced: number;
  records_updated: number;
  records_created: number;
  last_error: string | null;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  updated_at: string;
}

interface SyncLogRow {
  sync_type: string;
  action_type: string;
  entity_reference: string;
  change_summary: string;
  created_at: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'idle': return '#10b981';
    case 'running': return '#3b82f6';
    case 'failed': return '#ef4444';
    default: return '#6b7280';
  }
}

function getStatusBadge(status: string): string {
  const color = getStatusColor(status);
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:${color};color:white;font-size:12px;font-weight:600;text-transform:uppercase;">${status}</span>`;
}

function minutesAgo(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function buildReportHtml(
  syncStatuses: SyncStatusRow[],
  recentLogs: SyncLogRow[],
  cronHealth: any[],
  entityCounts: { invoices: number; payments: number; customers: number },
  triggerUrl: string,
  errors: string[],
  reportTime: string,
): string {
  const hasErrors = errors.length > 0;
  const allHealthy = syncStatuses.every(s => s.status !== 'failed' && s.last_successful_sync);
  const headerColor = hasErrors ? '#dc2626' : allHealthy ? '#059669' : '#d97706';
  const headerText = hasErrors ? 'Sync Issues Detected' : allHealthy ? 'All Systems Healthy' : 'Attention Needed';

  const statusRows = syncStatuses.map(s => {
    const timeSince = minutesAgo(s.last_successful_sync);
    const isStale = !s.last_successful_sync || (Date.now() - new Date(s.last_successful_sync).getTime() > 30 * 60000);
    const rowBg = isStale ? '#fef2f2' : '#f0fdf4';

    return `
      <tr style="background:${rowBg};">
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;text-transform:capitalize;">${s.entity_type}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${getStatusBadge(s.status)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${formatDate(s.last_successful_sync)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:${isStale ? '#dc2626' : '#059669'};font-weight:500;">${timeSince}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${s.sync_enabled ? 'Yes' : 'No'}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:${s.last_error ? '#dc2626' : '#6b7280'};font-size:12px;">${s.last_error || 'None'}</td>
      </tr>`;
  }).join('');

  const logsByType: Record<string, { created: number; updated: number; latest: string }> = {};
  for (const log of recentLogs) {
    if (!logsByType[log.sync_type]) {
      logsByType[log.sync_type] = { created: 0, updated: 0, latest: log.created_at };
    }
    if (log.action_type === 'created') logsByType[log.sync_type].created++;
    if (log.action_type === 'updated') logsByType[log.sync_type].updated++;
  }

  const activityRows = Object.entries(logsByType).map(([type, stats]) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;text-transform:capitalize;font-weight:500;">${type}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#059669;font-weight:600;">${stats.created}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#2563eb;font-weight:600;">${stats.updated}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${formatDate(stats.latest)}</td>
    </tr>
  `).join('');

  const errorSection = errors.length > 0 ? `
    <div style="margin:24px 0;padding:16px 20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
      <h3 style="margin:0 0 12px 0;color:#991b1b;font-size:16px;">Errors & Warnings</h3>
      ${errors.map(e => `<p style="margin:4px 0;color:#dc2626;font-size:14px;">- ${e}</p>`).join('')}
    </div>
  ` : '';

  const cronRows = cronHealth.map((c: any) => {
    const statusColor = c.status === 'succeeded' ? '#059669' : '#dc2626';
    return `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;">${c.jobname}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;"><span style="color:${statusColor};font-weight:600;font-size:13px;">${c.status}</span></td>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${formatDate(c.start_time)}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${c.return_message?.includes('ERROR') ? '#dc2626' : '#6b7280'};">${c.return_message || ''}</td>
      </tr>`;
  }).join('');

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,${headerColor},${headerColor}dd);padding:32px 40px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:700;">Acumatica Sync Report</h1>
        <p style="margin:8px 0 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${reportTime} (Eastern)</p>
        <p style="margin:4px 0 0 0;color:rgba(255,255,255,0.95);font-size:16px;font-weight:600;">${headerText}</p>
      </div>

      <div style="padding:32px 40px;">
        <div style="display:flex;margin-bottom:24px;">
          <div style="flex:1;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;text-align:center;margin-right:8px;">
            <div style="font-size:28px;font-weight:700;color:#0369a1;">${entityCounts.invoices.toLocaleString()}</div>
            <div style="font-size:12px;color:#0c4a6e;margin-top:4px;">Total Invoices</div>
          </div>
          <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;margin-right:8px;">
            <div style="font-size:28px;font-weight:700;color:#15803d;">${entityCounts.payments.toLocaleString()}</div>
            <div style="font-size:12px;color:#14532d;margin-top:4px;">Total Payments</div>
          </div>
          <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#a16207;">${entityCounts.customers.toLocaleString()}</div>
            <div style="font-size:12px;color:#713f12;margin-top:4px;">Total Customers</div>
          </div>
        </div>

        ${errorSection}

        <h2 style="margin:28px 0 12px 0;font-size:18px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Sync Status</h2>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Entity</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Status</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Last Sync</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Time Ago</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Enabled</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Last Error</th>
            </tr>
          </thead>
          <tbody>${statusRows}</tbody>
        </table>

        <h2 style="margin:28px 0 12px 0;font-size:18px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Recent Sync Activity (Last 24h)</h2>
        ${activityRows ? `
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Type</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Created</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Updated</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Last Activity</th>
            </tr>
          </thead>
          <tbody>${activityRows}</tbody>
        </table>` : '<p style="color:#6b7280;font-style:italic;">No sync activity in the last 24 hours.</p>'}

        <h2 style="margin:28px 0 12px 0;font-size:18px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Cron Job Health (Last 10 Runs)</h2>
        ${cronRows ? `
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Job</th>
              <th style="padding:8px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Status</th>
              <th style="padding:8px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Run Time</th>
              <th style="padding:8px 16px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Result</th>
            </tr>
          </thead>
          <tbody>${cronRows}</tbody>
        </table>` : '<p style="color:#6b7280;font-style:italic;">No cron run data available.</p>'}

        <div style="margin:32px 0;text-align:center;">
          <a href="${triggerUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;box-shadow:0 4px 6px rgba(37,99,235,0.3);">
            Trigger Acumatica Sync Now
          </a>
          <p style="margin-top:8px;font-size:12px;color:#94a3b8;">Click to manually trigger a full sync from Acumatica</p>
        </div>

        <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated report from Venture Respiratory Sync System</p>
          <p style="margin:4px 0 0 0;font-size:12px;color:#94a3b8;">Report generated at ${reportTime}</p>
        </div>
      </div>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: syncStatuses } = await supabase
      .from('sync_status')
      .select('*')
      .order('entity_type');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from('sync_change_logs')
      .select('sync_type, action_type, entity_reference, change_summary, created_at')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    const { count: invoiceCount } = await supabase
      .from('acumatica_invoices')
      .select('*', { count: 'exact', head: true });

    const { count: paymentCount } = await supabase
      .from('acumatica_payments')
      .select('*', { count: 'exact', head: true });

    const { count: customerCount } = await supabase
      .from('acumatica_customers')
      .select('*', { count: 'exact', head: true });

    const { data: cronHealth } = await supabase.rpc('check_cron_job_health');

    const errors: string[] = [];
    for (const s of (syncStatuses || [])) {
      if (s.status === 'failed') {
        errors.push(`${s.entity_type} sync is in FAILED state: ${s.last_error || 'Unknown error'}`);
      }
      if (s.last_successful_sync) {
        const minutesSince = (Date.now() - new Date(s.last_successful_sync).getTime()) / 60000;
        if (minutesSince > 30) {
          errors.push(`${s.entity_type} sync hasn't succeeded in ${Math.round(minutesSince)} minutes (last: ${formatDate(s.last_successful_sync)})`);
        }
      } else {
        errors.push(`${s.entity_type} sync has never completed successfully`);
      }
      if (s.status === 'running') {
        const runningMinutes = (Date.now() - new Date(s.updated_at).getTime()) / 60000;
        if (runningMinutes > 15) {
          errors.push(`${s.entity_type} sync has been "running" for ${Math.round(runningMinutes)} minutes - may be stuck`);
        }
      }
    }

    if (!recentLogs || recentLogs.length === 0) {
      errors.push('No sync activity recorded in the last 24 hours');
    }

    const triggerUrl = `${supabaseUrl}/functions/v1/acumatica-master-sync`;

    const reportTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const htmlContent = buildReportHtml(
      syncStatuses || [],
      recentLogs || [],
      cronHealth || [],
      {
        invoices: invoiceCount || 0,
        payments: paymentCount || 0,
        customers: customerCount || 0,
      },
      triggerUrl,
      errors,
      reportTime,
    );

    const { data: recipients } = await supabase
      .from('sync_report_recipients')
      .select('email, name')
      .eq('is_active', true);

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No active report recipients configured' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: emailSettings } = await supabase
      .from('email_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    const fromEmail = emailSettings?.noreply_from_email || 'noreply@ventureresp.app';
    const fromName = emailSettings?.noreply_from_name || 'Venture Respiratory System';

    const hasErrors = errors.length > 0;
    const subjectPrefix = hasErrors ? '[ALERT]' : '[OK]';
    const subject = `${subjectPrefix} Acumatica Sync Report - ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}`;

    const sendResults = [];
    for (const recipient of recipients) {
      const emailData = {
        personalizations: [{
          to: [{ email: recipient.email, name: recipient.name || undefined }],
        }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: htmlContent }],
        tracking_settings: {
          click_tracking: { enable: true, enable_text: false },
          open_tracking: { enable: true },
        },
      };

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send to ${recipient.email}:`, errorText);
        sendResults.push({ email: recipient.email, success: false, error: errorText });
      } else {
        console.log(`Report sent to ${recipient.email}`);
        sendResults.push({ email: recipient.email, success: true });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipientCount: recipients.length,
        results: sendResults,
        errorsFound: errors.length,
        reportTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating sync report:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
