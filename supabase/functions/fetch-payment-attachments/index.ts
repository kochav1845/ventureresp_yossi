import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PaymentFileRecord {
  PaymentType: string;
  PaymentRefNbr: string;
  CustomerID: string;
  PaymentNoteID: string;
  FileID: string;
  FileName: string;
  FileCreatedDate: string;
}

async function getOrCreateSession(
  supabase: any,
  acumaticaUrl: string,
  username: string,
  password: string,
  company: string | null,
  branch: string | null
): Promise<{ cookies: string; sessionId: string | null }> {
  const { data: cachedSession } = await supabase
    .from('acumatica_session_cache')
    .select('id, session_cookie')
    .eq('is_valid', true)
    .gt('expires_at', new Date().toISOString())
    .order('last_used_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    console.log('Using cached session:', cachedSession.id);

    await supabase
      .from('acumatica_session_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', cachedSession.id);

    return { cookies: cachedSession.session_cookie, sessionId: cachedSession.id };
  }

  console.log('Creating new Acumatica session...');
  const loginBody: any = {
    name: username,
    password: password,
  };

  if (company) loginBody.company = company;
  if (branch) loginBody.branch = branch;

  const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(loginBody),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    throw new Error(`Authentication failed: ${errorText}`);
  }

  const setCookieHeader = loginResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No authentication cookies received");
  }

  const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

  const { data: newSession } = await supabase
    .from('acumatica_session_cache')
    .insert({
      session_cookie: cookies,
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      is_valid: true
    })
    .select('id')
    .single();

  console.log('Created new session:', newSession?.id);

  return { cookies, sessionId: newSession?.id || null };
}

async function invalidateSession(supabase: any, sessionId: string | null) {
  if (!sessionId) return;

  console.log('Invalidating session:', sessionId);
  await supabase
    .from('acumatica_session_cache')
    .update({ is_valid: false })
    .eq('id', sessionId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { paymentRefNumber } = await req.json();

    if (!paymentRefNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: paymentRefNumber" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: credentialsData, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('acumatica_url, username, password, company, branch')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError || !credentialsData) {
      return new Response(
        JSON.stringify({
          error: "No active Acumatica credentials found",
          details: "Please configure Acumatica credentials in the system"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const acumaticaUrl = credentialsData.acumatica_url;
    const username = credentialsData.username;
    const password = credentialsData.password;
    const company = credentialsData.company;
    const branch = credentialsData.branch;

    const paddedRefNumber = paymentRefNumber.padStart(6, '0');

    console.log(`Looking up payment for: ${paddedRefNumber}`);
    const { data: paymentRecord, error: dbError } = await supabase
      .from('acumatica_payments')
      .select('acumatica_id, type, customer_id, note_id')
      .eq('reference_number', paddedRefNumber)
      .maybeSingle();

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({
          error: "Database error",
          details: dbError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!paymentRecord) {
      return new Response(
        JSON.stringify({
          error: "Payment not found in database",
          details: `No payment found with reference number ${paddedRefNumber}. Please sync payments first.`
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentType = paymentRecord.type || 'Payment';
    console.log(`Found payment: Type=${paymentType}, RefNbr=${paddedRefNumber}`);

    let { cookies, sessionId } = await getOrCreateSession(
      supabase,
      acumaticaUrl,
      username,
      password,
      company,
      branch
    );

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(paddedRefNumber)}?$expand=files`;
    console.log(`Fetching payment with files: ${paymentUrl}`);

    let paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      },
    });

    if (!paymentResponse.ok && paymentResponse.status === 401) {
      console.log('Session expired, getting new session...');
      await invalidateSession(supabase, sessionId);

      const newSession = await getOrCreateSession(
        supabase,
        acumaticaUrl,
        username,
        password,
        company,
        branch
      );
      cookies = newSession.cookies;
      sessionId = newSession.sessionId;

      paymentResponse = await fetch(paymentUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Cookie": cookies,
        },
      });
    }

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      console.error('Error fetching payment:', errorText);

      return new Response(
        JSON.stringify({
          error: "Failed to fetch payment",
          details: errorText,
          url: paymentUrl
        }),
        {
          status: paymentResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentData = await paymentResponse.json();
    const files = paymentData.files || paymentData.Files || [];
    console.log(`Found ${files.length} files attached to payment`);

    let fileRecords: PaymentFileRecord[] = [];

    if (Array.isArray(files) && files.length > 0) {
      fileRecords = files.map((file: any) => ({
        PaymentType: paymentType,
        PaymentRefNbr: paddedRefNumber,
        CustomerID: paymentRecord.customer_id || '',
        PaymentNoteID: paymentRecord.note_id || '',
        FileID: file.id?.value || file.id || '',
        FileName: file.filename?.value || file.filename || file.name?.value || file.name || '',
        FileCreatedDate: file.createdDateTime?.value || file.createdDateTime || '',
      }));
    }

    const filesWithContent = await Promise.all(
      fileRecords.map(async (record) => {
        const fileUrl = `${acumaticaUrl}/(W(2))/Frames/GetFile.ashx?fileID=${record.FileID}`;

        try {
          console.log(`Downloading file: ${record.FileName}`);
          const fileResponse = await fetch(fileUrl, {
            headers: { "Cookie": cookies },
          });

          if (!fileResponse.ok) {
            console.error(`Failed to download ${record.FileName}: ${fileResponse.status}`);
            return {
              ...record,
              downloadUrl: fileUrl,
              error: `Failed to download: ${fileResponse.status}`,
            };
          }

          const fileBlob = await fileResponse.arrayBuffer();

          const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
            const bytes = new Uint8Array(buffer);
            const chunkSize = 8192;
            let binary = '';

            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
              binary += String.fromCharCode(...chunk);
            }

            return btoa(binary);
          };

          const fileBase64 = arrayBufferToBase64(fileBlob);

          const cleanFileName = (record.FileName.split('\\').pop() || record.FileName)
            .replace(/[#?&]/g, '_');

          const { data: existingRecord } = await supabase
            .from('payment_attachments')
            .select('storage_path')
            .eq('payment_reference_number', paddedRefNumber)
            .eq('file_id', record.FileID)
            .maybeSingle();

          const storagePath = existingRecord?.storage_path ||
            `payments/${paddedRefNumber}/${new Date().toISOString().replace(/[:.]/g, '-')}-${cleanFileName}`;

          const { error: uploadError } = await supabase.storage
            .from('payment-check-images')
            .upload(storagePath, new Uint8Array(fileBlob), {
              contentType: fileResponse.headers.get('content-type') || 'application/octet-stream',
              upsert: true
            });

          if (uploadError) {
            console.error(`Failed to upload ${cleanFileName} to storage:`, uploadError);
          } else {
            const isCheckImage = cleanFileName.toLowerCase().includes('check') ||
                                cleanFileName.toLowerCase().includes('.jpg') ||
                                cleanFileName.toLowerCase().includes('.jpeg') ||
                                cleanFileName.toLowerCase().includes('.png');

            const { error: dbError } = await supabase
              .from('payment_attachments')
              .upsert({
                payment_reference_number: paddedRefNumber,
                file_name: cleanFileName,
                file_type: fileResponse.headers.get('content-type') || 'application/octet-stream',
                file_size: fileBlob.byteLength,
                storage_path: storagePath,
                file_id: record.FileID,
                is_check_image: isCheckImage,
              }, {
                onConflict: 'payment_reference_number,file_id'
              });

            if (dbError) {
              console.error(`Failed to save attachment record to database:`, dbError);
            }
          }

          return {
            ...record,
            downloadUrl: fileUrl,
            fileContent: fileBase64,
            fileSize: fileBlob.byteLength,
            storagePath: uploadError ? undefined : storagePath,
            uploadError: uploadError ? uploadError.message : undefined,
          };
        } catch (error) {
          console.error(`Error downloading ${record.FileName}:`, error);
          return {
            ...record,
            downloadUrl: fileUrl,
            error: error instanceof Error ? error.message : 'Download failed',
          };
        }
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        paymentRefNumber: paddedRefNumber,
        filesCount: filesWithContent.length,
        files: filesWithContent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in fetch-payment-attachments:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch payment attachments",
        details: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});