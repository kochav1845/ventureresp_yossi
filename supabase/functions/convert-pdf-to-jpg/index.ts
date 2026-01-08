import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as pdfjs from "npm:pdfjs-dist@4.0.379";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { pdfBase64, quality = 90 } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Missing pdfBase64 parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('Converting PDF to JPG using PDF.js...');

    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const pageCount = pdf.numPages;

    console.log(`PDF has ${pageCount} page(s)`);

    const images: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      console.log(`Processing page ${pageNum}/${pageCount}`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      await page.render({
        canvasContext: context as any,
        viewport: viewport,
      }).promise;

      const blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: quality / 100,
      });

      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Jpg = btoa(String.fromCharCode(...uint8Array));

      images.push(base64Jpg);
    }

    console.log(`Successfully converted ${images.length} page(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        images,
        pageCount: images.length
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error converting PDF to JPG:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});