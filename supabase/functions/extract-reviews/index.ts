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

interface ExtractRequest {
  url: string;
  maxReviews?: number;
}

interface ApifyReview {
  stars?: number;
  text?: string;
  publishedAtDate?: string;
  name?: string;
}

interface ApifyResponse {
  reviews?: ApifyReview[];
  title?: string;
  totalScore?: number;
  reviewsCount?: number;
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
    const { url, maxReviews = 200 }: ExtractRequest = await req.json();

    // Validate URL
    if (!url || (!url.includes("google.com/maps") && !url.includes("maps.app.goo.gl"))) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid Google Maps URL",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get Apify token from environment
    const apifyToken = Deno.env.get("APIFY_TOKEN");
    if (!apifyToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Apify API token not configured",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Try primary actor first
    const primaryActorUrl = `https://api.apify.com/v2/acts/compass~google-maps-reviews-scraper/run-sync-get-dataset-items?token=${apifyToken}`;

    const apifyInput = {
      startUrls: [{ url }],
      maxReviews: 200,
      reviewsSort: "newest",
      reviewsOrigin: "google",
      language: "en",
      personalData: false,
    };

    console.log("Trying primary actor (compass~google-maps-reviews-scraper)");
    console.log("Sending to Apify:", JSON.stringify(apifyInput, null, 2));

    let apifyData: any[] = [];
    let extractionMethod = "primary";

    try {
      const primaryResponse = await fetch(primaryActorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apifyInput),
      });

      if (primaryResponse.ok) {
        const responseData = await primaryResponse.json();

        if (Array.isArray(responseData) && responseData.length > 0) {
          const firstItem = responseData[0];
          if (firstItem.error === "no_search_results" || firstItem.error) {
            console.log("Primary actor returned error:", firstItem.error);
          } else {
            apifyData = responseData;
            console.log("Primary actor extracted:", apifyData.length, "items");
          }
        }
      } else {
        const errorText = await primaryResponse.text();
        console.error("Primary actor HTTP error:", primaryResponse.status, errorText);
      }
    } catch (error) {
      console.error("Primary actor failed:", error);
    }

    // If primary actor returned no data, try fallback actor
    if (apifyData.length === 0) {
      console.log("Primary actor returned no data, trying fallback actor (delicious_zebu~google-maps-store-review-scraper)");

      const fallbackActorUrl = `https://api.apify.com/v2/acts/delicious_zebu~google-maps-store-review-scraper/run-sync-get-dataset-items?token=${apifyToken}`;

      try {
        const fallbackResponse = await fetch(fallbackActorUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apifyInput),
        });

        if (fallbackResponse.ok) {
          const responseData = await fallbackResponse.json();

          if (Array.isArray(responseData) && responseData.length > 0) {
            const firstItem = responseData[0];
            if (firstItem.error === "no_search_results" || firstItem.error) {
              console.log("Fallback actor returned error:", firstItem.error);
            } else {
              apifyData = responseData;
              extractionMethod = "fallback";
              console.log("Fallback actor extracted:", apifyData.length, "items");
            }
          }
        } else {
          const errorText = await fallbackResponse.text();
          console.error("Fallback actor HTTP error:", fallbackResponse.status, errorText);
        }
      } catch (error) {
        console.error("Fallback actor failed:", error);
      }
    }

    console.log("Apify returned data items:", apifyData.length);
    if (apifyData.length > 0) {
      console.log("First item keys:", Object.keys(apifyData[0]));
    }

    if (!apifyData || apifyData.length === 0) {
      console.log("Both actors failed to extract reviews");
      return new Response(
        JSON.stringify({
          success: false,
          error: "extraction_failed",
          reviewCount: 0,
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("Extraction method:", extractionMethod);

    // Check if this actor returns reviews directly (each item is a review)
    // or wrapped in a business object with a reviews array
    const firstItem = apifyData[0];
    let reviews: any[] = [];
    let businessName = firstItem.placeTitle || firstItem.title || firstItem.name || "Review Analysis Report";
    let totalScore = 0;

    if ("reviews" in firstItem && Array.isArray(firstItem.reviews)) {
      // Old format: business object with reviews array
      reviews = firstItem.reviews;
      businessName = firstItem.placeTitle || firstItem.title || firstItem.name || "Review Analysis Report";
      totalScore = firstItem.totalScore || 0;
    } else if ("text" in firstItem || "reviewText" in firstItem) {
      // New format: each item is a review
      reviews = apifyData;
      businessName = firstItem.placeTitle || firstItem.title || firstItem.name || "Review Analysis Report";

      // Calculate average rating
      const validRatings = reviews
        .map(r => r.stars || r.rating || 0)
        .filter(r => r > 0);
      totalScore = validRatings.length > 0
        ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length
        : 0;
    } else {
      console.log("Unexpected data structure:", JSON.stringify(firstItem, null, 2));
      console.log("Data keys:", Object.keys(firstItem));
      return new Response(
        JSON.stringify({
          success: false,
          error: "extraction_failed",
          reviewCount: 0,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("Number of reviews extracted:", reviews.length);

    if (reviews.length === 0) {
      console.log("No reviews found after parsing data structure");
      return new Response(
        JSON.stringify({
          success: false,
          error: "extraction_failed",
          reviewCount: 0,
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Normalize review data - handle different possible field names
    const normalizedReviews = reviews.map((review: any) => ({
      rating: review.stars || review.rating || 0,
      text: review.text || review.reviewText || "",
      date: review.publishedAtDate || review.publishAt || review.date || new Date().toISOString(),
      author: review.name || review.reviewerName || "Anonymous",
    }));

    return new Response(
      JSON.stringify({
        success: true,
        source: "google_maps",
        businessName: businessName,
        totalScore: totalScore,
        reviewCount: normalizedReviews.length,
        reviews: normalizedReviews,
        extractionMethod: extractionMethod,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in extract-reviews function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "extraction_failed",
        reviewCount: 0,
      }),
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