import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, Download, RotateCcw, TrendingUp, Users, FileText, ArrowRight, AlertCircle, Link as LinkIcon, Search, FileCheck, Copy, Target, Wrench, ClipboardList, Star, Edit2, ChevronDown, Eye, Share2, Save, RefreshCw } from 'lucide-react';
import { demoExtractedData, demoAnalysisData } from '../demoData';
import { useAuth } from '../contexts/AuthContext';
import {
  getBusinessByUrl,
  getBusinessById,
  getBaselineAnalysis,
  getAnalysisByStripeSessionId,
  createBusiness,
  createAnalysis,
  deleteAnalysis,
  saveRootCauses,
  saveCoachingScripts,
  saveProcessChanges,
  saveBacklogTasks,
  saveReviews,
} from '../lib/database';
import { guardAgainstPostPaymentInsert } from '../lib/analysisGuard';
import { compareAnalyses, saveDeltaAnalysis } from '../lib/deltaAnalysis';
import { PaymentModal } from '../components/PaymentModal';
import { FIRST_ANALYSIS_PRICE, REANALYSIS_PRICE } from '../lib/stripe';
import { supabase } from '../lib/supabase';

type ViewState = 'landing' | 'loading' | 'results' | 'extraction_error';
type LoadingStage = 'fetching' | 'fallback' | 'analyzing';

interface ExtractedReview {
  rating: number;
  text: string;
  date: string;
  author: string;
}

interface ExtractionResponse {
  success: boolean;
  source?: string;
  businessName?: string;
  totalScore?: number;
  reviewCount?: number;
  reviews?: ExtractedReview[];
  error?: string;
  extractionMethod?: 'primary' | 'fallback';
}

interface RootCause {
  title: string;
  severity: 'High' | 'Medium' | 'Low';
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
  effort: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
  owner: string;
}

interface AnalysisResult {
  topRootCauses: RootCause[];
  staffCoaching: StaffCoaching[];
  processChanges: ProcessChange[];
  backlog: BacklogItem[];
}

interface AnalysisResponse {
  success: boolean;
  analysis?: AnalysisResult;
  error?: string;
}

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [viewState, setViewState] = useState<ViewState>('landing');
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('fetching');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractionResponse | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [copyToastMessage, setCopyToastMessage] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [customBusinessName, setCustomBusinessName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [expandedCauseIndex, setExpandedCauseIndex] = useState(0);
  const [showJumpNav, setShowJumpNav] = useState(false);
  const [activeSection, setActiveSection] = useState('rootCauses');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isReanalysis, setIsReanalysis] = useState(false);
  const [reanalysisBusinessId, setReanalysisBusinessId] = useState<string | null>(null);
  const [reanalysisBusinessName, setReanalysisBusinessName] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [pendingAnalysisId, setPendingAnalysisId] = useState<string | null>(null);
  // Draft data for deferred analysis creation
  const [pendingBusinessId, setPendingBusinessId] = useState<string | null>(null);
  const [pendingBusinessName, setPendingBusinessName] = useState<string>('');
  const [pendingIsBaseline, setPendingIsBaseline] = useState<boolean>(true);
  const [pendingUrl, setPendingUrl] = useState<string>('');

  const headerRef = useRef<HTMLDivElement>(null);
  const rootCausesRef = useRef<HTMLDivElement>(null);
  const coachingRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  const backlogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const businessId = searchParams.get('businessId');
    if (businessId && user) {
      loadBusinessForReanalysis(businessId);
    }
  }, [searchParams, user]);

  // OLD PAYMENT FLOW - DISABLED
  // Payment confirmation is now handled in Dashboard.tsx via /api/confirm-payment
  // This prevents duplicate analysis creation
  // useEffect(() => {
  //   const sessionId = searchParams.get('session_id');
  //   const urlParam = searchParams.get('url');
  //   const businessIdParam = searchParams.get('businessId');

  //   if (sessionId && urlParam) {
  //     const decodedUrl = decodeURIComponent(urlParam);
  //     setUrl(decodedUrl);
  //     setPaymentSessionId(sessionId);

  //     if (businessIdParam) {
  //       setReanalysisBusinessId(businessIdParam);
  //       setIsReanalysis(true);
  //       loadBusinessForReanalysis(businessIdParam);
  //     }

  //     setTimeout(() => {
  //       handleAnalyzeAfterPayment(sessionId);
  //     }, 100);
  //   }
  // }, [searchParams]);

  useEffect(() => {
    if (viewState === 'loading') {
      const blockNavigation = (e: PopStateEvent) => {
        window.history.pushState(null, '', window.location.href);
        e.preventDefault();
      };

      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', blockNavigation);

      return () => {
        window.removeEventListener('popstate', blockNavigation);
      };
    }
  }, [viewState]);

  const loadBusinessForReanalysis = async (businessId: string) => {
    try {
      const business = await getBusinessById(businessId);
      if (business) {
        setUrl(business.google_maps_url);
        setCustomBusinessName(business.business_name);
        setIsReanalysis(true);
        setReanalysisBusinessId(businessId);
        setReanalysisBusinessName(business.business_name);
      }
    } catch (err) {
      console.error('Failed to load business for reanalysis:', err);
    }
  };

  const validateUrl = (input: string) => {
    if (!input) {
      setError('');
      return false;
    }

    const isValid = input.includes('google.com/maps') || input.includes('yelp.com');
    setError(isValid ? '' : 'Please enter a valid Google Maps or Yelp URL');
    return isValid;
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUrl(value);
    validateUrl(value);
  };

  const handleAnalyze = async () => {
    if (!validateUrl(url)) return;

    if (!user) {
      navigate('/login');
      return;
    }

    try {
      // Get or create business
      let business = await getBusinessByUrl(url);
      const businessName = customBusinessName || extractedData?.businessName || 'Your Business';
      let isBaseline = !business;

      // Check if this is a reanalysis
      if (business && !isReanalysis) {
        console.log('[Payment] Existing business found, checking for baseline');
        const baselineAnalysis = await getBaselineAnalysis(business.id);
        if (baselineAnalysis) {
          console.log('[Payment] Baseline exists, this is a re-analysis');
          setIsReanalysis(true);
          setReanalysisBusinessId(business.id);
          setReanalysisBusinessName(business.business_name);
          isBaseline = false;
        }
      }

      // If reanalysis, get the business
      if (isReanalysis && reanalysisBusinessId) {
        business = await getBusinessById(reanalysisBusinessId);
        if (!business) {
          throw new Error('Business not found for reanalysis');
        }
        isBaseline = false;
      }

      // Create business if it doesn't exist
      if (!business) {
        console.log('[Payment] Creating new business record');
        business = await createBusiness(businessName, url);
      }

      // Store draft data for payment modal (NO analysis created yet)
      console.log('[Payment] Preparing payment modal with draft data');
      setPendingBusinessId(business.id);
      setPendingBusinessName(businessName);
      setPendingIsBaseline(isBaseline);
      setPendingUrl(url);

      // Open payment modal (analysis will be created when user clicks Pay Now)
      setShowPaymentModal(true);
    } catch (err) {
      console.error('[Payment] Error preparing payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to prepare payment. Please try again.');
    }
  };

  const handleAnalyzeAfterPayment = async (sessionId: string) => {
    console.log('[Analytics] Analysis started after payment for URL:', url);
    setViewState('loading');
    setLoadingStage('fetching');
    setLoadingMessage('Extracting reviews from Google Maps...');
    setError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/extract-reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          url,
          maxReviews: 200,
        }),
      });

      console.log('Extract response status:', response.status);
      console.log('Extract response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Extract API error:', errorText);
        setViewState('extraction_error');
        return;
      }

      const data: ExtractionResponse = await response.json();
      console.log('Extract response data:', data);
      console.log('Extraction method:', data.extractionMethod);

      if (!data.success) {
        console.log('[Analytics] Extraction failed');
        setViewState('extraction_error');
        return;
      }

      console.log('[Analytics] Extraction successful:', data.reviewCount, 'reviews');
      setExtractedData(data);
      setLoadingStage('analyzing');
      setLoadingMessage(`Found ${data.reviewCount} reviews! Analyzing patterns with AI...`);

      const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          businessName: data.businessName,
          reviews: data.reviews?.map(r => ({
            text: r.text,
            rating: r.rating,
            date: r.date,
          })),
        }),
      });

      console.log('Analysis response status:', analysisResponse.status);

      if (!analysisResponse.ok) {
        const errorText = await analysisResponse.text();
        console.error('Analysis API error:', errorText);
      }

      const analysisResult: AnalysisResponse = await analysisResponse.json();
      console.log('Analysis response data:', analysisResult);

      if (!analysisResult.success) {
        console.error('[Analytics] Analysis failed:', analysisResult.error);
      } else {
        console.log('[Analytics] Analysis completed successfully');
      }

      setAnalysisData(analysisResult.analysis || null);
      setViewState('results');

    } catch (err) {
      console.error('[Analytics] Error during analysis:', err);
      setViewState('extraction_error');
    }
  };

  const handleCancelAnalysis = () => {
    console.log('[Analytics] Analysis cancelled by user');
    setViewState('landing');
    setLoadingStage('fetching');
    setLoadingMessage('');
  };

  const handleTryDemo = () => {
    console.log('[Analytics] Demo mode activated');
    setExtractedData(demoExtractedData);
    setAnalysisData(demoAnalysisData);
    setIsDemoMode(true);
    setViewState('results');
  };

  const handleStartNew = () => {
    setViewState('landing');
    setUrl('');
    setError('');
    setExtractedData(null);
    setAnalysisData(null);
    setCustomBusinessName('');
    setIsEditingName(false);
    setExpandedCauseIndex(0);
    setCopyToastMessage('');
    setCopiedSection(null);
    setShowJumpNav(false);
    setActiveSection('rootCauses');
    setIsDemoMode(false);
    setIsSaving(false);
    setIsSaved(false);
  };

  const handleSaveToDashboard = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (isDemoMode) {
      setCopyToastMessage('Cannot save demo data. Please analyze a real business.');
      setTimeout(() => setCopyToastMessage(''), 3000);
      return;
    }

    if (!extractedData || !analysisData || !url) {
      setCopyToastMessage('Missing analysis data');
      setTimeout(() => setCopyToastMessage(''), 3000);
      return;
    }

    // HARD GUARD: Check if we're in a payment flow - if so, disable save/create
    try {
      guardAgainstPostPaymentInsert(paymentSessionId, searchParams, 'handleSaveToDashboard');
    } catch (guardError) {
      console.error('[Analytics] BLOCKED by guard:', guardError);
      setCopyToastMessage('Cannot save analysis during payment flow. Please wait for payment confirmation.');
      setTimeout(() => setCopyToastMessage(''), 5000);
      return;
    }

    setIsSaving(true);
    console.log('[Analytics] Saving analysis to database');

    try {
      let business = await getBusinessByUrl(url);
      const businessName = getBusinessName();
      let isBaseline = !business;

      if (isReanalysis && reanalysisBusinessId) {
        business = await getBusinessById(reanalysisBusinessId);
        if (!business) {
          throw new Error('Business not found for reanalysis');
        }
        isBaseline = false;
      }

      if (!business) {
        console.log('[Analytics] Creating new business record');
        business = await createBusiness(businessName, url);
      }

      // CRITICAL: After payment, NEVER create a new analysis. Only use existing one.
      let analysisId: string;
      let existingAnalysis = null;

      // First check: pendingAnalysisId from payment flow
      if (pendingAnalysisId) {
        console.log('[Analytics] Using existing analysis record from payment flow:', pendingAnalysisId);
        analysisId = pendingAnalysisId;
        existingAnalysis = { id: analysisId };
      } 
      // Second check: Look for existing analysis by Stripe session ID (prevents duplicates)
      else if (paymentSessionId) {
        console.log('[Analytics] Checking for existing analysis by Stripe session ID:', paymentSessionId);
        existingAnalysis = await getAnalysisByStripeSessionId(paymentSessionId);
        if (existingAnalysis) {
          console.log('[Analytics] Found existing analysis:', existingAnalysis.id);
          analysisId = existingAnalysis.id;
        } else {
          // CRITICAL: If paymentSessionId exists but no analysis found, this is an error
          // DO NOT create a new analysis - the analysis MUST exist from payment flow
          console.error('[Analytics] CRITICAL: paymentSessionId exists but no analysis found:', paymentSessionId);
          throw new Error('Analysis not found for this payment. Please contact support.');
        }
      }

      // SAFETY ASSERTION: Check for duplicate analyses for same business + payment
      if (paymentSessionId && existingAnalysis) {
        const { data: duplicates, error: dupError } = await supabase
          .from('analyses')
          .select('id')
          .eq('business_id', business.id)
          .eq('stripe_checkout_session_id', paymentSessionId);
        
        if (!dupError && duplicates && duplicates.length > 1) {
          console.error('[Analytics] CRITICAL: Multiple analyses found for same payment:', {
            paymentSessionId,
            businessId: business.id,
            count: duplicates.length,
            ids: duplicates.map(d => d.id)
          });
          // Use the first one (oldest) and log the error
          analysisId = duplicates[0].id;
          existingAnalysis = { id: analysisId };
        }
      }

      // If we found an existing analysis, update it (don't create new)
      if (existingAnalysis) {
        console.log('[Analytics] Updating existing analysis record:', analysisId);
        
        // Update the existing analysis with payment info and mark as completed
        const { error: updateError } = await supabase
          .from('analyses')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            payment_id: paymentSessionId,
            amount_paid: isBaseline ? FIRST_ANALYSIS_PRICE : REANALYSIS_PRICE,
          })
          .eq('id', analysisId);
        
        if (updateError) {
          console.error('[Analytics] Failed to update analysis:', updateError);
          throw updateError;
        }
      } 
      // ONLY create new analysis if NO paymentSessionId exists (non-payment flow)
      else if (!paymentSessionId) {
        console.log('[Analytics] No payment session, creating new analysis record (non-payment flow)');
        const amount = isBaseline ? FIRST_ANALYSIS_PRICE : REANALYSIS_PRICE;
        analysisId = await createAnalysis(
          business.id,
          url,
          businessName,
          extractedData.reviewCount || 0,
          extractedData.totalScore || 0,
          isBaseline,
          null, // No payment session
          amount,
          'paid', // Non-payment flow assumes already paid
          'handleSaveToDashboard (non-payment)' // caller context
        );
      } else {
        // This should never happen due to the guard above, but add as safety
        throw new Error('Cannot save analysis: payment session exists but no analysis found.');
      }

      console.log('[Analytics] Saving reviews');
      if (extractedData.reviews && extractedData.reviews.length > 0) {
        try {
          await saveReviews(analysisId, extractedData.reviews);
          console.log('[Analytics] Reviews saved successfully');
        } catch (reviewError) {
          console.warn('[Analytics] Reviews not saved (non-critical):', reviewError);
        }
      }

      console.log('[Analytics] Saving root causes');
      await saveRootCauses(analysisId, analysisData.topRootCauses);

      console.log('[Analytics] Saving coaching scripts');
      await saveCoachingScripts(analysisId, analysisData.staffCoaching);

      console.log('[Analytics] Saving process changes');
      await saveProcessChanges(analysisId, analysisData.processChanges);

      console.log('[Analytics] Saving backlog tasks');
      await saveBacklogTasks(analysisId, analysisData.backlog);

      let hasDelta = false;

      if (!isBaseline) {
        console.log('[Analytics] Checking for baseline analysis');
        const baselineAnalysis = await getBaselineAnalysis(business.id);

        if (baselineAnalysis) {
          console.log('[Analytics] Running delta comparison');
          setLoadingMessage('Comparing with baseline analysis...');

          const deltaData = await compareAnalyses(baselineAnalysis.id, analysisId);

          console.log('[Analytics] Saving delta analysis');
          await saveDeltaAnalysis(analysisId, baselineAnalysis.id, deltaData);

          console.log('[Analytics] Delta comparison saved');
          setCopyToastMessage('Follow-up analysis complete - comparison with baseline saved!');
          hasDelta = true;
        } else {
          setCopyToastMessage('Analysis saved successfully!');
        }
      } else {
        setCopyToastMessage('Baseline analysis saved successfully!');
      }

      console.log('[Analytics] Analysis saved successfully');
      setIsSaved(true);
      setPendingAnalysisId(null); // Clear pending analysis ID after saving

      setTimeout(() => {
        if (hasDelta) {
          navigate(`/delta/${analysisId}`);
        } else {
          navigate(`/report/${analysisId}`);
        }
      }, 1500);
    } catch (err: any) {
      console.error('[Analytics] Failed to save analysis:', err);
      setCopyToastMessage('Failed to save analysis. Please try again.');
      setTimeout(() => setCopyToastMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const getValidExtractedName = () => {
    const name = extractedData?.businessName;
    if (name && name !== 'Unknown Business') return name;
    return null;
  };

  const getBusinessName = () => {
    if (customBusinessName) return customBusinessName;
    return getValidExtractedName() || 'Review Analysis Report';
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };

  const handleDownloadPdf = () => {
    console.log('[Analytics] PDF download initiated');
    let businessName = customBusinessName || getValidExtractedName() || 'Review-Analysis-Report';
    const filename = `ServiceSift-${sanitizeFilename(businessName)}-Review-Report.pdf`;

    const originalTitle = document.title;
    document.title = filename.replace('.pdf', '');

    window.print();

    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  const handleShareReport = async () => {
    console.log('[Analytics] Share report clicked');
    const shareText = `Check out my ServiceSift analysis for ${getBusinessName()}`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ServiceSift Report',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.log('Share cancelled or failed');
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopyToastMessage('Link copied to clipboard');
        setTimeout(() => setCopyToastMessage(''), 2000);
      } catch (err) {
        setCopyToastMessage('Unable to copy link');
        setTimeout(() => setCopyToastMessage(''), 2000);
      }
    }
  };

  const copySection = async (sectionName: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyToastMessage('Copied to clipboard ✅');
      setCopiedSection(sectionName);
      setTimeout(() => {
        setCopyToastMessage('');
        setCopiedSection(null);
      }, 2000);
    } catch (err) {
      setCopyToastMessage('Copy failed — please select and copy manually.');
      setTimeout(() => {
        setCopyToastMessage('');
      }, 2000);
    }
  };

  const handleEditName = () => {
    setIsEditingName(true);
    const validName = getValidExtractedName();
    if (!customBusinessName && validName) {
      setCustomBusinessName(validName);
    }
  };

  const handleSaveName = () => {
    setIsEditingName(false);
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (viewState !== 'results') return;

    const handleScroll = () => {
      const headerBottom = headerRef.current?.getBoundingClientRect().bottom || 0;
      setShowJumpNav(headerBottom < 0);

      const sections = [
        { id: 'rootCauses', ref: rootCausesRef },
        { id: 'coaching', ref: coachingRef },
        { id: 'process', ref: processRef },
        { id: 'backlog', ref: backlogRef },
      ];

      for (const section of sections) {
        const rect = section.ref.current?.getBoundingClientRect();
        if (rect && rect.top <= 150 && rect.bottom > 150) {
          setActiveSection(section.id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [viewState]);

  const isValidUrl = url && !error;

  if (viewState === 'loading') {
    const currentStep = loadingStage === 'fetching' || loadingStage === 'fallback' ? 1 : 2;
    const totalSteps = 2;
    const progress = (currentStep / totalSteps) * 100;
    const estimatedTime = loadingStage === 'analyzing' ? '20-30' : '30-40';

    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm pointer-events-auto" />
        <div className="max-w-md w-full relative z-10">
          <div className="bg-white rounded-xl shadow-2xl p-8 border-4 border-blue-500">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-900 font-bold text-sm mb-1">Analysis in Progress</p>
                <p className="text-yellow-800 text-sm">Please don't navigate away or close this window</p>
              </div>
            </div>
            <Loader2 className="w-20 h-20 text-blue-600 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">
              {loadingMessage || (
                loadingStage === 'fetching' ? 'Extracting reviews from Google Maps...' :
                loadingStage === 'fallback' ? 'Trying alternate method...' :
                'Analyzing patterns with AI...'
              )}
            </h2>
            <div className="mb-6">
              <div className="flex justify-between text-sm text-slate-600 mb-2">
                <span>Step {currentStep} of {totalSteps}</span>
                <span>~{estimatedTime} seconds remaining</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
            <p className="text-slate-600 text-center text-sm mb-6">
              {loadingStage === 'analyzing'
                ? 'Identifying root causes, generating coaching scripts, and creating your 30-day action plan...'
                : 'Extracting review text, ratings, and metadata from your Google Maps listing...'}
            </p>
            <button
              onClick={handleCancelAnalysis}
              className="w-full px-4 py-2 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'extraction_error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-slate-50 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-t-4 border-orange-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-100 rounded-full">
                <AlertCircle className="w-10 h-10 text-orange-600" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Unable to Extract Reviews</h2>
            </div>

            <div className="space-y-6 mb-8">
              <p className="text-lg text-slate-700 font-medium">
                We couldn't find reviews for this business. Make sure your business has visible Google reviews.
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-600 p-6 rounded-r-lg">
                <p className="text-slate-900 font-bold text-lg mb-4">Quick fixes to try:</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-slate-700">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm mt-0.5">1</div>
                    <span className="text-base">Click the <strong>'Share'</strong> button in Google Maps and copy that URL instead</span>
                  </li>
                  <li className="flex items-start gap-3 text-slate-700">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm mt-0.5">2</div>
                    <span className="text-base">Verify your business has <strong>visible reviews</strong> when you view it in Google Maps</span>
                  </li>
                  <li className="flex items-start gap-3 text-slate-700">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm mt-0.5">3</div>
                    <span className="text-base">Make sure you're linking to a <strong>single business location</strong>, not a parent company</span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-100 p-4 rounded-lg">
                <p className="text-sm text-slate-600">
                  <strong>Note:</strong> ServiceSift works best with gyms, restaurants, retail stores, and service businesses that have public Google reviews.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleStartNew}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl text-lg"
              >
                <RotateCcw className="w-5 h-5" />
                Try Another URL
              </button>
              <button
                onClick={handleTryDemo}
                className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700 font-semibold py-4 px-6 rounded-xl transition-colors text-lg"
              >
                <Eye className="w-5 h-5" />
                View Demo Instead
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'results') {
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4">
        {/* Re-analysis Mode Banner */}
        {isReanalysis && reanalysisBusinessName && !isDemoMode && (
          <div className="no-print fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in max-w-2xl w-full px-4">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg">Follow-up Analysis</p>
                  <p className="text-sm text-blue-50">Comparing with baseline for {reanalysisBusinessName}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Demo Mode Banner */}
        {isDemoMode && (
          <div className="no-print fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in max-w-2xl w-full px-4">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg">Demo Mode</p>
                  <p className="text-sm text-orange-50">Viewing sample data for Ogden Pizzeria</p>
                </div>
              </div>
              <button
                onClick={handleStartNew}
                className="px-4 py-2 bg-white text-orange-600 rounded-lg font-bold hover:bg-orange-50 transition-colors flex-shrink-0"
              >
                Analyze Real Data
              </button>
            </div>
          </div>
        )}

        {/* Copy Toast */}
        {copyToastMessage && (
          <div className={`no-print fixed ${isDemoMode ? 'top-24' : 'top-4'} right-4 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-fade-in ${
            copyToastMessage.includes('failed')
              ? 'bg-red-600 text-white'
              : 'bg-green-600 text-white'
          }`}>
            {copyToastMessage.includes('failed') ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            <span className="font-semibold">{copyToastMessage}</span>
          </div>
        )}

        {/* Jump Navigation */}
        {showJumpNav && (
          <div className={`no-print fixed ${isDemoMode ? 'top-24' : 'top-4'} left-1/2 transform -translate-x-1/2 z-40 animate-fade-in`}>
            <div className="bg-white rounded-full shadow-xl px-3 py-2 flex items-center gap-2 border-2 border-slate-200 overflow-x-auto max-w-[calc(100vw-2rem)]">
              <button
                onClick={() => scrollToSection(rootCausesRef)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                  activeSection === 'rootCauses'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Root Causes
              </button>
              <button
                onClick={() => scrollToSection(coachingRef)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                  activeSection === 'coaching'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Coaching Scripts
              </button>
              <button
                onClick={() => scrollToSection(processRef)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                  activeSection === 'process'
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Process Changes
              </button>
              <button
                onClick={() => scrollToSection(backlogRef)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                  activeSection === 'backlog'
                    ? 'bg-purple-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                30-Day Plan
              </button>
            </div>
          </div>
        )}

        {/* Print-Only Cover Page */}
        <div className="print-only hidden print-cover">
          <div className="mb-8">
            <h1 className="text-6xl font-bold text-slate-900 mb-4">{getBusinessName()}</h1>
            <h2 className="text-4xl font-semibold text-slate-700 mb-8">Review Analysis Report</h2>
            <p className="text-2xl text-slate-600 mb-4">{currentDate}</p>
            {extractedData?.reviewCount && (
              <p className="text-xl text-slate-500">Based on {extractedData.reviewCount} Google reviews</p>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div ref={headerRef} className="no-print bg-white rounded-xl shadow-lg p-8 mb-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  {isEditingName ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={customBusinessName}
                        onChange={(e) => setCustomBusinessName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') {
                            setCustomBusinessName('');
                            setIsEditingName(false);
                          }
                        }}
                        placeholder="Enter business name..."
                        autoFocus
                        className="text-4xl font-bold text-slate-900 border-2 border-blue-500 rounded-lg px-3 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <button
                        onClick={handleSaveName}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-4xl font-bold text-slate-900">
                        {getBusinessName()}
                      </h1>
                      <button
                        onClick={handleEditName}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors group"
                        title="Edit business name"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {extractedData?.totalScore && (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full font-semibold text-sm">
                      <Star className="w-4 h-4 fill-current" />
                      {extractedData.totalScore.toFixed(1)} Average Rating
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full font-semibold text-sm">
                    <FileCheck className="w-4 h-4" />
                    {extractedData?.reviewCount || 0} reviews analyzed
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full font-semibold text-sm">
                    Google Reviews
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-600 text-lg">
                    Actionable insights from customer feedback analysis
                  </p>
                  <p className="text-slate-500 text-sm">
                    Generated on {currentDate} • Powered by ServiceSift
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {user && !isDemoMode && (
                  <button
                    onClick={handleSaveToDashboard}
                    disabled={isSaving || isSaved}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaved ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Saved!
                      </>
                    ) : isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Save to Dashboard
                      </>
                    )}
                  </button>
                )}
                {!user && !isDemoMode && (
                  <button
                    onClick={() => navigate('/signup')}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
                  >
                    <Save className="w-5 h-5" />
                    Sign Up to Save
                  </button>
                )}
                <button
                  onClick={handleDownloadPdf}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
                >
                  <Download className="w-5 h-5" />
                  Download PDF
                </button>
                <button
                  onClick={handleShareReport}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
                >
                  <Share2 className="w-5 h-5" />
                  Share Report
                </button>
                <button
                  onClick={handleStartNew}
                  className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-300 hover:border-slate-400 bg-white text-slate-900 font-semibold rounded-lg transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  New Analysis
                </button>
              </div>
            </div>
          </div>

          {!analysisData && (
            <div className="bg-yellow-50 border-l-4 border-yellow-600 p-6 rounded-lg mb-8">
              <p className="text-yellow-900 text-lg">
                <strong>Analysis Not Available:</strong> Unable to generate analysis results. Please try again.
              </p>
            </div>
          )}

          {/* Analysis Results */}
          {analysisData && (
            <>
              {/* Executive Summary */}
              <div className="print-section bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-lg overflow-hidden mb-8 p-8">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3 print-section-header">
                  <TrendingUp className="w-8 h-8" />
                  Executive Summary
                </h2>
                <div className="space-y-4">
                  {analysisData.topRootCauses.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-slate-100 text-lg leading-relaxed">
                        <span className="font-bold text-white">Biggest driver of complaints:</span> {analysisData.topRootCauses[0].title}
                      </p>
                    </div>
                  )}
                  {(() => {
                    const quickWin = analysisData.backlog.find(
                      item => item.impact === 'High' && (item.effort === 'Low' || item.effort === 'Medium')
                    );
                    return quickWin ? (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="text-slate-100 text-lg leading-relaxed">
                          <span className="font-bold text-white">Fastest fix with high impact:</span> {quickWin.task}
                        </p>
                      </div>
                    ) : null;
                  })()}
                  {analysisData.staffCoaching.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-slate-100 text-lg leading-relaxed">
                        <span className="font-bold text-white">What to coach this week:</span> {analysisData.staffCoaching[0].role} - {analysisData.staffCoaching[0].focus}
                      </p>
                    </div>
                  )}
                </div>
                {extractedData?.reviewCount && (
                  <p className="text-slate-400 text-sm mt-6 pt-6 border-t border-slate-700">
                    Based on {extractedData.reviewCount} Google reviews
                  </p>
                )}
              </div>

              {/* Top Root Causes */}
              <div ref={rootCausesRef} className="print-section bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-red-50 to-orange-50 px-8 py-6 border-b-4 border-red-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-red-500 rounded-lg">
                        <Target className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-3xl font-bold text-slate-900 print-section-header">Top 5 Root Causes</h2>
                    </div>
                    <button
                      onClick={() => {
                        const content = analysisData.topRootCauses
                          .map((c, i) => `${i + 1}. ${c.title} (${c.severity})\n${c.frequency}\n${c.bullets.join('\n')}\nQuotes:\n${c.quotes.map(q => `"${q}"`).join('\n')}`)
                          .join('\n\n');
                        copySection('rootCauses', content);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 border-2 font-semibold rounded-lg transition-all ${
                        copiedSection === 'rootCauses'
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-red-500 hover:bg-red-500 text-red-700 hover:text-white'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                      {copiedSection === 'rootCauses' ? 'Copied' : 'Copy Section'}
                    </button>
                  </div>
                </div>
                <div className="p-8">
                <div className="space-y-4">
                  {analysisData.topRootCauses.map((cause, idx) => {
                    const isExpanded = expandedCauseIndex === idx;
                    const summary = cause.bullets[0] || 'Click to view details';

                    return (
                      <div
                        key={idx}
                        className="print-keep-together border-l-4 border-red-500 bg-slate-50 rounded-r-lg overflow-hidden transition-all hover:shadow-md"
                      >
                        <button
                          onClick={() => setExpandedCauseIndex(isExpanded ? -1 : idx)}
                          className="no-print w-full p-5 text-left focus:outline-none focus:ring-2 focus:ring-red-300 rounded-r-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-bold text-slate-900">
                                  {idx + 1}. {cause.title}
                                </h3>
                                <span className={`px-3 py-1 rounded-full text-sm font-bold flex-shrink-0 ${
                                  cause.severity === 'High' ? 'bg-red-500 text-white' :
                                  cause.severity === 'Medium' ? 'bg-orange-500 text-white' :
                                  'bg-green-500 text-white'
                                }`}>
                                  {cause.severity}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 mb-2 font-medium">{cause.frequency}</p>
                              <p className="text-slate-700 leading-relaxed">{summary}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm text-slate-500 font-medium hidden sm:inline">
                                {isExpanded ? 'Hide' : 'View'} details
                              </span>
                              <ChevronDown
                                className={`w-5 h-5 text-slate-500 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </div>
                        </button>

                        {/* Print-only header */}
                        <div className="print-only hidden p-5">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-slate-900">
                              {idx + 1}. {cause.title}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-sm font-bold flex-shrink-0 ${
                              cause.severity === 'High' ? 'bg-red-500 text-white' :
                              cause.severity === 'Medium' ? 'bg-orange-500 text-white' :
                              'bg-green-500 text-white'
                            }`}>
                              {cause.severity}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mb-3 font-medium">{cause.frequency}</p>
                        </div>

                        <div className={`px-5 pb-5 animate-fade-in root-cause-details ${isExpanded ? '' : 'hidden'}`}>
                          <ul className="list-disc list-inside space-y-2 mb-4 pl-2">
                            {cause.bullets.map((bullet, bidx) => (
                              <li key={bidx} className="text-slate-700 leading-relaxed">{bullet}</li>
                            ))}
                          </ul>
                          <div className="space-y-2">
                            {cause.quotes.map((quote, qidx) => (
                              <div key={qidx} className="print-blockquote bg-white rounded-lg p-4 border-l-4 border-slate-300">
                                <p className="text-sm italic text-slate-600 leading-relaxed">"{quote}"</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>

              {/* Staff Coaching */}
              <div ref={coachingRef} className="print-section bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-8 py-6 border-b-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-500 rounded-lg">
                        <Users className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-3xl font-bold text-slate-900 print-section-header">Staff Coaching Scripts</h2>
                    </div>
                    <button
                      onClick={() => {
                        const content = analysisData.staffCoaching
                          .map(c => `${c.role} - ${c.focus}\n"${c.script}"`)
                          .join('\n\n');
                        copySection('staffCoaching', content);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 border-2 font-semibold rounded-lg transition-all ${
                        copiedSection === 'staffCoaching'
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-blue-500 hover:bg-blue-500 text-blue-700 hover:text-white'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                      {copiedSection === 'staffCoaching' ? 'Copied' : 'Copy Section'}
                    </button>
                  </div>
                </div>
                <div className="p-8">
                <div className="space-y-5">
                  {analysisData.staffCoaching.map((coaching, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-lg p-5 border-l-4 border-blue-500">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="px-4 py-1.5 bg-blue-500 text-white text-sm font-bold rounded-full">
                          {coaching.role}
                        </span>
                        <span className="text-slate-900 font-bold text-lg">{coaching.focus}</span>
                      </div>
                      <p className="text-slate-700 italic leading-relaxed text-base">"{coaching.script}"</p>
                    </div>
                  ))}
                </div>
                </div>
              </div>

              {/* Process Changes */}
              <div ref={processRef} className="print-section bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-8 py-6 border-b-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-green-500 rounded-lg">
                        <Wrench className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-3xl font-bold text-slate-900 print-section-header">Process Changes</h2>
                    </div>
                    <button
                      onClick={() => {
                        const content = analysisData.processChanges
                          .map(c => `${c.change}\nWhy: ${c.why}\nHow To: ${c.howTo}\nTime: ${c.timeEstimate}`)
                          .join('\n\n');
                        copySection('processChanges', content);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 border-2 font-semibold rounded-lg transition-all ${
                        copiedSection === 'processChanges'
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-green-500 hover:bg-green-500 text-green-700 hover:text-white'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                      {copiedSection === 'processChanges' ? 'Copied' : 'Copy Section'}
                    </button>
                  </div>
                </div>
                <div className="p-8">
                <div className="space-y-5">
                  {analysisData.processChanges.map((change, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-lg p-5 border-l-4 border-green-500">
                      <h3 className="text-xl font-bold text-slate-900 mb-4">{change.change}</h3>
                      <div className="space-y-3">
                        <div>
                          <span className="font-bold text-slate-900">Why:</span>
                          <p className="text-slate-700 mt-1 leading-relaxed">{change.why}</p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">How To:</span>
                          <p className="text-slate-700 mt-1 leading-relaxed">{change.howTo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">Time Estimate:</span>
                          <span className="px-3 py-1 bg-green-500 text-white text-sm font-bold rounded-full">{change.timeEstimate}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>

              {/* 30-Day Backlog */}
              <div ref={backlogRef} className="print-section bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-8 py-6 border-b-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-purple-500 rounded-lg">
                        <ClipboardList className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-3xl font-bold text-slate-900 print-section-header">30-Day Fix Backlog</h2>
                    </div>
                    <button
                      onClick={() => {
                        const content = analysisData.backlog
                          .map(item => `${item.week}: ${item.task} (Effort: ${item.effort}, Impact: ${item.impact})\nOwner: ${item.owner}`)
                          .join('\n\n');
                        copySection('backlog', content);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 border-2 font-semibold rounded-lg transition-all ${
                        copiedSection === 'backlog'
                          ? 'border-purple-500 bg-purple-500 text-white'
                          : 'border-purple-500 hover:bg-purple-500 text-purple-700 hover:text-white'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                      {copiedSection === 'backlog' ? 'Copied' : 'Copy Section'}
                    </button>
                  </div>
                </div>
                <div className="p-8">
                <div className="space-y-6">
                  {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((week) => (
                    <div key={week}>
                      <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <span className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center text-lg font-bold">
                          {week.split(' ')[1]}
                        </span>
                        {week}
                      </h3>
                      <div className="space-y-3">
                        {analysisData.backlog
                          .filter((item) => item.week === week)
                          .map((item, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-lg p-5 border-l-4 border-purple-500">
                              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-slate-900 font-bold text-lg mb-2">{item.task}</p>
                                  <p className="text-sm text-slate-600 font-medium">Owner: {item.owner}</p>
                                </div>
                                <div className="flex gap-2">
                                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                    item.effort === 'High' ? 'bg-red-500 text-white' :
                                    item.effort === 'Medium' ? 'bg-orange-500 text-white' :
                                    'bg-green-500 text-white'
                                  }`}>
                                    {item.effort} Effort
                                  </span>
                                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                    item.impact === 'High' ? 'bg-green-500 text-white' :
                                    item.impact === 'Medium' ? 'bg-orange-500 text-white' :
                                    'bg-red-500 text-white'
                                  }`}>
                                    {item.impact} Impact
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            </>
          )}

          {/* Bottom CTA */}
          <div className="no-print bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl shadow-2xl p-10 text-center text-white">
            <h3 className="text-3xl font-bold mb-3">Ready to Improve Customer Experience?</h3>
            <p className="text-xl mb-8 text-slate-300">Start implementing these fixes and watch your ratings improve</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={handleDownloadPdf}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-10 py-4 rounded-lg transition-all shadow-lg hover:shadow-xl text-lg flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download PDF Report
              </button>
              <button
                onClick={handleStartNew}
                className="bg-white hover:bg-slate-100 text-slate-900 font-bold px-10 py-4 rounded-lg transition-all shadow-lg hover:shadow-xl text-lg flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                Analyze Another Business
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-cyan-50 to-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-6xl md:text-7xl font-extrabold text-slate-900 mb-6 leading-tight">
            Stop Earning<br />Bad Reviews
          </h1>
          <p className="text-2xl md:text-3xl text-slate-700 mb-6 font-medium">
            Turn your Google reviews into an operational fix list in 60 seconds
          </p>
          <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto">
            Get root causes, coaching scripts, and a 30-day action plan from your existing reviews
          </p>

          <div className="grid md:grid-cols-3 gap-8 text-left max-w-4xl mx-auto mb-12">
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-100">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                <Target className="w-7 h-7 text-white" />
              </div>
              <p className="text-slate-900 font-bold text-lg mb-2">Top 5 Root Causes</p>
              <p className="text-slate-600">Ranked by frequency and severity with real customer quotes</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-100">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-white" />
              </div>
              <p className="text-slate-900 font-bold text-lg mb-2">Staff Coaching Scripts</p>
              <p className="text-slate-600">Ready-to-use talking points for your team</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-100">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                <ClipboardList className="w-7 h-7 text-white" />
              </div>
              <p className="text-slate-900 font-bold text-lg mb-2">30-Day Action Plan</p>
              <p className="text-slate-600">Prioritized backlog with effort and impact ratings</p>
            </div>
          </div>
        </div>
      </section>

      {/* URL Input Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-3xl mx-auto">
          {isReanalysis && reanalysisBusinessName && (
            <div className="mb-8 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-4 rounded-xl shadow-xl">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg">Running Follow-up Analysis</p>
                  <p className="text-sm text-blue-50">Analyzing latest reviews for {reanalysisBusinessName}</p>
                </div>
              </div>
            </div>
          )}
          <div className="bg-white border-4 border-blue-600 rounded-2xl p-10 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">
                {isReanalysis ? 'Confirm Business URL' : 'Get Your Analysis Now'}
              </h2>
              <p className="text-lg text-slate-600">
                {isReanalysis
                  ? 'Verify the URL and click Analyze to run a new analysis'
                  : 'Paste your Google Maps business URL and we\'ll analyze your reviews'}
              </p>
            </div>
            <label htmlFor="url-input" className="block text-xl font-bold text-slate-900 mb-4">
              Your Business URL
            </label>
            <input
              id="url-input"
              type="text"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://maps.google.com/maps/place/your-business..."
              className={`w-full px-6 py-5 text-lg border-3 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all ${
                error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
              }`}
            />
            <p className="text-sm text-slate-500 mt-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Works with Google Maps business URLs
            </p>
            <button
              onClick={handleAnalyze}
              disabled={!isValidUrl}
              className={`w-full mt-8 px-8 py-6 text-xl font-bold rounded-xl transition-all transform ${
                isValidUrl
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-xl hover:shadow-2xl hover:scale-105'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isValidUrl
                ? (isReanalysis ? 'Analyze My Reviews - $10' : 'Analyze My Reviews - $0.50')
                : 'Enter a valid URL to continue'
              }
            </button>

            <div className="mt-6 flex items-center gap-4">
              <div className="flex-1 border-t border-slate-300"></div>
              <span className="text-slate-500 text-sm font-medium">OR</span>
              <div className="flex-1 border-t border-slate-300"></div>
            </div>

            <button
              onClick={handleTryDemo}
              className="w-full mt-6 px-8 py-5 text-lg font-bold rounded-xl transition-all transform bg-white border-3 border-blue-600 text-blue-600 hover:bg-blue-50 shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-3"
            >
              <Eye className="w-6 h-6" />
              <div className="flex flex-col items-start">
                <span>Try Demo</span>
                <span className="text-sm font-normal text-blue-500">Demo data (Ogden Pizzeria)</span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 text-center mb-20">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto shadow-xl">
                  <LinkIcon className="w-12 h-12" />
                </div>
                <div className="absolute -top-2 -right-2 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold">
                  1
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Paste Your URL
              </h3>
              <p className="text-slate-600 text-lg leading-relaxed">
                Use the 'Share' button in Google Maps to get a clean URL for your business
              </p>
            </div>
            <div className="text-center">
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto shadow-xl">
                  <Search className="w-12 h-12" />
                </div>
                <div className="absolute -top-2 -right-2 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold">
                  2
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                AI Analyzes Reviews
              </h3>
              <p className="text-slate-600 text-lg leading-relaxed">
                Our AI extracts patterns and identifies root causes from customer feedback
              </p>
            </div>
            <div className="text-center">
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto shadow-xl">
                  <FileCheck className="w-12 h-12" />
                </div>
                <div className="absolute -top-2 -right-2 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold">
                  3
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Get Action Plan
              </h3>
              <p className="text-slate-600 text-lg leading-relaxed">
                Receive prioritized fixes with coaching scripts and 30-day implementation plan
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What You Get */}
      <section className="py-20 px-4 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 text-center mb-20">
            What You'll Get
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-red-100 hover:shadow-2xl transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center">
                  <Target className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Top 5 Root Causes</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Ranked by frequency and severity</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Real customer quotes for each issue</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Clear impact assessment</p>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-blue-100 hover:shadow-2xl transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center">
                  <Users className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Staff Coaching Scripts</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Ready-to-use talking points</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Role-specific guidance</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Copy and paste into training docs</p>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-green-100 hover:shadow-2xl transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center">
                  <Wrench className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Process Changes</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Operational improvements</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Implementation steps</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Time estimates for each change</p>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-purple-100 hover:shadow-2xl transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-purple-500 rounded-xl flex items-center justify-center">
                  <ClipboardList className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">30-Day Backlog</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Week-by-week action plan</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Effort and impact ratings</p>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-700">Owner assignments</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 text-center mb-8">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
            Get immediate insights from your customer reviews
          </p>
          <div className="max-w-md mx-auto">
            <div className="bg-white border-3 border-blue-600 rounded-2xl p-10 text-center shadow-2xl hover:shadow-3xl transition-all">
              <h3 className="text-3xl font-bold text-slate-900 mb-4">Complete Analysis</h3>
              <div className="mb-6">
                <span className="text-6xl font-extrabold text-slate-900">$0.50</span>
              </div>
              <p className="text-slate-600 mb-8 text-lg leading-relaxed">
                Get a comprehensive analysis of your reviews with actionable insights. Everything you need to improve your customer experience.
              </p>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-slate-700">Top 5 root causes with customer quotes</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-slate-700">Staff coaching scripts</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-slate-700">Process improvement recommendations</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-slate-700">30-day action plan with priorities</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-slate-700">Downloadable PDF report</span>
                </li>
              </ul>
              <button
                onClick={() => {
                  document.getElementById('url-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  document.getElementById('url-input')?.focus();
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg hover:shadow-xl"
              >
                Get Started Now
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-br from-slate-900 to-slate-800 text-slate-300 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="text-white text-2xl font-bold mb-4">ServiceSift</h3>
              <p className="text-slate-400 leading-relaxed">
                Turn customer feedback into actionable improvements for your business.
              </p>
            </div>
            <div>
              <h4 className="text-white text-lg font-bold mb-4">Quick Links</h4>
              <div className="space-y-2">
                <a href="#how-it-works" className="block hover:text-white transition-colors">
                  How It Works
                </a>
                <a href="#pricing" className="block hover:text-white transition-colors">
                  Pricing
                </a>
                <a href="#contact" className="block hover:text-white transition-colors">
                  Contact
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-white text-lg font-bold mb-4">Contact</h4>
              <p className="text-slate-400">
                <a href="mailto:support@service-sift.com" className="hover:text-white transition-colors">
                  support@service-sift.com
                </a>
              </p>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center text-slate-400">
            <p>© 2025 ServiceSift. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={async () => {
          // Cleanup: Delete abandoned draft analysis if it exists
          if (pendingAnalysisId) {
            try {
              console.log('[PaymentModal] Cleaning up abandoned analysis:', pendingAnalysisId);
              await deleteAnalysis(pendingAnalysisId);
            } catch (err) {
              console.error('[PaymentModal] Failed to cleanup abandoned analysis (non-critical):', err);
            }
          }
          setShowPaymentModal(false);
          setPendingAnalysisId(null);
          setPendingBusinessId(null);
          setPendingBusinessName('');
          setPendingIsBaseline(true);
          setPendingUrl('');
        }}
        amount={isReanalysis ? REANALYSIS_PRICE : FIRST_ANALYSIS_PRICE}
        businessName={customBusinessName || extractedData?.businessName || pendingBusinessName || 'Your Business'}
        isReanalysis={isReanalysis}
        url={pendingUrl || url}
        businessId={reanalysisBusinessId || pendingBusinessId || undefined}
        analysisId={pendingAnalysisId}
        draftData={pendingBusinessId ? {
          businessId: pendingBusinessId,
          businessName: pendingBusinessName || customBusinessName || extractedData?.businessName || 'Your Business',
          url: pendingUrl || url,
          isBaseline: pendingIsBaseline,
          reviewCount: extractedData?.reviewCount || 0,
          averageRating: extractedData?.totalScore || 0,
        } : undefined}
        onAnalysisCreated={(analysisId) => {
          setPendingAnalysisId(analysisId);
        }}
      />
    </div>
  );
}

