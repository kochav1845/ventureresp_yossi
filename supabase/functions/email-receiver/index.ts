import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailAnalysis {
  intent: string;
  confidence: number;
  keywords: string[];
  reasoning: string;
}

async function analyzeEmailWithGPT4(
  subject: string,
  body: string,
  hasAttachments: boolean,
  openaiKey: string
): Promise<EmailAnalysis> {
  const prompt = `Analyze this customer email and determine the intent.

Email Subject: ${subject}
Email Body: ${body}
Has Attachments: ${hasAttachments}

Classify the intent as one of the following:
- "file_attached": Customer is sending requested documents/files (especially if attachments are present)
- "stop": Customer wants to stop receiving emails or cancel service
- "postpone": Customer needs more time or wants to delay
- "question": Customer is asking a question
- "general": General response or unclear intent

Return a JSON object with:
{
  "intent": "one of the above",
  "confidence": 0.0-1.0,
  "keywords": ["key", "phrases", "found"],
  "reasoning": "brief explanation"
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an AI assistant that analyzes customer emails to determine their intent. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const analysis = JSON.parse(content);

    return {
      intent: analysis.intent || 'general',
      confidence: analysis.confidence || 0.5,
      keywords: analysis.keywords || [],
      reasoning: analysis.reasoning || 'No reasoning provided',
    };
  } catch (error) {
    console.error("GPT-4 analysis error:", error);
    return {
      intent: hasAttachments ? 'file_attached' : 'general',
      confidence: 0.3,
      keywords: [],
      reasoning: `Analysis failed: ${error.message}`,
    };
  }
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanEmailBody(body: string): string {
  let cleaned = body;

  cleaned = cleaned.split(/_{20,}/)[0];
  cleaned = cleaned.split(/[-\s]*On .+wrote\s*[-\s]*/i)[0];
  cleaned = cleaned.split(/From:\s*.+[\r\n]+Sent:/i)[0];

  cleaned = cleaned
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('>') && !trimmed.match(/^[-=_]{3,}$/);
    })
    .join('\n')
    .trim();

  return cleaned;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== INCOMING EMAIL ===");
    console.log("Request Method:", req.method);
    console.log("Content-Type:", req.headers.get("content-type"));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const payload: Record<string, string> = {};
    const attachmentFiles: Array<{file: File; name: string}> = [];

    console.log("Form fields received:", Array.from(formData.keys()));

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`Attachment found: ${key} - ${value.name} (${value.size} bytes, ${value.type})`);
        attachmentFiles.push({ file: value, name: value.name });
      } else {
        payload[key] = value;
      }
    }

    console.log("Email received:", {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      attachmentCount: attachmentFiles.length,
    });

    if (!payload.from) {
      console.error("Missing 'from' field");
      return new Response(
        JSON.stringify({ success: false, error: "Missing 'from' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let senderEmail = payload.from.toLowerCase().trim();
    const emailMatch = senderEmail.match(/<([^>]+)>/);
    if (emailMatch) {
      senderEmail = emailMatch[1].trim();
    }
    const subject = payload.subject || '(No Subject)';

    let emailBody = payload.text || '';
    if (!emailBody && payload.html) {
      emailBody = extractTextFromHtml(payload.html);
      console.log("Extracted text from HTML");
    }
    if (!emailBody) {
      emailBody = subject;
      console.log("Using subject as body fallback");
    }

    emailBody = cleanEmailBody(emailBody);
    console.log("Email body length:", emailBody.length);

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('email', senderEmail)
      .maybeSingle();

    if (customerError) {
      console.error('Customer lookup error:', customerError);
    }

    const processingStatus = customer ? 'pending' : 'customer_not_found';
    const folder = customer ? 'inbox' : 'spam';

    let normalizedSubject = subject.toLowerCase();
    while (normalizedSubject.match(/^(re:|fwd:|fw:)\s*/i)) {
      normalizedSubject = normalizedSubject.replace(/^(re:|fwd:|fw:)\s*/i, '');
    }
    normalizedSubject = normalizedSubject.replace(/\s+/g, ' ').trim();

    const inReplyTo = payload['In-Reply-To'] || payload['in-reply-to'];
    const references = payload['References'] || payload['references'];
    const messageId = payload['Message-ID'] || payload['message-id'];

    console.log('Email headers:', { inReplyTo, references, messageId, normalizedSubject });

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
    const endOfMonth = new Date(currentYear, currentMonth, 1).toISOString();

    let threadId = null;
    if (customer) {
      if (inReplyTo || references) {
        const referencedIds = [];
        if (inReplyTo) referencedIds.push(inReplyTo);
        if (references) {
          const refList = references.split(/\s+/);
          referencedIds.push(...refList);
        }

        const { data: existingEmail } = await supabase
          .from('inbound_emails')
          .select('thread_id, received_at')
          .eq('customer_id', customer.id)
          .or(`message_id.in.(${referencedIds.map(id => `\"${id}\"`).join(',')}),thread_id.in.(${referencedIds.map(id => `\"${id}\"`).join(',')})`)
          .not('thread_id', 'is', null)
          .gte('received_at', startOfMonth)
          .lt('received_at', endOfMonth)
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingEmail?.thread_id) {
          threadId = existingEmail.thread_id;
          console.log('Found existing thread via email headers (same month):', threadId);
        }
      }

      if (!threadId) {
        const { data: existingThread } = await supabase
          .from('inbound_emails')
          .select('thread_id, received_at')
          .eq('customer_id', customer.id)
          .eq('normalized_subject', normalizedSubject)
          .not('thread_id', 'is', null)
          .gte('received_at', startOfMonth)
          .lt('received_at', endOfMonth)
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        threadId = existingThread?.thread_id;
        if (threadId) {
          console.log('Found existing thread via subject (same month):', threadId);
        }
      }

      if (!threadId) {
        threadId = crypto.randomUUID();
        console.log('Created new thread for current month:', threadId);
      }
    }

    const { data: inboundEmail, error: emailError } = await supabase
      .from('inbound_emails')
      .insert({
        customer_id: customer?.id || null,
        sender_email: senderEmail,
        subject: subject,
        body: emailBody,
        received_at: new Date().toISOString(),
        processing_status: processingStatus,
        is_read: false,
        raw_data: payload,
        thread_id: threadId,
        normalized_subject: normalizedSubject,
        message_id: messageId || null,
        folder: folder,
      })
      .select()
      .single();

    if (emailError) {
      console.error('Email insert error:', emailError);
      throw emailError;
    }

    console.log('Email saved:', inboundEmail.id);

    if (!customer) {
      console.log('Email from non-customer moved to spam:', senderEmail);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email received but customer not found - moved to spam',
          email_id: inboundEmail.id,
          folder: 'spam',
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysis = await analyzeEmailWithGPT4(
      subject,
      emailBody,
      attachmentFiles.length > 0,
      openaiKey
    );

    console.log('Email analysis:', analysis);

    let actionTaken = 'none';

    if (attachmentFiles.length > 0) {
      console.log(`Processing ${attachmentFiles.length} attachments`);

      for (const { file, name } of attachmentFiles) {
        try {
          const fileBuffer = await file.arrayBuffer();
          const timestamp = Date.now();
          const sanitizedFilename = name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `${customer.id}/${currentYear}/${currentMonth}/${timestamp}_${sanitizedFilename}`;

          const { error: uploadError } = await supabase.storage
            .from('customer-files')
            .upload(storagePath, fileBuffer, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            console.error('File upload error:', uploadError);
            continue;
          }

          console.log('File uploaded:', storagePath);

          const { error: fileRecordError } = await supabase
            .from('customer_files')
            .insert({
              customer_id: customer.id,
              inbound_email_id: inboundEmail.id,
              month: currentMonth,
              year: currentYear,
              filename: name,
              storage_path: storagePath,
              file_size: file.size,
              mime_type: file.type,
              upload_source: 'email',
            });

          if (fileRecordError) {
            console.error('File record error:', fileRecordError);
          }
        } catch (error) {
          console.error('Attachment processing error:', error);
        }
      }

      await supabase
        .from('customers')
        .update({ responded_this_month: true })
        .eq('id', customer.id);

      actionTaken = 'marked_responded';
      analysis.intent = 'file_attached';
      analysis.confidence = Math.max(analysis.confidence, 0.9);
    } else if (analysis.intent === 'stop') {
      await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', customer.id);

      actionTaken = 'deactivated_customer';
    } else if (analysis.intent === 'postpone') {
      const postponeDate = new Date();
      postponeDate.setDate(postponeDate.getDate() + 7);

      await supabase
        .from('customers')
        .update({
          postpone_until: postponeDate.toISOString(),
          postpone_reason: 'Customer requested more time (AI-detected)'
        })
        .eq('id', customer.id);

      actionTaken = 'postponed_emails';
      console.log('Customer postponed until:', postponeDate.toISOString());
    }

    await supabase
      .from('email_analysis')
      .insert({
        inbound_email_id: inboundEmail.id,
        detected_intent: analysis.intent,
        confidence_score: analysis.confidence,
        keywords_found: analysis.keywords,
        action_taken: actionTaken,
        reasoning: analysis.reasoning,
      });

    await supabase
      .from('inbound_emails')
      .update({ processing_status: 'processed' })
      .eq('id', inboundEmail.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email processed successfully',
        email_id: inboundEmail.id,
        customer_found: true,
        analysis,
        action_taken: actionTaken,
        attachments_processed: attachmentFiles.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});