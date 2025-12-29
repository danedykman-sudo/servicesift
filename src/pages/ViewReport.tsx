import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  Target,
  Users,
  Wrench,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Calendar,
  Star,
  Clock,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { getFullAnalysisReport, FullAnalysisReport, getBusinessAnalyses, hasDeltaAnalysis, type Analysis } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';

export function ViewReport() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<FullAnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCauseIndex, setExpandedCauseIndex] = useState(0);
  const [analysisHistory, setAnalysisHistory] = useState<Analysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!analysisId) {
      setError('No analysis ID provided');
      setLoading(false);
      return;
    }

    loadReport();
  }, [analysisId, user, navigate]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await getFullAnalysisReport(analysisId!);
      setReport(data);
      loadHistory(data.analysis.business_id);
      
      // Fetch reportId from analysisId
      try {
        const response = await fetch(`/api/report-by-analysis?analysisId=${analysisId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.reportId) {
            setReportId(result.reportId);
          }
        }
      } catch (err) {
        console.warn('[ViewReport] Failed to fetch reportId:', err);
        // Non-critical - PDF download will show error if needed
      }
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (businessId: string) => {
    try {
      setHistoryLoading(true);
      const history = await getBusinessAnalyses(businessId);
      setAnalysisHistory(history);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-5 h-5 ${
              star <= Math.round(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-slate-300'
            }`}
          />
        ))}
        <span className="ml-2 text-lg font-bold text-slate-900">{rating.toFixed(1)}</span>
      </div>
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort.toLowerCase()) {
      case 'high':
        return 'text-red-700';
      case 'medium':
        return 'text-yellow-700';
      case 'low':
        return 'text-green-700';
      default:
        return 'text-slate-700';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high':
        return 'text-emerald-700 font-bold';
      case 'medium':
        return 'text-blue-700';
      case 'low':
        return 'text-slate-600';
      default:
        return 'text-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Report</h2>
          <p className="text-slate-600 mb-6">{error || 'Report not found'}</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-slate-700 hover:text-slate-900 font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
          <button
            onClick={async () => {
              if (!reportId || loadingPdf) return;
              
              setLoadingPdf(true);
              try {
                const response = await fetch(`/api/mint-report-artifact-url?reportId=${reportId}&kind=pdf`);
                
                if (!response.ok) {
                  if (response.status === 404) {
                    setError('PDF artifact not found. The PDF may still be generating. Please try again in a moment.');
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
                console.error('[ViewReport] Error loading PDF:', err);
                setError('Failed to load PDF. Please try again.');
              } finally {
                setLoadingPdf(false);
              }
            }}
            disabled={!reportId || loadingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold rounded-lg transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingPdf ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Download PDF
              </>
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-4xl font-extrabold text-slate-900 mb-2">
                {report.analysis.business_name}
              </h1>
              <div className="flex items-center gap-4 text-slate-600">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(report.analysis.created_at)}</span>
                </div>
                <span>•</span>
                <span>{report.analysis.review_count} reviews analyzed</span>
              </div>
            </div>
            <div>{renderStars(report.analysis.average_rating)}</div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <Target className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900">Top Root Causes</h2>
            </div>

            <div className="space-y-4">
              {report.rootCauses.map((cause, index) => (
                <div
                  key={cause.id}
                  className="border-2 border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 transition-colors"
                >
                  <div
                    className="flex items-center justify-between p-5 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
                    onClick={() =>
                      setExpandedCauseIndex(expandedCauseIndex === index ? -1 : index)
                    }
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-full font-bold text-lg">
                        {cause.rank}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-slate-900 mb-1">
                          {cause.title}
                        </h3>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${getSeverityColor(
                              cause.severity
                            )}`}
                          >
                            {cause.severity} Severity
                          </span>
                          <span className="text-sm text-slate-600">
                            Mentioned in {cause.frequency}% of reviews
                          </span>
                        </div>
                      </div>
                    </div>
                    {expandedCauseIndex === index ? (
                      <ChevronUp className="w-6 h-6 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-6 h-6 text-slate-400" />
                    )}
                  </div>

                  {expandedCauseIndex === index && (
                    <div className="p-6 bg-white border-t-2 border-slate-200">
                      <div className="mb-6">
                        <h4 className="font-bold text-slate-900 mb-3">Key Points:</h4>
                        <ul className="space-y-2">
                          {cause.bullets.map((bullet, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-blue-600 font-bold mt-1">•</span>
                              <span className="text-slate-700">{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 mb-3">Customer Quotes:</h4>
                        <div className="space-y-3">
                          {cause.quotes.map((quote, i) => (
                            <div
                              key={i}
                              className="bg-slate-50 border-l-4 border-blue-500 p-4 rounded-r-lg"
                            >
                              <p className="text-slate-700 italic">"{quote}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900">Staff Coaching Scripts</h2>
            </div>

            <div className="space-y-4">
              {report.coachingScripts.map((script) => (
                <div
                  key={script.id}
                  className="border-2 border-slate-200 rounded-xl p-6 hover:border-green-300 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-4 py-2 bg-green-100 text-green-800 font-bold rounded-lg">
                      {script.role}
                    </span>
                    <span className="text-slate-600">{script.focus}</span>
                  </div>
                  <div className="bg-slate-50 border-l-4 border-green-500 p-5 rounded-r-lg">
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {script.script}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Wrench className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900">Process Changes</h2>
            </div>

            <div className="space-y-4">
              {report.processChanges.map((change) => (
                <div
                  key={change.id}
                  className="border-2 border-slate-200 rounded-xl p-6 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-900 flex-1">{change.change}</h3>
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-lg whitespace-nowrap ml-4">
                      {change.time_estimate}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-slate-900 mb-2">Why It Matters:</h4>
                      <p className="text-slate-700">{change.why}</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 mb-2">How To Implement:</h4>
                      <div className="bg-slate-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                        {change.steps.map((step, i) => (
                          <p key={i} className="text-slate-700">
                            {step}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-purple-600" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900">30-Day Backlog</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-3 px-4 font-bold text-slate-900">Week</th>
                    <th className="text-left py-3 px-4 font-bold text-slate-900">Task</th>
                    <th className="text-left py-3 px-4 font-bold text-slate-900">Owner</th>
                    <th className="text-center py-3 px-4 font-bold text-slate-900">Effort</th>
                    <th className="text-center py-3 px-4 font-bold text-slate-900">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {report.backlogTasks.map((task) => (
                    <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-purple-100 text-purple-800 font-semibold rounded-lg">
                          Week {task.week}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-900">{task.task}</td>
                      <td className="py-4 px-4 text-slate-700">{task.owner}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`font-semibold ${getEffortColor(task.effort)}`}>
                          {task.effort}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`font-semibold ${getImpactColor(task.impact)}`}>
                          {task.impact}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {analysisHistory.length > 1 && (
            <section className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-8 mt-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900">Analysis History</h2>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {analysisHistory.map((analysis, index) => {
                    const isBaseline = analysis.is_baseline;
                    const followUpNumber = !isBaseline ? analysisHistory.filter(a =>
                      new Date(a.created_at) <= new Date(analysis.created_at) && !a.is_baseline
                    ).length : 0;
                    const isCurrent = analysis.id === analysisId;

                    return (
                      <div
                        key={analysis.id}
                        className={`border-2 rounded-xl p-6 transition-all ${
                          isCurrent
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <Calendar className="w-5 h-5 text-slate-600" />
                              <span className="text-slate-900 font-semibold text-lg">
                                {new Date(analysis.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              {isCurrent && (
                                <span className="px-3 py-1 bg-blue-600 text-white text-sm font-bold rounded-full">
                                  Current
                                </span>
                              )}
                              {isBaseline ? (
                                <span className="px-3 py-1 bg-green-600 text-white text-sm font-bold rounded-full">
                                  Baseline
                                </span>
                              ) : (
                                <span className="px-3 py-1 bg-orange-600 text-white text-sm font-bold rounded-full">
                                  Follow-up #{followUpNumber}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-6 text-slate-600 mb-3">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span className="font-semibold">{analysis.review_count} reviews</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold">{analysis.average_rating.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>

                          {!isCurrent && (
                            <AnalysisHistoryViewButton analysisId={analysis.id} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisHistoryViewButton({ analysisId }: { analysisId: string }) {
  const [checkingDelta, setCheckingDelta] = useState(false);
  const [hasDelta, setHasDelta] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkForDelta();
  }, [analysisId]);

  const checkForDelta = async () => {
    try {
      setCheckingDelta(true);
      const result = await hasDeltaAnalysis(analysisId);
      setHasDelta(result);
    } catch (err) {
      console.error('Failed to check delta:', err);
    } finally {
      setCheckingDelta(false);
    }
  };

  const handleView = () => {
    if (hasDelta) {
      navigate(`/delta/${analysisId}`);
    } else {
      navigate(`/report/${analysisId}`);
    }
  };

  return (
    <button
      onClick={handleView}
      disabled={checkingDelta}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
    >
      {hasDelta ? (
        <>
          <TrendingUp className="w-4 h-4" />
          View Comparison
        </>
      ) : (
        <>
          <Eye className="w-4 h-4" />
          View Report
        </>
      )}
    </button>
  );
}
