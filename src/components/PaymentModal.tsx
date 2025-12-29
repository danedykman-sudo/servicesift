import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CreditCard, Play } from 'lucide-react';
import { createCheckoutSession } from '../lib/stripe';
import { createAnalysis } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';

interface DraftData {
  businessId: string;
  businessName: string;
  url: string;
  isBaseline: boolean;
  reviewCount: number;
  averageRating: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  businessName: string;
  isReanalysis: boolean;
  url: string;
  businessId?: string;
  analysisId: string | null; // May be null - will be created on Pay Now if draftData provided
  draftData?: DraftData; // Draft data for deferred analysis creation
  onAnalysisCreated?: (analysisId: string) => void; // Callback when analysis is created
}

export function PaymentModal({
  isOpen,
  onClose,
  amount,
  businessName,
  isReanalysis,
  url,
  businessId,
  analysisId,
  draftData,
  onAnalysisCreated,
}: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Check if free mode is enabled
  const paymentsDisabled = import.meta.env.VITE_PAYMENTS_DISABLED === 'true';

  if (!isOpen) return null;

  console.log('[PaymentModal] Rendering with props:', {
    amount,
    businessName,
    isReanalysis,
    url,
    businessId,
    analysisId,
    hasDraftData: !!draftData,
  });

  const handleFreeRun = async () => {
    if (!user) {
      setError('Please log in to run analysis');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await import('../lib/supabase').then(m => m.supabase.auth.getSession());
      if (!session) {
        throw new Error('Not authenticated');
      }

      console.log('[PaymentModal] Starting free analysis for:', url);

      const response = await fetch('/api/free-run-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          businessUrl: url,
          coverageLevel: 200,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start free analysis');
      }

      console.log('[PaymentModal] Free analysis started:', result);

      // Navigate to report status page
      if (result.reportId) {
        navigate(`/report-status/${result.reportId}`);
      } else if (result.analysisId) {
        // Fallback: navigate with analysisId if reportId not available
        navigate(`/report-status/${result.analysisId}`);
      } else {
        throw new Error('No reportId or analysisId returned');
      }
    } catch (err) {
      console.error('[PaymentModal] Free run error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start analysis';
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      let finalAnalysisId = analysisId;

      // Create analysis if it doesn't exist yet (deferred creation)
      if (!finalAnalysisId && draftData) {
        console.log('[PaymentModal] Creating analysis record before payment:', draftData);
        finalAnalysisId = await createAnalysis(
          draftData.businessId,
          draftData.url,
          draftData.businessName,
          draftData.reviewCount,
          draftData.averageRating,
          draftData.isBaseline,
          null, // paymentId - will be set by webhook
          undefined, // amountPaid - will be set by webhook
          'pending' // payment_status - starts as pending
        );
        console.log('[PaymentModal] Analysis created with ID:', finalAnalysisId);
        
        // Notify parent component
        if (onAnalysisCreated) {
          onAnalysisCreated(finalAnalysisId);
        }
      }

      if (!finalAnalysisId) {
        setError('Analysis record not found. Please try again.');
        setLoading(false);
        return;
      }

      console.log('[PaymentModal] Starting payment process with analysisId:', finalAnalysisId);

      const { url: checkoutUrl } = await createCheckoutSession(
        amount,
        businessName,
        isReanalysis,
        url,
        businessId,
        finalAnalysisId
      );
      console.log('[PaymentModal] Checkout URL received:', checkoutUrl);
      console.log('[PaymentModal] Redirecting to Stripe...');
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('[PaymentModal] Payment error:', err);
      let errorMessage = err instanceof Error ? err.message : 'Payment failed';

      if (errorMessage.includes('session has expired') ||
          errorMessage.includes('Authentication failed') ||
          errorMessage.includes('Not authenticated')) {
        errorMessage = 'Your login session has expired. Please refresh the page and try again.';
      }

      console.error('[PaymentModal] Error message:', errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            {paymentsDisabled 
              ? (isReanalysis ? 'Re-Analysis' : 'Analysis')
              : (isReanalysis ? 'Re-Analysis Payment' : 'Analysis Payment')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {!paymentsDisabled && (
            <div className="mb-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">
                  {isReanalysis ? 'Re-Analysis Fee' : 'First Analysis Fee'}
                </p>
                <p className="text-3xl font-bold text-gray-900 mb-2">
                  ${(amount / 100).toFixed(2)}
                </p>
                <p className="text-sm text-gray-600">
                  Analyzes your Google reviews and generates your Implementation Kit.
                </p>
              </div>
            </div>
          )}

          {paymentsDisabled && (
            <div className="mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 mb-2 font-semibold">
                  Free Analysis Mode
                </p>
                <p className="text-sm text-green-700">
                  Analyzes your Google reviews and generates your Implementation Kit at no cost.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
              <p className="text-sm font-bold text-red-800 mb-2">
                {paymentsDisabled ? 'Error' : 'Payment Error'}
              </p>
              <p className="text-sm text-red-700 mb-2">{error}</p>
              <p className="text-xs text-red-600">Check the browser console for detailed error information.</p>
            </div>
          )}

          <div className="mb-6">
            <p className="text-sm text-gray-600">
              {isReanalysis
                ? 'This will run a new analysis with updated reviews and compare it to your baseline.'
                : 'This will analyze all reviews and create your baseline report.'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {paymentsDisabled ? (
              <button
                onClick={handleFreeRun}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Starting...'
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Run Analysis (Free)
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handlePayment}
                disabled={loading || (!analysisId && !draftData)}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Processing...'
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Pay Now
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
