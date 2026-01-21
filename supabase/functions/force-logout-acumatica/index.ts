import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function logoutSession(acumaticaUrl: string, cookies: string): Promise<{ success: boolean; error?: string }> {
  try {
    const logoutResponse = await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json',
      },
    });

    if (logoutResponse.ok) {
      return { success: true };
    } else {
      return { success: false, error: `Status ${logoutResponse.status}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      throw new Error('Acumatica credentials not configured');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const { data: cachedSessions } = await supabase
      .from('acumatica_session_cache')
      .select('id, session_id, created_at, expires_at, is_active')
      .order('created_at', { ascending: false });

    const results = {
      totalSessions: cachedSessions?.length || 0,
      loggedOut: 0,
      failed: 0,
      cleared: 0,
      details: [] as any[],
    };

    if (cachedSessions && cachedSessions.length > 0) {
      for (const session of cachedSessions) {
        console.log(`Logging out session created at ${session.created_at}...`);

        const logoutResult = await logoutSession(acumaticaUrl, session.session_id);

        results.details.push({
          sessionId: session.id,
          createdAt: session.created_at,
          wasActive: session.is_active,
          logoutSuccess: logoutResult.success,
          error: logoutResult.error,
        });

        if (logoutResult.success) {
          results.loggedOut++;
        } else {
          results.failed++;
        }
      }

      const { error: deleteError } = await supabase
        .from('acumatica_session_cache')
        .delete()
        .gte('id', 0);

      if (!deleteError) {
        results.cleared = cachedSessions.length;
      }
    }

    console.log(`Force logout complete: ${results.loggedOut} logged out, ${results.failed} failed, ${results.cleared} cleared from cache`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Force logout complete. ${results.loggedOut} sessions logged out, ${results.cleared} cleared from cache.`,
        ...results,
        nextStep: 'If you still get login limit errors, go to Acumatica System Monitor (SM201010) > Active Users tab to manually terminate stale sessions',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Force logout error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
