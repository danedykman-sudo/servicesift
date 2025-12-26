import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// CORS helper function to get appropriate headers based on origin
function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = [
    "https://service-sift.com",
    "https://www.service-sift.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  // Use the request origin if it's allowed, otherwise use wildcard
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, apikey, Apikey",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

interface Review {
  text: string;
  rating: number;
  date: string;
}

interface RequestBody {
  businessName: string;
  reviews: Review[];
}

interface RootCause {
  title: string;
  severity: "High" | "Medium" | "Low";
  frequency: string;
  bullets: string[];
  quotes: string[];
}

interface StaffCoaching {
  role: string;
  focus: string;
  script: string;
}

interface ProcessChange {
  change: string;
  why: string;
  howTo: string;
  timeEstimate: string;
}

interface BacklogItem {
  week: string;
  task: string;
  effort: "Low" | "Medium" | "High";
  impact: "Low" | "Medium" | "High";
  owner: string;
}

interface AnalysisResult {
  topRootCauses: RootCause[];
  staffCoaching: StaffCoaching[];
  processChanges: ProcessChange[];
  backlog: BacklogItem[];
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { businessName, reviews }: RequestBody = await req.json();

    if (!businessName || !reviews || !Array.isArray(reviews)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "API key not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const limitedReviews = reviews.slice(0, 200);
    const reviewsJSON = JSON.stringify(limitedReviews);
    const reviewCount = limitedReviews.length;

    const systemPrompt = "You are an operational consultant analyzing business reviews to identify root causes and actionable fixes. Focus on patterns, not individual complaints. Be specific and actionable.";

    const userPrompt = `Analyze these ${reviewCount} reviews for ${businessName} and generate an operational fix list.

Reviews: ${reviewsJSON}

Return ONLY valid JSON (no markdown, no explanation) in this exact structure:
{
  "topRootCauses": [
    {
      "title": "string (specific issue)",
      "severity": "High|Medium|Low",
      "frequency": "XX% of reviews",
      "bullets": ["string", "string", "string"],
      "quotes": ["actual quote from review", "actual quote from review"]
    }
  ],
  "staffCoaching": [
    {
      "role": "string (e.g., Front Desk, Manager)",
      "focus": "string (what to train on)",
      "script": "string (example dialogue)"
    }
  ],
  "processChanges": [
    {
      "change": "string (what to change)",
      "why": "string (business impact)",
      "howTo": "string (step-by-step)",
      "timeEstimate": "string (e.g., 2 weeks)"
    }
  ],
  "backlog": [
    {
      "week": "Week 1|Week 2|Week 3|Week 4",
      "task": "string",
      "effort": "Low|Medium|High",
      "impact": "Low|Medium|High",
      "owner": "string (role)"
    }
  ]
}

Rules:
- Find exactly 5 root causes (ranked by frequency × severity)
- Use actual quotes from reviews (2 per root cause)
- Create 4-6 staff coaching bullets
- Suggest 3-4 process changes
- Build a 30-day backlog (10-12 items across 4 weeks)
- Be specific to this business type (gym/restaurant/etc.)`;

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error("Claude API error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Analysis service unavailable" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const claudeData = await claudeResponse.json();
    const contentBlock = claudeData.content?.[0];
    
    if (!contentBlock || contentBlock.type !== "text") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from analysis service" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let analysisText = contentBlock.text;
    
    analysisText = analysisText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let analysis: AnalysisResult;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);
      console.error("Raw response:", analysisText);
      return new Response(
        JSON.stringify({ success: false, error: "Analysis failed" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in analyzeReviews:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});