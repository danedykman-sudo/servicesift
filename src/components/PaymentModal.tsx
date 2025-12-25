import { useState } from 'react';
import { X, CreditCard } from 'lucide-react';
import { createCheckoutSession } from '../lib/stripe';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  businessName: string;
  isReanalysis: boolean;
  url: string;
  businessId?: string;
}

export function PaymentModal({
  isOpen,
  onClose,
  amount,
  businessName,
  isReanalysis,
  url,
  businessId,
}: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  console.log('[PaymentModal] Rendering with props:', {
    amount,
    businessName,
    isReanalysis,
    url,
    businessId,
  });

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    console.log('[PaymentModal] Starting payment process');

    try {
      const { url: checkoutUrl } = await createCheckoutSession(
        amount,
        businessName,
        isReanalysis,
        url,
        businessId
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
            {isReanalysis ? 'Re-Analysis Payment' : 'Analysis Payment'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Business Name</p>
              <p className="text-lg font-semibold text-gray-900">{businessName}</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-2">
                {isReanalysis ? 'Re-Analysis Fee' : 'First Analysis Fee'}
              </p>
              <p className="text-3xl font-bold text-gray-900">
                ${(amount / 100).toFixed(2)}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
              <p className="text-sm font-bold text-red-800 mb-2">Payment Error</p>
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
            <button
              onClick={handlePayment}
              disabled={loading}
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
          </div>
        </div>
      </div>
    </div>
  );
}
