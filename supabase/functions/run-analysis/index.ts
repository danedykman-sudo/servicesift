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
    
    const { analysisId, businessUrl, businessName, traceId }: RunAnalysisRequest = await req.json();
    
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

    if (!analysisId || !businessUrl) {
      return new Response(
        JSON.stringify({ error: "analysisId and businessUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[run-analysis] ===== STARTING ANALYSIS =====", {
      analysisId,
      businessUrl,
      businessName,
      timestamp: new Date().toISOString(),
    });

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

    console.log("[run-analysis] DEBUG: Analysis record found", {
      analysisId,
      currentStatus: analysis.status,
      paymentStatus: analysis.payment_status,
      hasBusinessUrl: !!analysis.business_url,
      timestamp: new Date().toISOString()
    });

    const analysisStartTime = Date.now();

    try {
      // Step 1: Extract reviews
      console.log("[run-analysis] Step 1/3: Extracting reviews", {
        analysisId,
        businessUrl: businessUrl.substring(0, 50),
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

      // Forward incoming Authorization header (user JWT) to extract-reviews
      if (incomingAuthHeader) {
        extractHeaders["Authorization"] = incomingAuthHeader;
      }
      
      // Also include apikey header
      if (supabaseAnonKey) {
        extractHeaders["apikey"] = supabaseAnonKey;
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
          url: businessUrl,
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

      // Forward incoming Authorization header (user JWT) to analyze-reviews
      if (incomingAuthHeader) {
        analyzeHeaders["Authorization"] = incomingAuthHeader;
      }
      
      // Also include apikey header
      if (supabaseAnonKey) {
        analyzeHeaders["apikey"] = supabaseAnonKey;
      }

      const analyzeUrl = `${supabaseUrl}/functions/v1/analyze-reviews`;
      const analyzeRequestBody = {
        businessName: businessName || analysis.business_name || extractData.businessName,
        reviews: extractData.reviews?.map((r: any) => ({
          text: r.text || r.reviewText || "",
          rating: r.rating || r.stars || 0,
          date: r.date || r.reviewDate || "",
        })) || [],
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
      const { error: updateError } = await supabase
        .from("analyses")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          review_count: extractData.reviewCount || 0,
          average_rating: extractData.totalScore || 0,
          error_message: null, // Clear any previous errors
        })
        .eq("id", analysisId);

      if (updateError) {
        console.error("[run-analysis] Failed to update analysis status:", updateError);
        throw new Error(`SAVE_FAILED: Analysis status - ${updateError.message}`);
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

