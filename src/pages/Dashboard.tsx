import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Plus, Loader2, AlertCircle, Trash2, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { BusinessCard } from '../components/BusinessCard';
import { supabase } from '../lib/supabase';
import {
  getUserBusinesses,
  updateBusinessName,
  deleteBusiness,
  BusinessWithLatestAnalysis,
  cleanupDuplicateBusinesses,
} from '../lib/database';

export function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<BusinessWithLatestAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [businessToDelete, setBusinessToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentAnalysisId, setPaymentAnalysisId] = useState<string | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'extracting' | 'analyzing' | 'saving' | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    sessionId: string | null;
    apiCallStatus: 'idle' | 'pending' | 'success' | 'error';
    apiResponse: any;
    lastPollStatus: any;
  }>({
    sessionId: null,
    apiCallStatus: 'idle',
    apiResponse: null,
    lastPollStatus: null,
  });
  const [triggeringAnalysis, setTriggeringAnalysis] = useState<string | null>(null);

  useEffect(() => {
    loadBusinesses();
  }, []);

  // Fallback: Check for recent paid analyses that haven't completed (in case session_id is missing)
  useEffect(() => {
    const checkForPendingPaidAnalyses = async () => {
      // Only check if we're not already processing a payment and no session_id in URL
      const sessionId = searchParams.get('session_id');
      if (sessionId || processingPayment || !user) {
        return;
      }

      try {
        console.log('[Dashboard] Fallback: Checking for recent paid analyses that need processing');
        
        // Look for analyses that are paid but not completed (created in last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        const { data: pendingAnalyses, error } = await supabase
          .from('analyses')
          .select('id, stripe_checkout_session_id, created_at, payment_status, status, review_count')
          .eq('user_id', user.id)
          .eq('payment_status', 'paid')
          .neq('status', 'completed')
          .or('review_count.is.null,review_count.eq.0')
          .gte('created_at', fiveMinutesAgo)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('[Dashboard] Fallback: Error checking for pending analyses:', error);
          return;
        }

        if (pendingAnalyses && pendingAnalyses.length > 0) {
          const pendingAnalysis = pendingAnalyses[0];
          console.log('[Dashboard] Fallback: Found paid analysis that needs processing:', {
            analysisId: pendingAnalysis.id,
            sessionId: pendingAnalysis.stripe_checkout_session_id,
            status: pendingAnalysis.status
          });

          // If we have a Stripe session ID, try to use it to trigger confirmation
          if (pendingAnalysis.stripe_checkout_session_id) {
            console.log('[Dashboard] Fallback: Using Stripe session ID to trigger confirmation');
            handlePaymentConfirmation(pendingAnalysis.stripe_checkout_session_id);
          } else {
            // Otherwise, trigger analysis directly
            console.log('[Dashboard] Fallback: No session ID, triggering analysis directly');
            handleManualTriggerAnalysis(pendingAnalysis.id);
          }
        }
      } catch (err) {
        console.error('[Dashboard] Fallback: Error in checkForPendingPaidAnalyses:', err);
      }
    };

    // Wait a bit before checking (give normal flow a chance)
    const timeoutId = setTimeout(() => {
      checkForPendingPaidAnalyses();
    }, 2000);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams, processingPayment]);

  // Check for session_id in URL and trigger analysis
  useEffect(() => {
    console.log('[Dashboard] useEffect triggered - checking for session_id', {
      searchParams: Object.fromEntries(searchParams.entries()),
      hasUser: !!user,
      userId: user?.id,
      processingPayment,
      currentUrl: window.location.href
    });
    
    const sessionId = searchParams.get('session_id');
    console.log('[Dashboard] session_id from URL:', sessionId);
    
    // Update debug info
    setDebugInfo(prev => ({ ...prev, sessionId }));
    
    if (sessionId && user && !processingPayment) {
      console.log('[Dashboard] Conditions met - calling handlePaymentConfirmation', {
        sessionId,
        userId: user.id,
        processingPayment
      });
      handlePaymentConfirmation(sessionId);
    } else {
      console.log('[Dashboard] Conditions NOT met for payment confirmation', {
        hasSessionId: !!sessionId,
        hasUser: !!user,
        isProcessingPayment: processingPayment
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, processingPayment]);

  const loadBusinesses = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getUserBusinesses();
      setBusinesses(data);
    } catch (err: any) {
      console.error('Failed to load businesses:', err);
      setError(err.message || 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentConfirmation = async (sessionId: string) => {
    console.log('[Dashboard] ===== PAYMENT CONFIRMATION START =====');
    console.log('[Dashboard] handlePaymentConfirmation called', {
      sessionId,
      processingPayment,
      timestamp: new Date().toISOString()
    });
    
    // Prevent duplicate calls - check both state and if already processing
    if (processingPayment) {
      console.warn('[Dashboard] Already processing payment - skipping duplicate call');
      return; // Prevent duplicate calls
    }
    
    // Additional guard: Check if we're already processing this specific session
    const currentSessionId = searchParams.get('session_id');
    if (currentSessionId !== sessionId) {
      console.warn('[Dashboard] Session ID mismatch - skipping', {
        requestedSessionId: sessionId,
        currentSessionId
      });
      return;
    }

    setProcessingPayment(true);
    setError('');

    try {
      console.log('[Dashboard] Step 1: Getting auth session');
      // Get auth token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('[Dashboard] Auth session result', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length,
        error: sessionError
      });
      
      if (!session) {
        console.error('[Dashboard] No auth session found');
        throw new Error('Not authenticated');
      }

      const apiUrl = '/api/confirm-payment';
      const requestBody = { session_id: sessionId };
      const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      console.log('[Dashboard] Step 2: Calling confirm-payment API', {
        url: apiUrl,
        method: 'POST',
        headers: {
          'Content-Type': requestHeaders['Content-Type'],
          'Authorization': `Bearer ${session.access_token.substring(0, 20)}...` // Log partial token
        },
        body: requestBody,
        timestamp: new Date().toISOString()
      });

      // Update debug info
      setDebugInfo(prev => ({ ...prev, apiCallStatus: 'pending' }));
      
      const fetchStartTime = Date.now();
      
      // Call confirm-payment API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      const fetchDuration = Date.now() - fetchStartTime;
      console.log('[Dashboard] Step 3: API response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        duration: `${fetchDuration}ms`,
        timestamp: new Date().toISOString()
      });

      let result;
      try {
        const responseText = await response.text();
        console.log('[Dashboard] Raw response body:', responseText.substring(0, 500));
        
        result = JSON.parse(responseText);
        console.log('[Dashboard] Parsed response JSON:', result);
      } catch (parseError) {
        console.error('[Dashboard] Failed to parse response as JSON', {
          error: parseError,
          responseText: await response.text()
        });
        throw new Error('Invalid JSON response from server');
      }

      if (!response.ok) {
        console.error('[Dashboard] Step 4: API returned error status', {
          status: response.status,
          statusText: response.statusText,
          result
        });
        
        // Update debug info
        setDebugInfo(prev => ({ 
          ...prev, 
          apiCallStatus: 'error',
          apiResponse: result
        }));
        
        // Extract error code and message from response
        const errorCode = result.error || 'UNKNOWN_ERROR';
        const errorMessage = result.message || result.error || 'Failed to confirm payment';
        
        console.error('[Dashboard] Payment confirmation failed:', {
          errorCode,
          errorMessage,
          details: result.details,
          fullResponse: result
        });
        
        setErrorCode(errorCode);
        
        // Provide specific error messages based on error code
        let userMessage = errorMessage;
        if (errorCode === 'EXTRACTION_FAILED') {
          userMessage = 'Failed to extract reviews from Google Maps. Please try again or contact support if this persists.';
        } else if (errorCode === 'ANALYSIS_FAILED') {
          userMessage = 'Failed to analyze reviews with AI. Please try again or contact support.';
        } else if (errorCode === 'SAVE_FAILED') {
          userMessage = 'Analysis completed but failed to save results. Please contact support.';
        } else if (errorCode === 'Analysis not found') {
          userMessage = 'Analysis record not found. Please contact support.';
        }
        
        setError(userMessage);
        setPaymentAnalysisId(result.analysisId || null);
        console.log('[Dashboard] ===== PAYMENT CONFIRMATION FAILED =====');
        return;
      }

      console.log('[Dashboard] Step 4: API call successful', {
        success: result.success,
        analysisId: result.analysisId,
        status: result.status,
        message: result.message
      });
      
      // Update debug info
      setDebugInfo(prev => ({ 
        ...prev, 
        apiCallStatus: 'success',
        apiResponse: result
      }));
      
      console.log('[Dashboard] Payment confirmed, analysis triggered:', result.analysisId);
      setPaymentAnalysisId(result.analysisId);
      setErrorCode(null);

      // Remove session_id from URL
      console.log('[Dashboard] Step 5: Removing session_id from URL');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });

      // Poll for analysis completion
      console.log('[Dashboard] Step 6: Starting to poll for analysis completion');
      await pollForAnalysisCompletion(result.analysisId);
      
      console.log('[Dashboard] ===== PAYMENT CONFIRMATION SUCCESS =====');

    } catch (err: any) {
      console.error('[Dashboard] ===== PAYMENT CONFIRMATION EXCEPTION =====');
      console.error('[Dashboard] Exception details:', {
        error: err,
        message: err.message,
        stack: err.stack,
        name: err.name,
        timestamp: new Date().toISOString()
      });
      setErrorCode('NETWORK_ERROR');
      setError(err.message || 'Failed to process payment. Please refresh the page.');
    } finally {
      console.log('[Dashboard] Payment confirmation flow complete - setting processingPayment to false');
      setProcessingPayment(false);
    }
  };

  const pollForAnalysisCompletion = async (analysisId: string) => {
    console.log('[Dashboard] ===== POLLING START =====', {
      analysisId,
      timestamp: new Date().toISOString()
    });
    
    const maxAttempts = 300; // 300 attempts = 5 minutes max (allows for longer analyses including Apify extraction)
    let attempts = 0;
    let consecutive400Errors = 0; // Track consecutive 400 errors to stop polling

    const checkAnalysis = async (): Promise<boolean> => {
      attempts++;
      const checkStartTime = Date.now();
      
      console.log(`[Dashboard] Poll attempt ${attempts}/${maxAttempts}`, {
        analysisId,
        timestamp: new Date().toISOString()
      });
      
      try {
        const { data: analysis, error } = await supabase
          .from('analyses')
          .select('status, review_count, payment_status, stripe_checkout_session_id, created_at')
          .eq('id', analysisId)
          .single();

        const checkDuration = Date.now() - checkStartTime;
        
        if (error) {
          // Check if it's a 400 error (likely column doesn't exist or RLS issue)
          const is400Error = error.code === 'PGRST116' || error.message?.includes('400') || 
                           (error as any).status === 400 || (error as any).statusCode === 400;
          
          if (is400Error) {
            consecutive400Errors++;
            console.error(`[Dashboard] Poll attempt ${attempts} - 400 Bad Request error (${consecutive400Errors} consecutive):`, {
              error,
              errorCode: error.code,
              errorMessage: error.message,
              errorDetails: error,
              analysisId,
              duration: `${checkDuration}ms`
            });
            
            // Stop polling after 3 consecutive 400 errors
            if (consecutive400Errors >= 3) {
              console.error('[Dashboard] ===== STOPPING POLLING DUE TO REPEATED 400 ERRORS =====', {
                analysisId,
                consecutive400Errors,
                totalAttempts: attempts
              });
              setAnalysisStatus(null);
              setError('Unable to check analysis status. The database schema may be out of date. Please refresh the page or contact support.');
              setErrorCode('DATABASE_ERROR');
              return true; // Stop polling
            }
          } else {
            // Reset counter for non-400 errors
            consecutive400Errors = 0;
            console.error(`[Dashboard] Poll attempt ${attempts} - Database error:`, {
              error,
              errorCode: error.code,
              errorMessage: error.message,
              analysisId,
              duration: `${checkDuration}ms`
            });
          }
          return false;
        }
        
        // Reset error counter on successful query
        consecutive400Errors = 0;
        
        console.log(`[Dashboard] Poll attempt ${attempts} - Analysis status:`, {
          analysisId,
          status: analysis.status,
          reviewCount: analysis.review_count,
          paymentStatus: analysis.payment_status,
          hasStripeSessionId: !!analysis.stripe_checkout_session_id,
          duration: `${checkDuration}ms`
        });
        
        // Update debug info
        setDebugInfo(prev => ({ 
          ...prev, 
          lastPollStatus: {
            status: analysis.status,
            reviewCount: analysis.review_count,
            paymentStatus: analysis.payment_status,
            attempt: attempts
          }
        }));

        // Update status display based on current status
        if (analysis.status === 'extracting') {
          setAnalysisStatus('extracting');
        } else if (analysis.status === 'analyzing') {
          setAnalysisStatus('analyzing');
        } else if (analysis.status === 'saving') {
          setAnalysisStatus('saving');
        }

        // Check if analysis is completed - MUST have status='completed' AND review_count > 0
        if (analysis.status === 'completed' && analysis.review_count > 0) {
          console.log('[Dashboard] ===== ANALYSIS COMPLETED =====', {
            analysisId,
            reviewCount: analysis.review_count,
            attempts,
            totalDuration: `${attempts * 1000}ms`
          });
          setAnalysisComplete(true);
          setAnalysisStatus(null);
          // Reload businesses to show updated data
          console.log('[Dashboard] Reloading businesses to show updated data');
          await loadBusinesses();
          return true;
        }

        // Check if analysis failed
        if (analysis.status === 'failed') {
          console.error('[Dashboard] ===== ANALYSIS FAILED =====', {
            analysisId,
            attempts
          });
          setAnalysisStatus(null);
          // Note: error_message column may not exist, so we use a generic message
          setError('Analysis failed. Please try running it again using the "Run Analysis Now" button.');
          setErrorCode('ANALYSIS_FAILED');
          return true; // Stop polling
        }
        
        // Check if analysis has been stuck in extracting status for too long (10+ minutes)
        // This indicates the API handler likely timed out
        if (analysis.status === 'extracting' && analysis.created_at) {
          const createdTime = new Date(analysis.created_at).getTime();
          const now = Date.now();
          const stuckDuration = now - createdTime;
          const stuckThreshold = 10 * 60 * 1000; // 10 minutes
          
          if (stuckDuration > stuckThreshold) {
            console.warn('[Dashboard] Analysis appears to be stuck in extracting status', {
              analysisId,
              stuckDuration: `${Math.round(stuckDuration / 1000)}s`,
              created_at: analysis.created_at
            });
            // Don't stop polling yet, but log the warning
            // The timeout handler will provide retry options
          }
        }

        return false; // Continue polling
      } catch (err) {
        console.error(`[Dashboard] Poll attempt ${attempts} - Exception:`, {
          error: err,
          message: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : undefined
        });
        return false;
      }
    };

    // Poll every second
    console.log('[Dashboard] Starting polling loop');
    while (attempts < maxAttempts) {
      const isComplete = await checkAnalysis();
      if (isComplete) {
        console.log('[Dashboard] ===== POLLING COMPLETE =====');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Timeout - analysis is taking too long
    console.warn('[Dashboard] ===== POLLING TIMEOUT =====', {
      maxAttempts,
      analysisId,
      totalDuration: `${maxAttempts * 1000}ms`
    });
    
    // Check one more time to see if analysis completed or failed while we were polling
    const finalCheck = await checkAnalysis();
    if (finalCheck) {
      console.log('[Dashboard] Analysis completed on final check after timeout');
      return;
    }
    
    setAnalysisStatus(null);
    setError('Analysis is taking longer than expected (over 5 minutes). The analysis may still be running in the background. Please refresh the page in a moment to check the status, or use the "Run Analysis Now" button if it appears.');
    setErrorCode('TIMEOUT');
  };

  const handleUpdateName = async (businessId: string, newName: string) => {
    try {
      await updateBusinessName(businessId, newName);
      setBusinesses((prev) =>
        prev.map((b) => (b.id === businessId ? { ...b, business_name: newName } : b))
      );
    } catch (err: any) {
      console.error('Failed to update business name:', err);
      throw err;
    }
  };

  const handleDeleteClick = (businessId: string) => {
    setBusinessToDelete(businessId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!businessToDelete) return;

    try {
      setDeleting(true);
      await deleteBusiness(businessToDelete);
      setBusinesses((prev) => prev.filter((b) => b.id !== businessToDelete));
      setShowDeleteModal(false);
      setBusinessToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete business:', err);
      alert('Failed to delete business. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleManualTriggerAnalysis = async (analysisId: string) => {
    console.log('[Dashboard] Manual trigger analysis requested for:', analysisId);
    
    // Prevent duplicate triggers
    if (triggeringAnalysis === analysisId) {
      console.warn('[Dashboard] Already triggering this analysis - skipping duplicate call');
      return;
    }
    
    // Prevent if already processing payment
    if (processingPayment) {
      console.warn('[Dashboard] Payment processing in progress - skipping manual trigger');
      setError('Please wait for payment processing to complete.');
      return;
    }
    
    setTriggeringAnalysis(analysisId);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      console.log('[Dashboard] Calling /api/trigger-analysis');
      const response = await fetch('/api/trigger-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ analysisId }),
      });

      const result = await response.json();
      console.log('[Dashboard] Trigger analysis response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to trigger analysis');
      }

      console.log('[Dashboard] Analysis triggered successfully, starting to poll');
      setPaymentAnalysisId(analysisId);
      await pollForAnalysisCompletion(analysisId);
    } catch (err: any) {
      console.error('[Dashboard] Manual trigger failed:', err);
      setError(err.message || 'Failed to trigger analysis. Please try again.');
    } finally {
      setTriggeringAnalysis(null);
    }
  };

  const handleCleanupDuplicates = async () => {
    try {
      setCleaningUp(true);
      setCleanupMessage('');
      const result = await cleanupDuplicateBusinesses();

      if (result.cleaned > 0) {
        setCleanupMessage(`Cleaned up ${result.cleaned} duplicate business${result.cleaned !== 1 ? 'es' : ''}. Kept ${result.kept} unique business${result.kept !== 1 ? 'es' : ''}.`);
        await loadBusinesses();
      } else {
        setCleanupMessage('No duplicates found. Your businesses are already clean!');
      }

      setTimeout(() => setCleanupMessage(''), 5000);
    } catch (err: any) {
      console.error('Failed to cleanup duplicates:', err);
      setCleanupMessage('Failed to cleanup duplicates. Please try again.');
      setTimeout(() => setCleanupMessage(''), 5000);
    } finally {
      setCleaningUp(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading your businesses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 mb-2">Your Businesses</h1>
            <p className="text-lg text-slate-600">
              Manage and track your business analysis reports
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCleanupDuplicates}
              disabled={cleaningUp}
              className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-lg transition-all shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Merge duplicate businesses"
            >
              {cleaningUp ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
              {cleaningUp ? 'Cleaning...' : 'Clean Duplicates'}
            </button>
            <Link
              to="/"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-5 h-5" />
              New Analysis
            </Link>
          </div>
        </div>

        {cleanupMessage && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-green-700 font-semibold">{cleanupMessage}</p>
          </div>
        )}

        {processingPayment && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg mb-6">
            <div className="flex items-start gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-blue-800 font-bold text-lg mb-1">
                  {analysisStatus === 'extracting' && 'Extracting reviews from Google Maps...'}
                  {analysisStatus === 'analyzing' && 'Analyzing reviews with AI...'}
                  {analysisStatus === 'saving' && 'Saving analysis results...'}
                  {!analysisStatus && 'Running analysis...'}
                </p>
                <p className="text-blue-700">
                  {analysisStatus === 'extracting' && 'Fetching customer reviews from Google Maps. This may take 10-20 seconds.'}
                  {analysisStatus === 'analyzing' && 'AI is analyzing review patterns to identify root causes and generate insights. This may take 20-30 seconds.'}
                  {analysisStatus === 'saving' && 'Saving all analysis results to your dashboard. Almost done!'}
                  {!analysisStatus && "We're extracting reviews and generating your analysis report. This may take a minute."}
                </p>
              </div>
            </div>
          </div>
        )}

        {analysisComplete && paymentAnalysisId && (
          <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-green-800 font-bold text-lg mb-2">Analysis complete!</p>
                <p className="text-green-700 mb-3">
                  Your analysis report is ready to view.
                </p>
                <Link
                  to={`/report/${paymentAnalysisId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                >
                  View Report
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Debug Panel - Only show if there's a session_id or processing */}
        {(debugInfo.sessionId || processingPayment || debugInfo.apiCallStatus !== 'idle') && (
          <div className="bg-slate-100 border-2 border-slate-300 p-4 rounded-lg mb-6 font-mono text-xs">
            <div className="font-bold text-slate-800 mb-2">🔍 Debug Info</div>
            <div className="space-y-1 text-slate-700">
              <div><strong>Session ID:</strong> {debugInfo.sessionId || 'None'}</div>
              <div><strong>API Call Status:</strong> <span className={debugInfo.apiCallStatus === 'error' ? 'text-red-600' : debugInfo.apiCallStatus === 'success' ? 'text-green-600' : ''}>{debugInfo.apiCallStatus}</span></div>
              {debugInfo.apiResponse && (
                <div><strong>API Response:</strong> <pre className="mt-1 p-2 bg-slate-200 rounded overflow-auto max-h-32">{JSON.stringify(debugInfo.apiResponse, null, 2)}</pre></div>
              )}
              {debugInfo.lastPollStatus && (
                <div>
                  <strong>Last Poll Status:</strong>
                  <div className="ml-2 mt-1">
                    <div>Status: {debugInfo.lastPollStatus.status}</div>
                    <div>Review Count: {debugInfo.lastPollStatus.reviewCount || 0}</div>
                    <div>Payment Status: {debugInfo.lastPollStatus.paymentStatus}</div>
                    <div>Attempt: {debugInfo.lastPollStatus.attempt}</div>
                    {debugInfo.lastPollStatus.errorMessage && (
                      <div className="text-red-600">Error: {debugInfo.lastPollStatus.errorMessage}</div>
                    )}
                  </div>
                </div>
              )}
              <div><strong>Processing Payment:</strong> {processingPayment ? 'Yes' : 'No'}</div>
              <div><strong>Analysis Status:</strong> {analysisStatus || 'None'}</div>
              <div><strong>Analysis Complete:</strong> {analysisComplete ? 'Yes' : 'No'}</div>
              <div><strong>Payment Analysis ID:</strong> {paymentAnalysisId || 'None'}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-700 font-semibold mb-1">{error}</p>
                {(errorCode === 'EXTRACTION_FAILED' || errorCode === 'ANALYSIS_FAILED' || errorCode === 'SAVE_FAILED') && (
                  <div className="mt-2">
                    <button
                      onClick={async () => {
                        const sessionId = searchParams.get('session_id');
                        if (sessionId) {
                          setError('');
                          setErrorCode(null);
                          await handlePaymentConfirmation(sessionId);
                        } else if (paymentAnalysisId) {
                          // Retry by checking if analysis can be re-run
                          setError('');
                          setErrorCode(null);
                          setProcessingPayment(true);
                          await pollForAnalysisCompletion(paymentAnalysisId);
                          setProcessingPayment(false);
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-800 underline font-medium"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {errorCode === 'TIMEOUT' && (
                  <div className="mt-2 flex gap-3">
                    <button
                      onClick={() => {
                        window.location.reload();
                      }}
                      className="text-sm text-red-600 hover:text-red-800 underline font-medium"
                    >
                      Refresh page
                    </button>
                    {paymentAnalysisId && (
                      <button
                        onClick={async () => {
                          setError('');
                          setErrorCode(null);
                          setProcessingPayment(true);
                          await pollForAnalysisCompletion(paymentAnalysisId);
                          setProcessingPayment(false);
                        }}
                        className="text-sm text-red-600 hover:text-red-800 underline font-medium"
                      >
                        Continue polling
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {businesses.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-12 text-center">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Get Started with ServiceSift
            </h2>
            <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
              Analyze your first business to unlock powerful insights from customer reviews. Discover
              root causes, get coaching scripts, and build a 30-day action plan.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-lg rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-6 h-6" />
              Analyze Your First Business
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses.map((business) => {
              // Check if there's a paid analysis that hasn't completed
              // We need to check all analyses, not just latest_analysis
              const allAnalyses = (business as any).analyses || [];
              const paidIncompleteAnalysis = allAnalyses.find((a: any) => 
                a.payment_status === 'paid' && 
                a.status !== 'completed' && 
                (a.review_count === 0 || !a.review_count)
              );

              return (
                <div key={business.id}>
                  <BusinessCard
                    business={business}
                    onUpdateName={handleUpdateName}
                    onDelete={handleDeleteClick}
                  />
                  {paidIncompleteAnalysis && (
                    <div className="mt-4 bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
                      <p className="text-yellow-800 font-semibold mb-2">
                        ⚠️ Analysis paid but not completed
                      </p>
                      <p className="text-yellow-700 text-sm mb-3">
                        The analysis was paid for but didn't run automatically. Click below to trigger it manually.
                      </p>
                      <button
                        onClick={() => handleManualTriggerAnalysis(paidIncompleteAnalysis.id)}
                        disabled={triggeringAnalysis !== null}
                        className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {triggeringAnalysis === paidIncompleteAnalysis.id ? 'Triggering...' : 'Run Analysis Now'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Delete Business?</h2>
            <p className="text-slate-600 mb-6 text-center">
              This will permanently delete this business and all associated analyses. This action cannot
              be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setBusinessToDelete(null);
                }}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
