import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Invoice {
  reference_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  balance: number;
  description: string;
}

interface CustomerData {
  customer_name: string;
  customer_id: string;
  customer_email: string;
  balance: number;
  total_invoices: number;
  invoices: Invoice[];
  date_from?: string;
  date_to?: string;
  oldest_invoice_date?: string;
  days_overdue?: number;
  payment_url?: string;
}

interface Template {
  subject: string;
  body: string;
  include_invoice_table: boolean;
  include_payment_table: boolean;
}

interface RequestBody {
  templateId?: string;
  templateName?: string;
  template?: Template;
  customerData: CustomerData;
  pdfBase64?: string;
  sentByUserId?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const generateInvoiceTable = (invoices: Invoice[]) => {
  const rows = invoices.map(inv => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${inv.reference_number}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${formatDate(inv.invoice_date)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${formatDate(inv.due_date)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatCurrency(inv.amount)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${formatCurrency(inv.balance)}</td>
    </tr>
  `).join('');

  return `
    <div style="margin: 24px 0; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0;">
        <thead>
          <tr style="background-color: #f1f5f9;">
            <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #cbd5e1;">Invoice #</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #cbd5e1;">Invoice Date</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #cbd5e1;">Due Date</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #cbd5e1;">Amount</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #cbd5e1;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background-color: #fef2f2;">
            <td colspan="4" style="padding: 12px; font-weight: 600; border-top: 2px solid #cbd5e1;">Total Balance Due:</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 16px; color: #dc2626; border-top: 2px solid #cbd5e1;">
              ${formatCurrency(invoices.reduce((sum, inv) => sum + inv.balance, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
};

const replacePlaceholders = (text: string, data: CustomerData) => {
  const replacements: { [key: string]: string } = {
    '{{customer_name}}': data.customer_name,
    '{{customer_id}}': data.customer_id,
    '{{customer_email}}': data.customer_email,
    '{{balance}}': formatCurrency(data.balance),
    '{{total_invoices}}': data.total_invoices.toString(),
    '{{date_from}}': data.date_from ? formatDate(data.date_from) : '',
    '{{date_to}}': data.date_to ? formatDate(data.date_to) : formatDate(new Date().toISOString()),
    '{{credit_memos_count}}': '0',
    '{{credit_memos_total}}': formatCurrency(0),
    '{{oldest_invoice_date}}': data.oldest_invoice_date ? formatDate(data.oldest_invoice_date) : '',
    '{{days_overdue}}': data.days_overdue?.toString() || '0',
    '{{payment_url}}': data.payment_url || '',
  };

  let result = text;
  Object.entries(replacements).forEach(([key, value]) => {
    result = result.replace(new RegExp(key, 'g'), value);
  });

  return result;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { templateId, templateName, template, customerData, pdfBase64, sentByUserId } = body;

    if (!template || !customerData || !customerData.customer_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    if (!SENDGRID_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'SendGrid API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let emailSubject = replacePlaceholders(template.subject, customerData);
    let emailBody = replacePlaceholders(template.body, customerData);

    if (template.include_invoice_table && customerData.invoices && customerData.invoices.length > 0) {
      const invoiceTable = generateInvoiceTable(customerData.invoices);
      emailBody = emailBody.replace(/\{\{invoice_table\}\}/g, invoiceTable);
    } else {
      emailBody = emailBody.replace(/\{\{invoice_table\}\}/g, '');
    }

    emailBody = emailBody.replace(/\{\{payment_table\}\}/g, '');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        ${emailBody.replace(/\n/g, '<br>')}
      </div>
    `;

    const attachments = [];
    if (pdfBase64) {
      attachments.push({
        content: pdfBase64,
        filename: `Invoice_Statement_${new Date().toISOString().split('T')[0]}.png`,
        type: 'image/png',
        disposition: 'attachment',
      });
    }

    const emailData = {
      personalizations: [
        {
          to: [{ email: customerData.customer_email, name: customerData.customer_name }],
          subject: emailSubject,
        },
      ],
      from: {
        email: 'invoices@starwork.dev',
        name: 'Venture Respiratory - Accounts Receivable',
      },
      content: [
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
      attachments,
      tracking_settings: {
        click_tracking: {
          enable: true,
          enable_text: false
        },
        open_tracking: {
          enable: true
        }
      }
    };

    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!sendGridResponse.ok) {
      const errorText = await sendGridResponse.text();
      console.error('SendGrid error:', errorText);

      await supabase.from('customer_email_logs').insert({
        customer_id: customerData.customer_id,
        customer_name: customerData.customer_name,
        customer_email: customerData.customer_email,
        template_id: templateId || null,
        template_name: templateName || 'Custom Template',
        subject: emailSubject,
        status: 'failed',
        error_message: errorText,
        invoice_count: customerData.invoices?.length || 0,
        total_balance: customerData.balance || 0,
        had_pdf_attachment: !!pdfBase64,
        sent_by_user_id: sentByUserId || null,
      });

      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorText }),
        {
          status: sendGridResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const messageId = sendGridResponse.headers.get('x-message-id');

    const { data: logEntry, error: logError } = await supabase
      .from('customer_email_logs')
      .insert({
        customer_id: customerData.customer_id,
        customer_name: customerData.customer_name,
        customer_email: customerData.customer_email,
        template_id: templateId || null,
        template_name: templateName || 'Custom Template',
        subject: emailSubject,
        sendgrid_message_id: messageId,
        status: 'sent',
        invoice_count: customerData.invoices?.length || 0,
        total_balance: customerData.balance || 0,
        had_pdf_attachment: !!pdfBase64,
        sent_by_user_id: sentByUserId || null,
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating log entry:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        logId: logEntry?.id,
        messageId: messageId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
