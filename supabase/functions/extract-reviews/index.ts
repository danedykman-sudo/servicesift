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
  traceId?: string;
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
    const { url, maxReviews = 200, traceId }: ExtractRequest = await req.json();
    
    // Log traceId at function start
    console.log("[extract-reviews] ===== FUNCTION START =====", {
      traceId,
      url: url?.substring(0, 50),
      timestamp: new Date().toISOString()
    });

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
      maxReviews: maxReviews || 200,
      reviewsSort: "newest",
      reviewsOrigin: "google",
      language: "en",
      personalData: false,
    };

    console.log("[extract-reviews] Trying primary actor (compass~google-maps-reviews-scraper)", {
      traceId,
      url: url.substring(0, 50),
      maxReviews: maxReviews || 200,
      timestamp: new Date().toISOString()
    });
    console.log("[extract-reviews] Sending to Apify:", JSON.stringify(apifyInput, null, 2));

    let apifyData: any[] = [];
    let extractionMethod = "primary";

    try {
      console.log("[extract-reviews] Calling primary Apify actor...", { traceId, timestamp: new Date().toISOString() });
      const primaryResponse = await fetch(primaryActorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apifyInput),
      });

      console.log("[extract-reviews] Primary actor response status:", {
        traceId,
        status: primaryResponse.status,
        ok: primaryResponse.ok,
        timestamp: new Date().toISOString()
      });

      if (primaryResponse.ok) {
        const responseData = await primaryResponse.json();
        console.log("[extract-reviews] Primary actor response data:", {
          traceId,
          isArray: Array.isArray(responseData),
          dataLength: Array.isArray(responseData) ? responseData.length : 0,
          firstItemKeys: Array.isArray(responseData) && responseData.length > 0 ? Object.keys(responseData[0]) : [],
          timestamp: new Date().toISOString()
        });

        if (Array.isArray(responseData) && responseData.length > 0) {
          const firstItem = responseData[0];
          console.log("[extract-reviews] First item from primary actor:", {
            traceId,
            keys: Object.keys(firstItem),
            hasError: !!firstItem.error,
            error: firstItem.error,
            timestamp: new Date().toISOString()
          });
          
          if (firstItem.error === "no_search_results" || firstItem.error) {
            console.log("[extract-reviews] Primary actor returned error:", {
              traceId,
              error: firstItem.error,
              timestamp: new Date().toISOString()
            });
          } else {
            apifyData = responseData;
            console.log("[extract-reviews] Primary actor extracted successfully:", {
              traceId,
              itemCount: apifyData.length,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          console.warn("[extract-reviews] Primary actor returned empty or invalid data:", {
            traceId,
            responseData,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        const errorText = await primaryResponse.text();
        console.error("[extract-reviews] Primary actor HTTP error:", {
          traceId,
          status: primaryResponse.status,
          errorText: errorText.substring(0, 500),
          timestamp: new Date().toISOString()
        });
      }
      } catch (error) {
        console.error("[extract-reviews] Primary actor failed:", {
          traceId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        });
    }

    // If primary actor returned no data, try fallback actor
    if (apifyData.length === 0) {
      console.log("[extract-reviews] Primary actor returned no data, trying fallback actor", {
        traceId,
        actor: "delicious_zebu~google-maps-store-review-scraper",
        timestamp: new Date().toISOString()
      });

      const fallbackActorUrl = `https://api.apify.com/v2/acts/delicious_zebu~google-maps-store-review-scraper/run-sync-get-dataset-items?token=${apifyToken}`;

      try {
        console.log("[extract-reviews] Calling fallback Apify actor...", { traceId, timestamp: new Date().toISOString() });
        const fallbackResponse = await fetch(fallbackActorUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apifyInput),
        });

        console.log("[extract-reviews] Fallback actor response status:", {
          traceId,
          status: fallbackResponse.status,
          ok: fallbackResponse.ok,
          timestamp: new Date().toISOString()
        });

        if (fallbackResponse.ok) {
          const responseData = await fallbackResponse.json();
          console.log("[extract-reviews] Fallback actor response data:", {
            traceId,
            isArray: Array.isArray(responseData),
            dataLength: Array.isArray(responseData) ? responseData.length : 0,
            firstItemKeys: Array.isArray(responseData) && responseData.length > 0 ? Object.keys(responseData[0]) : [],
            timestamp: new Date().toISOString()
          });

          if (Array.isArray(responseData) && responseData.length > 0) {
            const firstItem = responseData[0];
            console.log("[extract-reviews] First item from fallback actor:", {
              traceId,
              keys: Object.keys(firstItem),
              hasError: !!firstItem.error,
              error: firstItem.error,
              timestamp: new Date().toISOString()
            });
            
            if (firstItem.error === "no_search_results" || firstItem.error) {
              console.log("[extract-reviews] Fallback actor returned error:", {
                traceId,
                error: firstItem.error,
                timestamp: new Date().toISOString()
              });
            } else {
              apifyData = responseData;
              extractionMethod = "fallback";
              console.log("[extract-reviews] Fallback actor extracted successfully:", {
                traceId,
                itemCount: apifyData.length,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            console.warn("[extract-reviews] Fallback actor returned empty or invalid data:", {
              traceId,
              responseData,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          const errorText = await fallbackResponse.text();
          console.error("[extract-reviews] Fallback actor HTTP error:", {
            traceId,
            status: fallbackResponse.status,
            errorText: errorText.substring(0, 500),
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("[extract-reviews] Fallback actor failed:", {
          traceId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log("[extract-reviews] Apify returned data items:", {
      traceId,
      itemCount: apifyData.length,
      timestamp: new Date().toISOString()
    });
    if (apifyData.length > 0) {
      console.log("[extract-reviews] First item keys:", {
        traceId,
        keys: Object.keys(apifyData[0]),
        firstItemSample: JSON.stringify(apifyData[0]).substring(0, 500),
        timestamp: new Date().toISOString()
      });
    }

    if (!apifyData || apifyData.length === 0) {
      console.error("[extract-reviews] Both actors failed to extract reviews", {
        traceId,
        url: url.substring(0, 50),
        timestamp: new Date().toISOString()
      });
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

    console.log("[extract-reviews] Extraction method:", {
      traceId,
      method: extractionMethod,
      timestamp: new Date().toISOString()
    });

    // Check if this actor returns reviews directly (each item is a review)
    // or wrapped in a business object with a reviews array
    const firstItem = apifyData[0];
    console.log("[extract-reviews] Parsing data structure:", {
      traceId,
      firstItemKeys: Object.keys(firstItem),
      hasReviews: "reviews" in firstItem,
      hasText: "text" in firstItem,
      hasReviewText: "reviewText" in firstItem,
      timestamp: new Date().toISOString()
    });
    
    let reviews: any[] = [];
    let businessName = firstItem.placeTitle || firstItem.title || firstItem.name || "Review Analysis Report";
    let totalScore = 0;

    if ("reviews" in firstItem && Array.isArray(firstItem.reviews)) {
      // Old format: business object with reviews array
      console.log("[extract-reviews] Using old format (business object with reviews array)", {
        traceId,
        reviewCount: firstItem.reviews.length,
        timestamp: new Date().toISOString()
      });
      reviews = firstItem.reviews;
      businessName = firstItem.placeTitle || firstItem.title || firstItem.name || "Review Analysis Report";
      totalScore = firstItem.totalScore || 0;
    } else if ("text" in firstItem || "reviewText" in firstItem) {
      // New format: each item is a review
      console.log("[extract-reviews] Using new format (each item is a review)", {
        traceId,
        itemCount: apifyData.length,
        timestamp: new Date().toISOString()
      });
      reviews = apifyData;
      businessName = firstItem.placeTitle || firstItem.title || firstItem.name || "Review Analysis Report";

      // Calculate average rating
      const validRatings = reviews
        .map(r => r.stars || r.rating || 0)
        .filter(r => r > 0);
      totalScore = validRatings.length > 0
        ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length
        : 0;
      console.log("[extract-reviews] Calculated average rating:", {
        traceId,
        totalScore,
        validRatingsCount: validRatings.length,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error("[extract-reviews] Unexpected data structure:", {
        traceId,
        firstItem: JSON.stringify(firstItem, null, 2).substring(0, 1000),
        dataKeys: Object.keys(firstItem),
        timestamp: new Date().toISOString()
      });
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

    console.log("[extract-reviews] Number of reviews extracted:", {
      traceId,
      reviewCount: reviews.length,
      businessName,
      totalScore,
      timestamp: new Date().toISOString()
    });

    if (reviews.length === 0) {
      console.error("[extract-reviews] No reviews found after parsing data structure", {
        traceId,
        apifyDataLength: apifyData.length,
        firstItemKeys: Object.keys(firstItem),
        timestamp: new Date().toISOString()
      });
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

    console.log("[extract-reviews] Returning successful response", {
      traceId,
      reviewCount: normalizedReviews.length,
      businessName,
      totalScore,
      extractionMethod,
      timestamp: new Date().toISOString()
    });

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
    // Try to extract traceId from request if available
    let traceId: string | undefined;
    try {
      const requestBody = await req.clone().json().catch(() => null);
      traceId = requestBody?.traceId;
    } catch {
      // Ignore - traceId may not be available
    }
    
    console.error("Error in extract-reviews function:", {
      traceId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
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