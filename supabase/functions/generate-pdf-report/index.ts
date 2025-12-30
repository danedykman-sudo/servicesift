import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

interface GeneratePdfRequest {
  reportId: string;
}

Deno.serve(async (req: Request) => {
  const internalSecretHeader = !!req.headers.get("x-internal-secret");
  // Early log to confirm function execution (before any other processing)
  console.log("[generate-pdf-report] START", { 
    hasInternalSecret: internalSecretHeader,
    hasSecretLoaded: !!Deno.env.get("PDF_INTERNAL_SECRET"),
    method: req.method,
    url: req.url 
  });

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate internal secret (edge-to-edge auth)
  const expectedSecret = Deno.env.get("PDF_INTERNAL_SECRET");
  if (expectedSecret) {
    const providedSecret = req.headers.get("x-internal-secret");
    if (providedSecret !== expectedSecret) {
      console.error("[generate-pdf-report] Invalid or missing internal secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[generate-pdf-report] Internal secret validated successfully");
  } else {
    console.log("[generate-pdf-report] No internal secret configured, allowing request");
  }

  try {
    const { reportId }: GeneratePdfRequest = await req.json();

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: "reportId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[generate-pdf-report] Missing environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get report with latest_artifact_version
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, analysis_id, latest_artifact_version, business_id")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      console.error("[generate-pdf-report] Report not found:", reportError);
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const version = report.latest_artifact_version || 1;

    // Get analysis to get user_id and other details
    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .select("id, user_id, business_name, created_at, review_count, average_rating, business_id")
      .eq("id", report.analysis_id)
      .single();

    if (analysisError || !analysis) {
      console.error("[generate-pdf-report] Analysis not found:", analysisError);
      return new Response(
        JSON.stringify({ error: "Analysis not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load latest JSON artifact
    const { data: jsonArtifact, error: artifactError } = await supabase
      .from("report_artifacts")
      .select("storage_path")
      .eq("report_id", reportId)
      .eq("kind", "json")
      .eq("version", version)
      .single();

    if (artifactError || !jsonArtifact) {
      console.error("[generate-pdf-report] JSON artifact not found:", artifactError);
      return new Response(
        JSON.stringify({ error: "JSON artifact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download JSON from storage
    const { data: jsonData, error: downloadError } = await supabase.storage
      .from("report-artifacts")
      .download(jsonArtifact.storage_path);

    if (downloadError || !jsonData) {
      console.error("[generate-pdf-report] Failed to download JSON:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download JSON artifact" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON
    const jsonText = await jsonData.text();
    const reportData = JSON.parse(jsonText);

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 612; // US Letter width in points
    const pageHeight = 792; // US Letter height in points
    const margin = 72; // 1 inch margins
    const contentWidth = pageWidth - (margin * 2);
    let currentY = pageHeight - margin;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Helper function to add text with word wrapping
    // Note: Uses closure to access and update outer 'page' variable
    const addText = (text: string, size: number, x: number, y: number, width: number, fontToUse: any = font): number => {
      const words = text.split(" ");
      let line = "";
      let lineY = y;

      for (const word of words) {
        const testLine = line + (line ? " " : "") + word;
        const testWidth = fontToUse.widthOfTextAtSize(testLine, size);

        if (testWidth > width && line) {
          page.drawText(line, { x, y: lineY, size, font: fontToUse });
          line = word;
          lineY -= size + 4;
          
          // Check if we need a new page
          if (lineY < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            lineY = pageHeight - margin;
          }
        } else {
          line = testLine;
        }
      }
      if (line) {
        page.drawText(line, { x, y: lineY, size, font: fontToUse });
      }
      return lineY;
    };

    // Cover Page
    currentY = pageHeight - margin;
    page.drawText("Service Analysis Report", {
      x: margin,
      y: currentY,
      size: 24,
      font: fontBold,
      color: rgb(0, 0, 0.5),
    });
    currentY -= 40;

    page.drawText(reportData.business_name || analysis.business_name || "Business", {
      x: margin,
      y: currentY,
      size: 20,
      font: fontBold,
    });
    currentY -= 30;

    const reportDate = new Date(reportData.created_at || analysis.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    page.drawText(`Date: ${reportDate}`, {
      x: margin,
      y: currentY,
      size: 12,
      font: font,
    });
    currentY -= 20;

    page.drawText(`Coverage Level: ${reportData.coverage_level || 200} reviews`, {
      x: margin,
      y: currentY,
      size: 12,
      font: font,
    });
    currentY -= 20;

    page.drawText(`Review Count: ${reportData.review_count || analysis.review_count || 0}`, {
      x: margin,
      y: currentY,
      size: 12,
      font: font,
    });
    currentY -= 20;

    const avgRating = reportData.average_rating || analysis.average_rating || 0;
    page.drawText(`Average Rating: ${avgRating.toFixed(1)}`, {
      x: margin,
      y: currentY,
      size: 12,
      font: font,
    });
    currentY -= 50;

    // Top Root Causes
    if (reportData.root_causes && reportData.root_causes.length > 0) {
      // Check if we need a new page
      if (currentY < margin + 100) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }

      page.drawText("Top Root Causes", {
        x: margin,
        y: currentY,
        size: 18,
        font: fontBold,
        color: rgb(0.8, 0, 0),
      });
      currentY -= 30;

      for (const cause of reportData.root_causes) {
        // Check if we need a new page
        if (currentY < margin + 60) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margin;
        }

        page.drawText(cause.title || "", {
          x: margin + 20,
          y: currentY,
          size: 14,
          font: fontBold,
        });
        currentY -= 20;

        if (cause.bullets && cause.bullets.length > 0) {
          for (const bullet of cause.bullets) {
            if (currentY < margin + 20) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              currentY = pageHeight - margin;
            }
            const bulletText = `• ${bullet}`;
            const finalY = addText(bulletText, 10, margin + 40, currentY, contentWidth - 40);
            currentY = finalY - 15;
          }
        }
        currentY -= 10;
      }
    }

    // Backlog
    if (reportData.backlog_tasks && reportData.backlog_tasks.length > 0) {
      // Check if we need a new page
      if (currentY < margin + 150) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }

      currentY -= 20;
      page.drawText("30-Day Backlog", {
        x: margin,
        y: currentY,
        size: 18,
        font: fontBold,
        color: rgb(0.5, 0, 0.5),
      });
      currentY -= 30;

      // Table header
      const colWidths = [60, 200, 100, 80, 80];
      const colX = [margin, margin + colWidths[0], margin + colWidths[0] + colWidths[1], margin + colWidths[0] + colWidths[1] + colWidths[2], margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]];

      page.drawText("Week", { x: colX[0], y: currentY, size: 10, font: fontBold });
      page.drawText("Task", { x: colX[1], y: currentY, size: 10, font: fontBold });
      page.drawText("Owner", { x: colX[2], y: currentY, size: 10, font: fontBold });
      page.drawText("Effort", { x: colX[3], y: currentY, size: 10, font: fontBold });
      page.drawText("Impact", { x: colX[4], y: currentY, size: 10, font: fontBold });
      currentY -= 20;

      // Draw line under header
      page.drawLine({
        start: { x: margin, y: currentY },
        end: { x: pageWidth - margin, y: currentY },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      currentY -= 15;

      // Table rows
      for (const task of reportData.backlog_tasks) {
        if (currentY < margin + 40) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margin;
          // Redraw header on new page
          page.drawText("Week", { x: colX[0], y: currentY, size: 10, font: fontBold });
          page.drawText("Task", { x: colX[1], y: currentY, size: 10, font: fontBold });
          page.drawText("Owner", { x: colX[2], y: currentY, size: 10, font: fontBold });
          page.drawText("Effort", { x: colX[3], y: currentY, size: 10, font: fontBold });
          page.drawText("Impact", { x: colX[4], y: currentY, size: 10, font: fontBold });
          currentY -= 20;
          page.drawLine({
            start: { x: margin, y: currentY },
            end: { x: pageWidth - margin, y: currentY },
            thickness: 1,
            color: rgb(0, 0, 0),
          });
          currentY -= 15;
        }

        const week = task.week || 1;
        const taskText = task.task || "";
        const owner = task.owner || "";
        const effort = task.effort || "";
        const impact = task.impact || "";

        page.drawText(`Week ${week}`, { x: colX[0], y: currentY, size: 9, font: font });
        
        // Wrap task text if needed
        const taskLines = [];
        const words = taskText.split(" ");
        let line = "";
        for (const word of words) {
          const testLine = line + (line ? " " : "") + word;
          if (font.widthOfTextAtSize(testLine, 9) > colWidths[1] - 10) {
            if (line) taskLines.push(line);
            line = word;
          } else {
            line = testLine;
          }
        }
        if (line) taskLines.push(line);

        let taskY = currentY;
        for (const line of taskLines) {
          page.drawText(line, { x: colX[1], y: taskY, size: 9, font: font });
          taskY -= 12;
        }
        const maxTaskHeight = Math.max(12, taskLines.length * 12);

        page.drawText(owner, { x: colX[2], y: currentY, size: 9, font: font });
        page.drawText(effort, { x: colX[3], y: currentY, size: 9, font: font });
        page.drawText(impact, { x: colX[4], y: currentY, size: 9, font: font });
        
        currentY -= Math.max(15, maxTaskHeight);
      }
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Upload PDF to storage
    const userId = analysis.user_id;
    const storagePath = `${userId}/${report.analysis_id}/v${version}/report.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("report-artifacts")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false, // Don't overwrite
      });

    if (uploadError) {
      // Check if file already exists (that's okay, we don't overwrite)
      if (uploadError.message?.includes("already exists") || uploadError.message?.includes("duplicate")) {
        console.log("[generate-pdf-report] PDF already exists, skipping upload:", storagePath);
      } else {
        console.error("[generate-pdf-report] Failed to upload PDF:", uploadError);
        return new Response(
          JSON.stringify({ error: "Failed to upload PDF" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if artifact already exists
    const { data: existingArtifact } = await supabase
      .from("report_artifacts")
      .select("id")
      .eq("report_id", reportId)
      .eq("kind", "pdf")
      .eq("version", version)
      .single();

    if (!existingArtifact) {
      // Insert report_artifacts row
      const { error: artifactError } = await supabase
        .from("report_artifacts")
        .insert({
          report_id: reportId,
          kind: "pdf",
          storage_path: storagePath,
          version: version,
        });

      if (artifactError) {
        console.error("[generate-pdf-report] Failed to create artifact record:", artifactError);
        // Don't fail the whole request, just log it
      } else {
        console.log("[generate-pdf-report] Created PDF artifact:", storagePath);
      }
    } else {
      console.log("[generate-pdf-report] PDF artifact already exists, skipping insert");
    }

    return new Response(
      JSON.stringify({
        success: true,
        storagePath,
        version,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-pdf-report] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

