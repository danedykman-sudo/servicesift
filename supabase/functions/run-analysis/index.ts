import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface RunAnalysisRequest {
  analysisId: string;
  businessUrl: string;
  businessName?: string;
  traceId?: string;
}

Deno.serve(async (req: Request) => {
  // #region agent log
  console.log(JSON.stringify({location:'supabase/functions/run-analysis/index.ts:10',message:'Edge function entry point',data:{method:req.method,url:req.url,hasBody:!!req.body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}));
  // #endregion
  console.log("[run-analysis] ===== FUNCTION CALLED =====", {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
    hasBody: !!req.body,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    console.log("[run-analysis] DEBUG: OPTIONS request, returning CORS headers");
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.log("[run-analysis] DEBUG: Invalid method", { method: req.method });
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Extract incoming Authorization header to forward to other edge functions
    const incomingAuthHeader = req.headers.get("Authorization");
    
    console.log("[run-analysis] DEBUG: Parsing request body...", {
      timestamp: new Date().toISOString(),
      hasIncomingAuth: !!incomingAuthHeader
    });
    
    // Parse and log the raw request body first
    const rawBody = await req.json();
    console.log("[run-analysis] DEBUG: Raw parsed request body:", {
      rawBody,
      bodyKeys: Object.keys(rawBody || {}),
      bodyType: typeof rawBody,
      timestamp: new Date().toISOString()
    });
    
    // Extract fields with explicit logging
    const analysisId = rawBody.analysisId || rawBody.analysis_id;
    const businessUrl = rawBody.businessUrl || rawBody.business_url;
    const businessName = rawBody.businessName || rawBody.business_name;
    const traceId = rawBody.traceId || rawBody.trace_id;
    
    console.log("[run-analysis] DEBUG: Extracted fields:", {
      analysisId,
      businessUrl: businessUrl?.substring(0, 50),
      businessName,
      traceId,
      hasAnalysisId: !!analysisId,
      hasBusinessUrl: !!businessUrl,
      hasBusinessName: !!businessName,
      hasTraceId: !!traceId,
      timestamp: new Date().toISOString()
    });
    
    // Log traceId at function start
    console.log("[run-analysis] ===== FUNCTION START =====", {
      traceId,
      analysisId,
      timestamp: new Date().toISOString()
    });

    // #region agent log
    console.log(JSON.stringify({location:'supabase/functions/run-analysis/index.ts:46',message:'Request parsed',data:{analysisId,hasBusinessUrl:!!businessUrl,hasBusinessName:!!businessName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}));
    // #endregion
    console.log("[run-analysis] DEBUG: Request parsed successfully", {
      analysisId,
      businessUrl: businessUrl?.substring(0, 50),
      hasBusinessName: !!businessName,
      businessNameLength: businessName?.length || 0,
      timestamp: new Date().toISOString()
    });

    // Validate required field: analysisId
    if (!analysisId) {
      console.error("[run-analysis] Missing required field: analysisId", {
        receivedFields: Object.keys(rawBody || {}),
        rawBody,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "analysisId is required", receivedFields: Object.keys(rawBody || {}) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    // #region agent log
    console.log(JSON.stringify({location:'supabase/functions/run-analysis/index.ts:73',message:'Environment check',data:{hasSupabaseUrl:!!supabaseUrl,hasServiceRoleKey:!!supabaseServiceRoleKey,hasAnonKey:!!supabaseAnonKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}));
    // #endregion
    console.log("[run-analysis] DEBUG: Environment variables check", {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!supabaseServiceRoleKey,
      hasAnonKey: !!supabaseAnonKey,
      supabaseUrlPrefix: supabaseUrl?.substring(0, 30),
      serviceRoleKeyPrefix: supabaseServiceRoleKey?.substring(0, 20),
      timestamp: new Date().toISOString()
    });

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[run-analysis] Missing required environment variables", {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRoleKey: !!supabaseServiceRoleKey,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key (bypasses RLS)
    // Declare outside try block so it's accessible in catch handler
    let supabase: ReturnType<typeof createClient>;
    
    try {
      console.log("[run-analysis] DEBUG: Creating Supabase client", {
        supabaseUrlPrefix: supabaseUrl.substring(0, 30),
        hasServiceRoleKey: !!supabaseServiceRoleKey,
        timestamp: new Date().toISOString()
      });
      
      supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    } catch (clientError) {
      console.error("[run-analysis] Failed to create Supabase client:", clientError);
      return new Response(
        JSON.stringify({ error: "CLIENT_CREATION_FAILED", message: clientError instanceof Error ? clientError.message : "Unknown error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get analysis record
    console.log("[run-analysis] DEBUG: Fetching analysis record from database", {
      analysisId,
      timestamp: new Date().toISOString()
    });
    
    const { data: analysis, error: fetchError } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    if (fetchError || !analysis) {
      console.error("[run-analysis] Analysis not found:", {
        error: fetchError,
        analysisId,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Analysis not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use database values if not provided in request
    const finalBusinessUrl = businessUrl || analysis.business_url;
    const finalBusinessName = businessName || analysis.business_name;

    // Validate that we have businessUrl (either from request or database)
    if (!finalBusinessUrl) {
      console.error("[run-analysis] Missing required field: businessUrl (not in request and not in database)", {
        receivedFields: Object.keys(rawBody || {}),
        rawBody,
        analysisBusinessUrl: analysis.business_url,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "businessUrl is required (not found in request or database)", receivedFields: Object.keys(rawBody || {}) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[run-analysis] DEBUG: Analysis record found", {
      analysisId,
      currentStatus: analysis.status,
      paymentStatus: analysis.payment_status,
      businessUrlFromRequest: businessUrl,
      businessUrlFromDb: analysis.business_url,
      finalBusinessUrl,
      businessNameFromRequest: businessName,
      businessNameFromDb: analysis.business_name,
      finalBusinessName,
      timestamp: new Date().toISOString()
    });

    const analysisStartTime = Date.now();

    try {
      // Step 1: Extract reviews
      console.log("[run-analysis] Step 1/3: Extracting reviews", {
        analysisId,
        businessUrl: finalBusinessUrl.substring(0, 50),
        timestamp: new Date().toISOString()
      });
      
      console.log("[run-analysis] DEBUG: Updating status to extracting", {
        analysisId,
        timestamp: new Date().toISOString()
      });
      
      const { error: statusUpdateError } = await supabase
        .from("analyses")
        .update({ status: "extracting" })
        .eq("id", analysisId);
      
      if (statusUpdateError) {
        console.error("[run-analysis] DEBUG: Failed to update status to extracting", {
          error: statusUpdateError,
          analysisId
        });
      } else {
        console.log("[run-analysis] DEBUG: Status updated to extracting successfully", {
          analysisId,
          timestamp: new Date().toISOString()
        });
      }

      const extractHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Use service role key for extract-reviews (not user JWT)
      if (supabaseServiceRoleKey) {
        extractHeaders["Authorization"] = `Bearer ${supabaseServiceRoleKey}`;
        extractHeaders["apikey"] = supabaseServiceRoleKey;
      }

      const extractUrl = `${supabaseUrl}/functions/v1/extract-reviews`;
      console.log("[run-analysis] DEBUG: Calling extract-reviews edge function", {
        url: extractUrl,
        analysisId,
        hasAuthorization: !!extractHeaders["Authorization"],
        hasApikey: !!extractHeaders["apikey"],
        timestamp: new Date().toISOString()
      });

      const extractResponse = await fetch(extractUrl, {
        method: "POST",
        headers: extractHeaders,
        body: JSON.stringify({
          url: finalBusinessUrl,
          maxReviews: 200,
          traceId,
        }),
      });

      console.log("[run-analysis] DEBUG: Extract response received", {
        status: extractResponse.status,
        ok: extractResponse.ok,
        analysisId,
        timestamp: new Date().toISOString()
      });

      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        const errorMessage = `Review extraction failed: ${errorText.substring(0, 500)}`;
        console.error("[run-analysis] Extraction failed:", {
          traceId,
          status: extractResponse.status,
          errorText: errorText.substring(0, 500),
          fullErrorText: errorText,
          analysisId,
          timestamp: new Date().toISOString()
        });
        
        // Update analysis status to failed with error message
        try {
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", analysisId);
        } catch (updateErr) {
          console.error("[run-analysis] Failed to update analysis status after extraction error:", updateErr);
        }
        
        return new Response(
          JSON.stringify({ error: "EXTRACTION_FAILED", message: errorMessage, details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Safe JSON parsing for extract response
      let extractData: any;
      try {
        const extractResponseText = await extractResponse.text();
        try {
          extractData = JSON.parse(extractResponseText);
        } catch (parseError) {
          // Non-JSON response - update database and return error
          const errorMessage = `Review extraction returned non-JSON response: ${extractResponseText.substring(0, 300)}`;
          console.error("[run-analysis] Extract response is not valid JSON:", {
            traceId,
            status: extractResponse.status,
            responsePreview: extractResponseText.substring(0, 300),
            parseError: parseError instanceof Error ? parseError.message : "Unknown parse error",
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Update analysis status to failed with error message
          try {
            await supabase
              .from("analyses")
              .update({
                status: "failed",
                error_message: errorMessage,
              })
              .eq("id", analysisId);
          } catch (updateErr) {
            console.error("[run-analysis] Failed to update analysis status after JSON parse error:", updateErr);
          }
          
          return new Response(
            JSON.stringify({ error: "EXTRACTION_FAILED", message: errorMessage, details: extractResponseText.substring(0, 300) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (textError) {
        // Failed to read response text
        const errorMessage = `Review extraction response read failed: ${textError instanceof Error ? textError.message : "Unknown error"}`;
        console.error("[run-analysis] Failed to read extract response text:", {
          traceId,
          error: textError,
          analysisId,
          timestamp: new Date().toISOString()
        });
        
        // Update analysis status to failed with error message
        try {
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", analysisId);
        } catch (updateErr) {
          console.error("[run-analysis] Failed to update analysis status after response read error:", updateErr);
        }
        
        return new Response(
          JSON.stringify({ error: "EXTRACTION_FAILED", message: errorMessage }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!extractData.success) {
        const errorMessage = `Review extraction failed: ${JSON.stringify(extractData).substring(0, 500)}`;
        console.error("[run-analysis] Extraction returned failure:", {
          traceId,
          extractData,
          analysisId
        });
        
        // Update analysis status to failed with error message
        try {
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", analysisId);
        } catch (updateErr) {
          console.error("[run-analysis] Failed to update analysis status after extraction failure:", updateErr);
        }
        
        return new Response(
          JSON.stringify({ error: "EXTRACTION_FAILED", message: errorMessage, details: extractData }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[run-analysis] Extraction successful:", {
        reviewCount: extractData.reviewCount,
        extractionMethod: extractData.extractionMethod,
      });

      // Step 2: Analyze reviews
      console.log("[run-analysis] Step 2/3: Analyzing reviews with AI");
      await supabase
        .from("analyses")
        .update({ status: "analyzing" })
        .eq("id", analysisId);

      const analyzeHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Use service role key for analyze-reviews (not user JWT)
      if (supabaseServiceRoleKey) {
        analyzeHeaders["Authorization"] = `Bearer ${supabaseServiceRoleKey}`;
        analyzeHeaders["apikey"] = supabaseServiceRoleKey;
      }

      const analyzeUrl = `${supabaseUrl}/functions/v1/analyze-reviews`;
      const analyzeRequestBody = {
        businessName: finalBusinessName || extractData.businessName,
        reviews: extractData.reviews?.map((r: any) => ({
          text: r.text || r.reviewText || "",
          rating: r.rating || r.stars || 0,
          date: r.date || r.reviewDate || "",
        })) || [],
        traceId,
      };
      
      console.log("[run-analysis] DEBUG: Calling analyze-reviews edge function", {
        url: analyzeUrl,
        analysisId,
        businessName: analyzeRequestBody.businessName,
        reviewCount: analyzeRequestBody.reviews.length,
        hasAuthorization: !!analyzeHeaders["Authorization"],
        hasApikey: !!analyzeHeaders["apikey"],
        timestamp: new Date().toISOString()
      });

      const analyzeResponse = await fetch(analyzeUrl, {
        method: "POST",
        headers: analyzeHeaders,
        body: JSON.stringify(analyzeRequestBody),
      });

      console.log("[run-analysis] DEBUG: Analyze response received", {
        status: analyzeResponse.status,
        ok: analyzeResponse.ok,
        analysisId,
        timestamp: new Date().toISOString()
      });

      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text();
        const errorMessage = `AI analysis failed: ${errorText.substring(0, 500)}`;
        console.error("[run-analysis] Analysis failed:", {
          traceId,
          status: analyzeResponse.status,
          errorText: errorText.substring(0, 500),
          fullErrorText: errorText,
          analysisId,
          timestamp: new Date().toISOString()
        });
        
        // Update analysis status to failed with error message
        try {
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", analysisId);
        } catch (updateErr) {
          console.error("[run-analysis] Failed to update analysis status after analysis error:", updateErr);
        }
        
        return new Response(
          JSON.stringify({ error: "ANALYSIS_FAILED", message: errorMessage, details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Safe JSON parsing for analyze response
      let analyzeData: any;
      try {
        const analyzeResponseText = await analyzeResponse.text();
        try {
          analyzeData = JSON.parse(analyzeResponseText);
        } catch (parseError) {
          // Non-JSON response - update database and return error
          const errorMessage = `AI analysis returned non-JSON response: ${analyzeResponseText.substring(0, 300)}`;
          console.error("[run-analysis] Analyze response is not valid JSON:", {
            traceId,
            status: analyzeResponse.status,
            responsePreview: analyzeResponseText.substring(0, 300),
            parseError: parseError instanceof Error ? parseError.message : "Unknown parse error",
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Update analysis status to failed with error message
          try {
            await supabase
              .from("analyses")
              .update({
                status: "failed",
                error_message: errorMessage,
              })
              .eq("id", analysisId);
          } catch (updateErr) {
            console.error("[run-analysis] Failed to update analysis status after JSON parse error:", updateErr);
          }
          
          return new Response(
            JSON.stringify({ error: "ANALYSIS_FAILED", message: errorMessage, details: analyzeResponseText.substring(0, 300) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (textError) {
        // Failed to read response text
        const errorMessage = `AI analysis response read failed: ${textError instanceof Error ? textError.message : "Unknown error"}`;
        console.error("[run-analysis] Failed to read analyze response text:", {
          traceId,
          error: textError,
          analysisId,
          timestamp: new Date().toISOString()
        });
        
        // Update analysis status to failed with error message
        try {
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", analysisId);
        } catch (updateErr) {
          console.error("[run-analysis] Failed to update analysis status after response read error:", updateErr);
        }
        
        return new Response(
          JSON.stringify({ error: "ANALYSIS_FAILED", message: errorMessage }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!analyzeData.success || !analyzeData.analysis) {
        const errorMessage = `AI analysis returned error: ${JSON.stringify(analyzeData).substring(0, 500)}`;
        console.error("[run-analysis] Analysis returned failure:", {
          traceId,
          analyzeData,
          analysisId
        });
        
        // Update analysis status to failed with error message
        try {
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", analysisId);
        } catch (updateErr) {
          console.error("[run-analysis] Failed to update analysis status after analysis failure:", updateErr);
        }
        
        return new Response(
          JSON.stringify({ error: "ANALYSIS_FAILED", message: errorMessage, details: analyzeData }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const analysisResult = analyzeData.analysis;
      console.log("[run-analysis] Analysis successful:", {
        rootCausesCount: analysisResult.topRootCauses?.length || 0,
        coachingScriptsCount: analysisResult.staffCoaching?.length || 0,
        processChangesCount: analysisResult.processChanges?.length || 0,
        backlogTasksCount: analysisResult.backlog?.length || 0,
      });

      // Step 3: Save results
      console.log("[run-analysis] Step 3/3: Saving results to database", {
        analysisId,
        rootCausesCount: analysisResult.topRootCauses?.length || 0,
        timestamp: new Date().toISOString()
      });
      
      console.log("[run-analysis] DEBUG: Updating status to saving", {
        analysisId,
        timestamp: new Date().toISOString()
      });
      
      const { error: savingStatusError } = await supabase
        .from("analyses")
        .update({ status: "saving" })
        .eq("id", analysisId);
      
      if (savingStatusError) {
        console.error("[run-analysis] DEBUG: Failed to update status to saving", {
          error: savingStatusError,
          analysisId
        });
      } else {
        console.log("[run-analysis] DEBUG: Status updated to saving successfully", {
          analysisId,
          timestamp: new Date().toISOString()
        });
      }

      // Save reviews
      if (extractData.reviews && extractData.reviews.length > 0) {
        const reviewRecords = extractData.reviews.map((r: any) => ({
          analysis_id: analysisId,
          review_text: r.text || r.reviewText || "",
          rating: r.rating || r.stars || 0,
          review_date: r.date || r.reviewDate || null,
        }));

        const { error: reviewsError } = await supabase.from("reviews").insert(reviewRecords);
        if (reviewsError) {
          console.warn("[run-analysis] Failed to save reviews (non-critical):", reviewsError);
        } else {
          console.log("[run-analysis] Saved reviews:", reviewRecords.length);
        }
      }

      // Save root causes
      if (analysisResult.topRootCauses && analysisResult.topRootCauses.length > 0) {
        const rootCauseRecords = analysisResult.topRootCauses.map((cause: any, index: number) => ({
          analysis_id: analysisId,
          rank: index + 1,
          title: cause.title || "",
          severity: cause.severity || "Medium",
          frequency: parseInt(cause.frequency) || 0,
          bullets: cause.bullets || [],
          quotes: cause.quotes || [],
        }));

        const { error: rootCausesError } = await supabase
          .from("root_causes")
          .insert(rootCauseRecords);

        if (rootCausesError) {
          console.error("[run-analysis] Failed to save root causes:", rootCausesError);
          throw new Error(`SAVE_FAILED: Root causes - ${rootCausesError.message}`);
        } else {
          console.log("[run-analysis] Saved root causes:", rootCauseRecords.length);
        }
      }

      // Save coaching scripts
      if (analysisResult.staffCoaching && analysisResult.staffCoaching.length > 0) {
        const coachingRecords = analysisResult.staffCoaching.map((script: any) => ({
          analysis_id: analysisId,
          role: script.role || "",
          focus: script.focus || "",
          script: script.script || "",
        }));

        const { error: coachingError } = await supabase
          .from("coaching_scripts")
          .insert(coachingRecords);

        if (coachingError) {
          console.error("[run-analysis] Failed to save coaching scripts:", coachingError);
          throw new Error(`SAVE_FAILED: Coaching scripts - ${coachingError.message}`);
        } else {
          console.log("[run-analysis] Saved coaching scripts:", coachingRecords.length);
        }
      }

      // Save process changes
      if (analysisResult.processChanges && analysisResult.processChanges.length > 0) {
        const processRecords = analysisResult.processChanges.map((change: any) => ({
          analysis_id: analysisId,
          change: change.change || "",
          why: change.why || "",
          steps: change.howTo ? [change.howTo] : change.steps || [],
          time_estimate: change.timeEstimate || "",
        }));

        const { error: processError } = await supabase
          .from("process_changes")
          .insert(processRecords);

        if (processError) {
          console.error("[run-analysis] Failed to save process changes:", processError);
          throw new Error(`SAVE_FAILED: Process changes - ${processError.message}`);
        } else {
          console.log("[run-analysis] Saved process changes:", processRecords.length);
        }
      }

      // Save backlog tasks
      if (analysisResult.backlog && analysisResult.backlog.length > 0) {
        const backlogRecords = analysisResult.backlog.map((task: any) => ({
          analysis_id: analysisId,
          week: parseInt(task.week?.replace("Week ", "") || "1") || 1,
          task: task.task || "",
          effort: task.effort || "Medium",
          impact: task.impact || "Medium",
          owner: task.owner || "",
        }));

        const { error: backlogError } = await supabase.from("backlog_tasks").insert(backlogRecords);

        if (backlogError) {
          console.error("[run-analysis] Failed to save backlog tasks:", backlogError);
          throw new Error(`SAVE_FAILED: Backlog tasks - ${backlogError.message}`);
        } else {
          console.log("[run-analysis] Saved backlog tasks:", backlogRecords.length);
        }
      }

      // Update analysis with completion status
      const reviewCountToSave = extractData.reviewCount || 0;
      const averageRatingToSave = extractData.totalScore || 0;
      
      console.log("[run-analysis] DEBUG: Updating analysis to completed", {
        analysisId,
        reviewCount: reviewCountToSave,
        averageRating: averageRatingToSave,
        extractDataReviewCount: extractData.reviewCount,
        extractDataTotalScore: extractData.totalScore,
        timestamp: new Date().toISOString()
      });
      
      const { error: updateError } = await supabase
        .from("analyses")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          review_count: reviewCountToSave,
          average_rating: averageRatingToSave,
          error_message: null, // Clear any previous errors
        })
        .eq("id", analysisId);

      if (updateError) {
        console.error("[run-analysis] Failed to update analysis status:", {
          error: updateError,
          analysisId,
          reviewCount: reviewCountToSave,
          timestamp: new Date().toISOString()
        });
        throw new Error(`SAVE_FAILED: Analysis status - ${updateError.message}`);
      }
      
      console.log("[run-analysis] DEBUG: Analysis status updated to completed successfully", {
        analysisId,
        reviewCount: reviewCountToSave,
        averageRating: averageRatingToSave,
        timestamp: new Date().toISOString()
      });

      // Phase 1 Step 1: Create report record and JSON artifact
      let reportId: string | undefined;
      try {
        console.log("[run-analysis] Creating report record for analysis:", analysisId);
        
        // Check if report already exists
        const { data: existingReport } = await supabase
          .from("reports")
          .select("id, latest_artifact_version")
          .eq("analysis_id", analysisId)
          .maybeSingle();

        let artifactVersion = 1;

        if (existingReport) {
          reportId = existingReport.id;
          artifactVersion = (existingReport.latest_artifact_version || 1) + 1;
          
          // Update existing report to READY
          const { error: updateError } = await supabase
            .from("reports")
            .update({
              status: "READY",
              latest_artifact_version: artifactVersion,
              updated_at: new Date().toISOString()
            })
            .eq("id", reportId);

          if (updateError) {
            console.error("[run-analysis] Failed to update existing report:", updateError);
          } else {
            console.log("[run-analysis] Updated existing report to READY:", reportId);
          }
        } else {
          // Create new report
          const reportData: any = {
            analysis_id: analysisId,
            business_id: analysis.business_id,
            stripe_checkout_session_id: analysis.stripe_checkout_session_id,
            status: "READY",
            coverage_level: 200,
            run_type: "SNAPSHOT",
            latest_artifact_version: 1
          };

          const { data: newReport, error: reportError } = await supabase
            .from("reports")
            .insert(reportData)
            .select("id")
            .single();

          if (reportError) {
            console.error("[run-analysis] Failed to create report:", reportError);
            // Non-critical - continue without report
          } else {
            reportId = newReport.id;
            artifactVersion = 1;
            console.log("[run-analysis] Created report:", reportId);
          }
        }

        // Create JSON artifact if report was created/updated
        if (reportId) {
          try {
            // Prepare JSON data structure
            const jsonData = {
              analysis_id: analysisId,
              business_id: analysis.business_id,
              business_name: analysis.business_name,
              business_url: analysis.business_url,
              review_count: reviewCountToSave,
              average_rating: averageRatingToSave,
              root_causes: analysisResult.topRootCauses || [],
              coaching_scripts: analysisResult.staffCoaching || [],
              process_changes: analysisResult.processChanges || [],
              backlog_tasks: analysisResult.backlog || [],
              created_at: analysis.created_at,
              completed_at: new Date().toISOString(),
              version: artifactVersion
            };

            const jsonString = JSON.stringify(jsonData, null, 2);
            const jsonBlob = new Blob([jsonString], { type: "application/json" });
            
            // Store in Supabase Storage
            const userId = analysis.user_id;
            const storagePath = `${userId}/${analysisId}/v${artifactVersion}/analysis.json`;
            
            const { error: storageError } = await supabase.storage
              .from("report-artifacts")
              .upload(storagePath, jsonBlob, {
                contentType: "application/json",
                upsert: false
              });

            if (storageError) {
              console.error("[run-analysis] Failed to upload JSON to storage:", storageError);
            } else {
              // Create artifact record
              const { error: artifactError } = await supabase
                .from("report_artifacts")
                .insert({
                  report_id: reportId,
                  kind: "json",
                  storage_path: storagePath,
                  version: artifactVersion
                });

              if (artifactError) {
                console.error("[run-analysis] Failed to create artifact record:", artifactError);
              } else {
                console.log("[run-analysis] Created JSON artifact:", storagePath);

                // Trigger PDF generation (best-effort, non-blocking)
                // Use reportId (not analysisId) - this is the real report ID from reports table
                console.log("[run-analysis] Invoking generate-pdf-report edge function with reportId:", reportId);
                
                // Helper function to call PDF generation with retry
                async function callGeneratePdfWithRetry(url: string, headers: Record<string, string>, body: string, maxRetries = 2) {
                  for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                      console.log(`[run-analysis] PDF generation attempt ${attempt}/${maxRetries}`);
                      const response = await fetch(url, { method: "POST", headers, body });
                      
                      if (response.ok) {
                        const responseData = await response.json().catch(() => null);
                        console.log("[run-analysis] Successfully invoked PDF generation:", {
                          reportId,
                          attempt,
                          status: response.status,
                          response: responseData,
                        });
                        return { success: true, response };
                      }
                      
                      const errorText = await response.text();
                      console.error(`[run-analysis] PDF generation attempt ${attempt} failed:`, {
                        reportId,
                        status: response.status,
                        statusText: response.statusText,
                        body: errorText.substring(0, 500)
                      });
                      
                      if (attempt < maxRetries) {
                        console.log(`[run-analysis] Waiting 3s before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                      }
                    } catch (err) {
                      console.error(`[run-analysis] PDF generation attempt ${attempt} error:`, {
                        reportId,
                        error: err,
                        errorMessage: err instanceof Error ? err.message : "Unknown error"
                      });
                      
                      if (attempt < maxRetries) {
                        console.log(`[run-analysis] Waiting 3s before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                      }
                    }
                  }
                  return { success: false };
                }
                
                try {
                  // Use internal secret for PDF generation (edge-to-edge auth)
                  const generatePdfUrl = `${supabaseUrl}/functions/v1/generate-pdf-report`;
                  const pdfInternalSecret = Deno.env.get("PDF_INTERNAL_SECRET");
                  const apiKeyHeaderValue = supabaseAnonKey || supabaseServiceRoleKey;

                  const generatePdfHeaders: Record<string, string> = {
                    "Content-Type": "application/json",
                  };

                  // Add headers required by Supabase gateway
                  if (apiKeyHeaderValue) {
                    generatePdfHeaders["apikey"] = apiKeyHeaderValue;
                  }

                  // Add internal secret for authentication
                  if (pdfInternalSecret) {
                    generatePdfHeaders["x-internal-secret"] = pdfInternalSecret;
                  }

                  // Log before call (confirm gateway headers present)
                  console.log("[run-analysis] PDF generation call details:", {
                    reportId,
                    url: generatePdfUrl,
                    hasInternalSecret: !!pdfInternalSecret,
                    hasAuthorization: false,
                    hasApikey: !!apiKeyHeaderValue,
                    authType: "internal-secret",
                  });

                  const result = await callGeneratePdfWithRetry(
                    generatePdfUrl,
                    generatePdfHeaders,
                    JSON.stringify({ reportId })
                  );
                  
                  if (!result.success) {
                    console.error("[run-analysis] PDF generation failed after all retries (non-critical):", { reportId });
                  }
                } catch (pdfTriggerError) {
                  console.error("[run-analysis] Error invoking PDF generation (non-critical):", {
                    reportId,
                    error: pdfTriggerError,
                    errorMessage: pdfTriggerError instanceof Error ? pdfTriggerError.message : "Unknown error",
                  });
                  // Don't throw - this is best-effort, analysis should continue
                }
              }
            }
          } catch (artifactErr) {
            console.error("[run-analysis] Error creating JSON artifact:", artifactErr);
          }
        }
      } catch (reportErr) {
        console.error("[run-analysis] Error in report creation (non-critical):", reportErr);
      }

      const totalDuration = Date.now() - analysisStartTime;
      console.log("[run-analysis] ===== ANALYSIS COMPLETED SUCCESSFULLY =====", {
        analysisId,
        totalDuration: `${totalDuration}ms`,
        reviewCount: extractData.reviewCount || 0,
        averageRating: extractData.totalScore || 0,
      });

      return new Response(
        JSON.stringify({
          success: true,
          analysisId,
          reviewCount: extractData.reviewCount || 0,
          duration: totalDuration,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (analysisError) {
      // #region agent log
      const errorMsg = analysisError instanceof Error ? analysisError.message : "Unknown error";
      const errorStack = analysisError instanceof Error ? analysisError.stack : undefined;
      console.log(JSON.stringify({location:'supabase/functions/run-analysis/index.ts:513',message:'Analysis catch handler',data:{analysisId,errorMessage:errorMsg,errorType:analysisError?.constructor?.name,hasStack:!!errorStack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'}));
      // #endregion
      const errorMessage = analysisError instanceof Error ? analysisError.message : "Unknown error";
      const errorStackStr = analysisError instanceof Error ? analysisError.stack : undefined;
      
      console.error("[run-analysis] Analysis execution failed:", {
        analysisId,
        error: errorMessage,
        stack: errorStackStr,
        errorType: analysisError?.constructor?.name,
      });

      // Mark analysis as failed (wrap in try-catch to prevent double error)
      try {
        await supabase
          .from("analyses")
          .update({
            status: "failed",
            error_message: errorMessage.substring(0, 1000),
          })
          .eq("id", analysisId);
      } catch (updateErr) {
        console.error("[run-analysis] Failed to update analysis status after error:", updateErr);
      }

      const errorResponse = JSON.stringify({ 
        error: "ANALYSIS_FAILED", 
        message: errorMessage,
        analysisId,
        stack: errorStackStr?.substring(0, 500) // Include stack trace for debugging
      });
      
      console.error("[run-analysis] Returning error response:", {
        status: 500,
        responseLength: errorResponse.length,
        analysisId
      });

      return new Response(
        errorResponse,
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    // #region agent log
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.log(JSON.stringify({location:'supabase/functions/run-analysis/index.ts:550',message:'Top-level catch handler',data:{errorMessage:errorMsg,errorType:error?.constructor?.name,hasStack:!!errorStack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}));
    // #endregion
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStackStr = error instanceof Error ? error.stack : undefined;
    const errorMessageForDb = `run-analysis crash: ${errorMessage.substring(0, 300)}`;
    
    console.error("[run-analysis] Unexpected error:", {
      error: errorMessage,
      stack: errorStackStr,
      errorType: error?.constructor?.name,
    });
    
    // Try to extract analysisId from the request if available
    let analysisId: string | undefined;
    try {
      const requestBody = await req.clone().json().catch(() => null);
      analysisId = requestBody?.analysisId;
    } catch {
      // Ignore - analysisId may not be available
    }
    
    // Update database if analysisId is available
    if (analysisId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        
        if (supabaseUrl && supabaseServiceRoleKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
          await supabase
            .from("analyses")
            .update({
              status: "failed",
              error_message: errorMessageForDb,
            })
            .eq("id", analysisId);
          console.log("[run-analysis] Updated analysis status to failed in top-level catch", { analysisId });
        }
      } catch (updateErr) {
        console.error("[run-analysis] Failed to update analysis status in top-level catch:", updateErr);
      }
    }
    
    const errorResponse = JSON.stringify({ 
      error: "INTERNAL_ERROR", 
      message: errorMessage,
      stack: errorStackStr?.substring(0, 500) // Include stack trace for debugging
    });
    
    console.error("[run-analysis] Returning top-level error response:", {
      status: 500,
      responseLength: errorResponse.length
    });
    
    return new Response(
      errorResponse,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

