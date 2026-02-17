import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url, username, password, company, branch } = await req.json();

    if (!url || !username || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing required credentials (url, username, password)"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const acumaticaUrl = url.startsWith('http') ? url : `https://${url}`;

    console.log(`Testing credentials for ${acumaticaUrl} using session manager`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const credentials = {
      acumaticaUrl,
      username,
      password,
      company: company || '',
      branch: branch || ''
    };

    try {
      const sessionCookie = await sessionManager.getSession(credentials);
      console.log('Session obtained successfully');

      const testUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer?$top=1`;
      const testResponse = await sessionManager.makeAuthenticatedRequest(credentials, testUrl);

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('API test failed:', errorText);

        return new Response(
          JSON.stringify({
            success: false,
            message: `API test failed: ${errorText}`,
            details: errorText,
            statusCode: testResponse.status
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await testResponse.json();
      const customerCount = Array.isArray(data) ? data.length : 0;

      console.log(`Test successful! Retrieved ${customerCount} customer(s)`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Successfully authenticated and tested API access!',
          details: `Retrieved ${customerCount} customer(s) in test query`,
          customerCount
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (authError: any) {
      console.error('Authentication failed:', authError.message);

      return new Response(
        JSON.stringify({
          success: false,
          message: `Authentication failed: ${authError.message}`,
          details: authError.message
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error('Error testing credentials:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: `Error: ${error.message}`,
        details: error.stack
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});