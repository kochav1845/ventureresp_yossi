import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SendGridEvent {
  email: string;
  timestamp: number;
  event: string;
  'smtp-id': string;
  sg_message_id: string;
  reason?: string;
  response?: string;
  url?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const events: SendGridEvent[] = await req.json();

    console.log(`Received ${events.length} SendGrid events`);

    for (const event of events) {
      const messageId = event.sg_message_id;
      const eventType = event.event;
      const timestamp = new Date(event.timestamp * 1000);

      console.log(`Processing ${eventType} event for message ${messageId}`);

      const { data: logEntry, error: fetchError } = await supabase
        .from('customer_email_logs')
        .select('id, status, open_count, click_count')
        .eq('sendgrid_message_id', messageId)
        .single();

      if (fetchError) {
        console.log(`No log entry found for message ${messageId}, skipping`);
        continue;
      }

      const updates: any = {};

      switch (eventType) {
        case 'delivered':
          updates.delivered_at = timestamp;
          if (logEntry.status === 'sent') {
            updates.status = 'delivered';
          }
          break;

        case 'open':
          if (!logEntry.open_count || logEntry.open_count === 0) {
            updates.opened_at = timestamp;
          }
          updates.last_opened_at = timestamp;
          updates.open_count = (logEntry.open_count || 0) + 1;
          updates.status = 'opened';
          break;

        case 'click':
          if (!logEntry.click_count || logEntry.click_count === 0) {
            updates.clicked_at = timestamp;
          }
          updates.click_count = (logEntry.click_count || 0) + 1;
          updates.status = 'clicked';
          break;

        case 'bounce':
        case 'dropped':
          updates.bounced_at = timestamp;
          updates.bounce_reason = event.reason || event.response || 'Unknown';
          updates.status = 'bounced';
          break;

        case 'deferred':
        case 'processed':
          break;

        default:
          console.log(`Unknown event type: ${eventType}`);
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('customer_email_logs')
          .update(updates)
          .eq('id', logEntry.id);

        if (updateError) {
          console.error(`Error updating log entry:`, updateError);
        } else {
          console.log(`Updated log entry ${logEntry.id} with ${eventType} event`);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: events.length }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
