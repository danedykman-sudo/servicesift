import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, FileJson, Eye, ArrowLeft, Copy, FileDown } from 'lucide-react';
import { FEATURES } from '../config/features';
import { useAuth } from '../contexts/AuthContext';

interface ReportStatusResponse {
  status: string;
  derivedStatus?: string; // Derived from analysis status when report.status is PAID/QUEUED
  error_stage?: string;
  error_message?: string;
  analysis_id?: string;
  latest_artifact_version?: number;
}

const STATUS_STEPS = [
  { key: 'PAID', label: 'Payment Confirmed', icon: CheckCircle },
  { key: 'SCRAPING', label: 'Scraping', icon: Loader2 },
  { key: 'ANALYZING', label: 'Analyzing', icon: Loader2 },
  { key: 'STORING', label: 'Storing', icon: Loader2 },
  { key: 'READY', label: 'Ready', icon: CheckCircle },
  { key: 'FAILED', label: 'Failed', icon: AlertCircle },
];

export function ReportStatus() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reportStatus, setReportStatus] = useState<ReportStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingJson, setLoadingJson] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!reportId) {
      setError('No report ID provided');
      setLoading(false);
      return;
    }

    // Start polling immediately
    pollReportStatus();

    // Set up polling interval (every 2.5 seconds)
    const intervalId = setInterval(() => {
      pollReportStatus();
    }, 2500);

    return () => clearInterval(intervalId);
  }, [reportId, user, navigate]);

  const pollReportStatus = async () => {
    if (!reportId) return;

    try {
      const response = await fetch(`/api/report-status?reportId=${reportId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Report not found');
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch report status: ${response.statusText}`);
      }

      const data: ReportStatusResponse = await response.json();
      setReportStatus(data);
      setLoading(false);

      // Stop polling if status is READY or FAILED
      // Use derivedStatus if present, else map CREATED/QUEUED to check actual status
      const effectiveStatus = data.derivedStatus || 
        (data.status === 'CREATED' || data.status === 'QUEUED' ? 'PAID' : data.status);
      if (effectiveStatus === 'READY' || effectiveStatus === 'FAILED') {
        // The interval will be cleared by useEffect cleanup
      }
    } catch (err) {
      console.error('[ReportStatus] Error polling status:', err);
      if (loading) {
        setError(err instanceof Error ? err.message : 'Failed to load report status');
        setLoading(false);
      }
    }
  };

  const getEffectiveStatus = () => {
    if (!reportStatus) return '';
    // Use derivedStatus if present
    if (reportStatus.derivedStatus) {
      return reportStatus.derivedStatus;
    }
    // Map CREATED/QUEUED to PAID for display (they're equivalent from user perspective)
    if (reportStatus.status === 'CREATED' || reportStatus.status === 'QUEUED') {
      return 'PAID';
    }
    return reportStatus.status;
  };

  const getCurrentStepIndex = () => {
    if (!reportStatus) return -1;
    const effectiveStatus = getEffectiveStatus();
    return STATUS_STEPS.findIndex(step => step.key === effectiveStatus);
  };

  const getStatusColor = (status: string) => {
    if (status === 'READY') return 'text-green-600';
    if (status === 'FAILED') return 'text-red-600';
    if (status === 'PAID') return 'text-blue-600';
    return 'text-yellow-600';
  };

  const getStatusBgColor = (status: string) => {
    if (status === 'READY') return 'bg-green-100';
    if (status === 'FAILED') return 'bg-red-100';
    if (status === 'PAID') return 'bg-blue-100';
    return 'bg-yellow-100';
  };

  if (loading && !reportStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading report status...</p>
        </div>
      </div>
    );
  }

  if (error && !reportStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const effectiveStatus = getEffectiveStatus();
  const currentStepIndex = getCurrentStepIndex();
  const isReady = effectiveStatus === 'READY';
  const isFailed = effectiveStatus === 'FAILED';
  const isProcessing = !isReady && !isFailed;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-slate-700 hover:text-slate-900 font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-8">Report Status</h1>

          {/* Status Stepper */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {STATUS_STEPS.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = currentStepIndex > index;
                const Icon = step.icon;
                const isSpinning = isActive && isProcessing && step.key !== 'PAID';

                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all ${
                        isCompleted
                          ? 'bg-green-500 border-green-500 text-white'
                          : isActive
                          ? `${getStatusBgColor(step.key)} border-blue-500 text-blue-600`
                          : 'bg-slate-100 border-slate-300 text-slate-400'
                      }`}
                    >
                      {isSpinning ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Icon className="w-6 h-6" />
                      )}
                    </div>
                    <p
                      className={`mt-2 text-xs font-semibold text-center ${
                        isActive ? getStatusColor(step.key) : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Status */}
          <div className={`rounded-lg p-6 mb-6 ${getStatusBgColor(effectiveStatus)}`}>
            <div className="flex items-center gap-3">
              {isProcessing && <Loader2 className="w-6 h-6 animate-spin text-yellow-600" />}
              {isReady && <CheckCircle className="w-6 h-6 text-green-600" />}
              {isFailed && <AlertCircle className="w-6 h-6 text-red-600" />}
              <div>
                <p className="font-bold text-lg">
                  Status: <span className={getStatusColor(effectiveStatus)}>{effectiveStatus}</span>
                </p>
                {isProcessing && (
                  <p className="text-sm text-slate-600 mt-1">Processing your report... This may take a few minutes.</p>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {isFailed && reportStatus?.error_message && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
              <p className="font-bold text-red-800 mb-2">Error Details</p>
              <p className="text-sm text-red-700">{reportStatus.error_message}</p>
              {reportStatus.error_stage && (
                <p className="text-xs text-red-600 mt-2">Stage: {reportStatus.error_stage}</p>
              )}
            </div>
          )}

          {/* JSON Loading Error */}
          {error && !isFailed && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mb-6">
              <p className="font-bold text-yellow-800 mb-2">Notice</p>
              <p className="text-sm text-yellow-700">{error}</p>
              <button
                onClick={() => setError('')}
                className="mt-2 text-xs text-yellow-600 hover:text-yellow-800 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Copy Success Toast */}
          {copied && (
            <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-sm font-semibold text-green-800">Copied!</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {(effectiveStatus === 'PAID' || isReady) && (
            <div className="flex flex-col gap-4">
              {/* Copy Link Button - Always visible when PAID or READY */}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch (err) {
                    console.error('[ReportStatus] Failed to copy link:', err);
                    setError('Failed to copy link. Please try again.');
                  }
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-purple-600 text-purple-600 hover:bg-purple-50 font-bold rounded-lg transition-all shadow-lg"
              >
                <Copy className="w-5 h-5" />
                {copied ? 'Copied!' : 'Copy link'}
              </button>

              {/* View Report, Download PDF, and JSON buttons - Only when READY */}
              {isReady && reportStatus?.analysis_id && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link
                        to={`/report/${reportStatus.analysis_id}`}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
                      >
                        <Eye className="w-5 h-5" />
                        View Report
                      </Link>
                      {FEATURES.ENABLE_PDF_GENERATION && (
                        <button
                          onClick={async () => {
                            if (!reportId || loadingPdf) return;
                            
                            setLoadingPdf(true);
                            try {
                              const response = await fetch(`/api/mint-report-artifact-url?reportId=${reportId}&kind=pdf`);
                              
                              if (!response.ok) {
                                if (response.status === 404) {
                                  setError('PDF artifact not found. The report may still be generating. Please try again in a moment.');
                                } else {
                                  const errorData = await response.json().catch(() => ({ error: 'Failed to load PDF' }));
                                  setError(errorData.error || 'Failed to load PDF artifact');
                                }
                                return;
                              }

                              const data = await response.json();
                              if (data.url) {
                                // Download PDF
                                const link = document.createElement('a');
                                link.href = data.url;
                                link.download = `report-${reportId}.pdf`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              } else {
                                setError('Invalid response from server');
                              }
                            } catch (err) {
                              console.error('[ReportStatus] Error loading PDF:', err);
                              setError('Failed to load PDF. Please try again.');
                            } finally {
                              setLoadingPdf(false);
                            }
                          }}
                          disabled={loadingPdf}
                          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingPdf ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <FileDown className="w-5 h-5" />
                              Download PDF
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (!reportId || loadingJson) return;
                        
                        setLoadingJson(true);
                        try {
                          const response = await fetch(`/api/mint-report-artifact-url?reportId=${reportId}&kind=json`);
                          
                          if (!response.ok) {
                            if (response.status === 404) {
                              setError('JSON artifact not found. The report may still be processing.');
                            } else {
                              const errorData = await response.json().catch(() => ({ error: 'Failed to load JSON' }));
                              setError(errorData.error || 'Failed to load JSON artifact');
                            }
                            return;
                          }

                          const data = await response.json();
                          if (data.url) {
                            // Open JSON URL in new tab
                            window.open(data.url, '_blank');
                          } else {
                            setError('Invalid response from server');
                          }
                        } catch (err) {
                          console.error('[ReportStatus] Error loading JSON:', err);
                          setError('Failed to load JSON. Please try again.');
                        } finally {
                          setLoadingJson(false);
                        }
                      }}
                      disabled={loadingJson}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-bold rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingJson ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <FileJson className="w-5 h-5" />
                          Developer: Open JSON
                        </>
                      )}
                    </button>
                  </div>
              )}
            </div>
          )}

          {isFailed && (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

