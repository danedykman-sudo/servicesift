import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Download,
  Eye,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  Star,
  ArrowDown,
  ArrowUp,
  Clock,
  Activity,
  Zap,
  Target as TargetIcon
} from 'lucide-react';
import { getFullAnalysisReport, type FullAnalysisReport, getBaselineAnalysis } from '../lib/database';
import {
  getDeltaAnalysis,
  type DeltaAnalysis,
  getPulseComparison,
  getNewSinceLastRunComparison,
  getBaselineDriftComparison,
  type PulseComparison,
  type NewSinceLastRunComparison,
  type BaselineDriftComparison
} from '../lib/deltaAnalysis';
import { Header } from '../components/Header';
import { FEATURES } from '../config/features';

type TabType = 'pulse' | 'newSince' | 'baseline';

export function DeltaReport() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();

  if (!FEATURES.ENABLE_DELTA_ANALYSIS) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-20">
          <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-10 text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Delta Analysis Disabled</h1>
            <p className="text-slate-600">
              The 3-lens comparison dashboard is temporarily hidden while we focus on core MVP flows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deltaData, setDeltaData] = useState<DeltaAnalysis | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<FullAnalysisReport | null>(null);
  const [baselineAnalysis, setBaselineAnalysis] = useState<FullAnalysisReport | null>(null);
  const [showFullReport, setShowFullReport] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pulse');
  const [pulseData, setPulseData] = useState<PulseComparison | null>(null);
  const [newSinceData, setNewSinceData] = useState<NewSinceLastRunComparison | null>(null);
  const [baselineDriftData, setBaselineDriftData] = useState<BaselineDriftComparison | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);

  useEffect(() => {
    if (analysisId) {
      loadDeltaReport();
    }
  }, [analysisId]);

  const loadDeltaReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const current = await getFullAnalysisReport(analysisId!);
      setCurrentAnalysis(current);

      const delta = await getDeltaAnalysis(analysisId!);
      setDeltaData(delta);

      const baselineId = await getBaselineIdFromDelta(analysisId!);
      const baseline = baselineId ? await getFullAnalysisReport(baselineId) : null;
      setBaselineAnalysis(baseline);

      const pulse = await getPulseComparison(analysisId!);
      setPulseData(pulse);

      const baselineDrift = await getBaselineDriftComparison(analysisId!);
      setBaselineDriftData(baselineDrift);

      if (baseline) {
        const previousDate = new Date(baseline.analysis.created_at);
        const newSince = await getNewSinceLastRunComparison(analysisId!, previousDate);
        setNewSinceData(newSince);
      }
    } catch (err: any) {
      console.error('Failed to load delta report:', err);
      setError('Failed to load comparison report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getBaselineIdFromDelta = async (analysisId: string): Promise<string | null> => {
    const { supabase } = await import('../lib/supabase');
    const { data } = await supabase
      .from('analysis_deltas')
      .select('baseline_id')
      .eq('analysis_id', analysisId)
      .maybeSingle();

    return data?.baseline_id || null;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case 'improving':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-bold">
            <TrendingUp className="w-5 h-5" />
            Improving
          </div>
        );
      case 'declining':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-bold">
            <TrendingDown className="w-5 h-5" />
            Declining
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg font-bold">
            <AlertTriangle className="w-5 h-5" />
            Mixed Results
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading comparison report...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !deltaData || !currentAnalysis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-red-600 text-lg mb-4">{error || 'Failed to load report'}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pb-12">
      <Header />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>

          <div className="flex gap-3">
            {baselineAnalysis && (
              <Link
                to={`/report/${baselineAnalysis.analysis.id}`}
                className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-lg hover:border-slate-400 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Baseline
              </Link>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-8 mb-8 shadow-xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">3-Lens Analysis Dashboard</h1>
              <p className="text-slate-300 text-lg">{currentAnalysis.analysis.business_name}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/10 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-blue-300" />
                <span className="text-sm text-slate-300">Latest Analysis</span>
              </div>
              <p className="text-xl font-bold">{formatDate(currentAnalysis.analysis.created_at)}</p>
            </div>

            <div className="bg-white/10 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-300" />
                <span className="text-sm text-slate-300">Total Reviews</span>
              </div>
              <p className="text-xl font-bold">{currentAnalysis.analysis.review_count} reviews</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-2 mb-8">
          <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('pulse')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'pulse'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Activity className="w-5 h-5" />
              Monthly Pulse
            </button>
            <button
              onClick={() => setActiveTab('newSince')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'newSince'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Zap className="w-5 h-5" />
              New Since Last Check
            </button>
            <button
              onClick={() => setActiveTab('baseline')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'baseline'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <TargetIcon className="w-5 h-5" />
              vs Baseline
            </button>
          </div>
        </div>

        {activeTab === 'pulse' && pulseData && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Last 30 Days vs Previous 30 Days</h2>
              <p className="text-slate-600">Compare recent performance against the previous period</p>
            </div>

            <div className="flex items-center gap-4 mb-8 flex-wrap">
              <div className={`px-4 py-2 rounded-lg font-semibold ${
                pulseData.confidence.color === 'green' ? 'bg-green-100 text-green-700' :
                pulseData.confidence.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                pulseData.confidence.color === 'red' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {pulseData.confidence.icon} {pulseData.confidence.label}
              </div>
              <div className="bg-blue-50 px-4 py-2 rounded-lg">
                <span className="font-semibold text-blue-900">{pulseData.reviewCount30} reviews analyzed (Last 30 days)</span>
              </div>
              <div className="bg-slate-50 px-4 py-2 rounded-lg">
                <span className="font-semibold text-slate-700">{pulseData.reviewCountPrev30} reviews (Previous 30 days)</span>
              </div>
            </div>

            {pulseData.improved.length > 0 && (
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-green-700 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6" />
                  What Improved
                </h3>
                <div className="space-y-4">
                  {pulseData.improved.map((item, idx) => (
                    <div key={idx} className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-lg font-bold text-slate-900">{item.theme}</h4>
                        <div className="flex items-center gap-2 text-green-700 font-bold">
                          <span>{item.baselineFrequency}%</span>
                          <ArrowDown className="w-4 h-4" />
                          <span>{item.newFrequency}%</span>
                          <span className="ml-2 text-sm bg-green-600 text-white px-2 py-1 rounded">
                            {Math.abs(item.percentChange)}% decrease
                          </span>
                        </div>
                      </div>
                      {item.exampleQuotes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {item.exampleQuotes.map((quote, qIdx) => (
                            <div key={qIdx} className="bg-white rounded p-2 border-l-4 border-green-600">
                              <p className="text-sm italic text-slate-700">"{quote}"</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pulseData.worsened.length > 0 && (
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-red-700 mb-4 flex items-center gap-2">
                  <TrendingDown className="w-6 h-6" />
                  What Worsened
                </h3>
                <div className="space-y-4">
                  {pulseData.worsened.map((item, idx) => (
                    <div key={idx} className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-lg font-bold text-slate-900">{item.theme}</h4>
                        <div className="flex items-center gap-2 text-red-700 font-bold">
                          <span>{item.baselineFrequency}%</span>
                          <ArrowUp className="w-4 h-4" />
                          <span>{item.newFrequency}%</span>
                          <span className="ml-2 text-sm bg-red-600 text-white px-2 py-1 rounded">
                            {item.percentChange}% increase
                          </span>
                        </div>
                      </div>
                      {item.exampleQuotes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {item.exampleQuotes.map((quote, qIdx) => (
                            <div key={qIdx} className="bg-white rounded p-2 border-l-4 border-red-600">
                              <p className="text-sm italic text-slate-700">"{quote}"</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pulseData.newIssues.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-yellow-700 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6" />
                  New Issues
                </h3>
                <div className="space-y-4">
                  {pulseData.newIssues.map((item, idx) => (
                    <div key={idx} className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-lg font-bold text-slate-900">{item.theme}</h4>
                        <span className="text-yellow-700 font-bold text-lg">{item.newFrequency}%</span>
                      </div>
                      {item.exampleQuotes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {item.exampleQuotes.map((quote, qIdx) => (
                            <div key={qIdx} className="bg-white rounded p-2 border-l-4 border-yellow-600">
                              <p className="text-sm italic text-slate-700">"{quote}"</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pulseData.improved.length === 0 && pulseData.worsened.length === 0 && pulseData.newIssues.length === 0 && (
              <div className="text-center py-12 text-slate-600">
                <p className="text-lg">No significant changes detected between these two periods.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'newSince' && newSinceData && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">New Reviews Since {newSinceData.lastAnalysisDate}</h2>
              <p className="text-slate-600">Emerging issues and patterns from your latest feedback</p>
            </div>

            <div className="flex items-center gap-4 mb-8 flex-wrap">
              <div className={`px-4 py-2 rounded-lg font-semibold ${
                newSinceData.confidence.color === 'green' ? 'bg-green-100 text-green-700' :
                newSinceData.confidence.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                newSinceData.confidence.color === 'red' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {newSinceData.confidence.icon} {newSinceData.confidence.label}
              </div>
              <div className="bg-green-50 px-4 py-2 rounded-lg">
                <span className="font-semibold text-green-900">{newSinceData.reviewCount} new reviews since {newSinceData.lastAnalysisDate}</span>
              </div>
            </div>

            {newSinceData.reviewCount === 0 ? (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-8 text-center">
                <AlertTriangle className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">No new reviews since {newSinceData.lastAnalysisDate}</h3>
                <p className="text-slate-600 mb-4">Check back in 30 days or consider running a review request campaign</p>
                <div className="bg-white rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-sm text-slate-700 font-semibold mb-2">Next steps:</p>
                  <ul className="text-left space-y-1 text-sm text-slate-600">
                    <li>• Send follow-up emails to recent customers</li>
                    <li>• Post QR codes at checkout for quick reviews</li>
                    <li>• Train staff to ask for feedback at point of service</li>
                  </ul>
                </div>
              </div>
            ) : newSinceData.reviewCount < 8 ? (
              <div>
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 mb-6">
                  <p className="text-yellow-900 font-semibold">Low sample size - treat these as early signals, not definitive patterns</p>
                </div>
                {newSinceData.newIssues.length > 0 && (
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-4">Emerging Mentions</h3>
                    <div className="space-y-4">
                      {newSinceData.newIssues.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
                          <h4 className="text-lg font-bold text-slate-900 mb-2">{item.theme}</h4>
                          <p className="text-slate-600 mb-3">
                            In the last {newSinceData.reviewCount} reviews, this was mentioned {item.newFrequency}% of the time
                          </p>
                          {item.exampleQuotes.length > 0 && (
                            <div className="space-y-2">
                              {item.exampleQuotes.map((quote, qIdx) => (
                                <div key={qIdx} className="bg-white rounded p-2 border-l-4 border-blue-600">
                                  <p className="text-sm italic text-slate-700">"{quote}"</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {newSinceData.emergingThemes.length > 0 && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
                    <h3 className="text-xl font-bold text-red-900 mb-3">🚨 Emerging Themes</h3>
                    <div className="space-y-2">
                      {newSinceData.emergingThemes.map((theme, idx) => (
                        <div key={idx} className="bg-white rounded p-3 font-semibold text-slate-900">
                          {theme}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newSinceData.newIssues.length > 0 && (
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-4">New Patterns</h3>
                    <div className="space-y-4">
                      {newSinceData.newIssues.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-lg font-bold text-slate-900">{item.theme}</h4>
                            <span className="text-blue-700 font-bold text-lg">{item.newFrequency}%</span>
                          </div>
                          {item.exampleQuotes.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {item.exampleQuotes.map((quote, qIdx) => (
                                <div key={qIdx} className="bg-white rounded p-2 border-l-4 border-blue-600">
                                  <p className="text-sm italic text-slate-700">"{quote}"</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'baseline' && baselineDriftData && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Last 30 Days vs 6-Month Average</h2>
              <p className="text-slate-600">How recent performance compares to your long-term baseline</p>
            </div>

            <div className="flex items-center gap-4 mb-8 flex-wrap">
              <div className={`px-4 py-2 rounded-lg font-semibold ${
                baselineDriftData.confidence.color === 'green' ? 'bg-green-100 text-green-700' :
                baselineDriftData.confidence.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                baselineDriftData.confidence.color === 'red' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {baselineDriftData.confidence.icon} {baselineDriftData.confidence.label}
              </div>
              <div className="bg-purple-50 px-4 py-2 rounded-lg">
                <span className="font-semibold text-purple-900">Recent: {baselineDriftData.reviewCount30} reviews</span>
              </div>
              <div className="bg-slate-50 px-4 py-2 rounded-lg">
                <span className="font-semibold text-slate-700">Baseline: {baselineDriftData.reviewCount180} reviews</span>
              </div>
            </div>

            <div className={`border-2 rounded-lg p-6 mb-8 ${
              baselineDriftData.betterOrWorse === 'better' ? 'bg-green-50 border-green-200' :
              baselineDriftData.betterOrWorse === 'worse' ? 'bg-red-50 border-red-200' :
              'bg-slate-50 border-slate-200'
            }`}>
              <h3 className="text-2xl font-bold mb-3">
                {baselineDriftData.betterOrWorse === 'better' && '✅ Better than baseline'}
                {baselineDriftData.betterOrWorse === 'worse' && '⚠️ Worse than baseline'}
                {baselineDriftData.betterOrWorse === 'stable' && '➡️ Stable performance'}
              </h3>
              <p className="text-slate-700">
                {baselineDriftData.betterOrWorse === 'better' && 'Your recent performance shows improvement compared to your 6-month average'}
                {baselineDriftData.betterOrWorse === 'worse' && 'Your recent performance has declined compared to your 6-month average'}
                {baselineDriftData.betterOrWorse === 'stable' && 'Your recent performance is consistent with your 6-month average'}
              </p>
            </div>

            {baselineDriftData.baselineIssues.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Your 6-Month Baseline Issues</h3>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex flex-wrap gap-2">
                    {baselineDriftData.baselineIssues.map((issue, idx) => (
                      <span key={idx} className="px-3 py-1 bg-white border border-slate-300 rounded-full text-sm font-semibold text-slate-700">
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {baselineDriftData.vsBaseline.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Changes vs Baseline</h3>
                <div className="space-y-4">
                  {baselineDriftData.vsBaseline.map((item, idx) => (
                    <div key={idx} className={`border-2 rounded-lg p-4 ${
                      item.percentChange < 0 ? 'bg-green-50 border-green-200' :
                      item.percentChange > 0 ? 'bg-red-50 border-red-200' :
                      'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-lg font-bold text-slate-900">{item.theme}</h4>
                        <div className={`flex items-center gap-2 font-bold ${
                          item.percentChange < 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                          <span>{item.baselineFrequency}%</span>
                          {item.percentChange < 0 ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                          <span>{item.newFrequency}%</span>
                        </div>
                      </div>
                      {item.exampleQuotes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {item.exampleQuotes.map((quote, qIdx) => (
                            <div key={qIdx} className="bg-white rounded p-2 border-l-4 border-purple-600">
                              <p className="text-sm italic text-slate-700">"{quote}"</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!pulseData && !newSinceData && !baselineDriftData && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">First Analysis</h3>
            <p className="text-slate-600">Run your next analysis in 30 days to see trends and comparisons</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border-2 border-slate-200 mt-8">
          <button
            onClick={() => setShowFullReport(!showFullReport)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors rounded-t-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <Eye className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">View Complete Current Analysis</h2>
            </div>
            {showFullReport ? (
              <ChevronUp className="w-6 h-6 text-slate-600" />
            ) : (
              <ChevronDown className="w-6 h-6 text-slate-600" />
            )}
          </button>

          {showFullReport && (
            <div className="p-6 border-t-2 border-slate-200 space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Top Root Causes</h3>
                <div className="space-y-4">
                  {currentAnalysis.rootCauses.map((cause, index) => (
                    <div key={index} className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl font-bold text-slate-400">#{cause.rank}</span>
                            <h4 className="text-xl font-bold text-slate-900">{cause.title}</h4>
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              cause.severity === 'High' ? 'bg-red-100 text-red-700' :
                              cause.severity === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {cause.severity}
                            </span>
                            <span className="text-slate-600 font-semibold">{cause.frequency}% of reviews</span>
                          </div>
                        </div>
                      </div>
                      <ul className="space-y-2 mb-4">
                        {cause.bullets.map((bullet, bIndex) => (
                          <li key={bIndex} className="flex items-start gap-2 text-slate-700">
                            <span className="text-blue-600 mt-1">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                      {cause.quotes.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-slate-600">Customer quotes:</p>
                          {cause.quotes.slice(0, 2).map((quote, qIndex) => (
                            <div key={qIndex} className="bg-white rounded-lg p-3 border-l-4 border-blue-600">
                              <p className="text-slate-700 italic">"{quote}"</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Staff Coaching Scripts</h3>
                <div className="space-y-4">
                  {currentAnalysis.coachingScripts.map((script, index) => (
                    <div key={index} className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
                      <h4 className="text-lg font-bold text-slate-900 mb-2">{script.role}</h4>
                      <p className="text-slate-600 mb-3 font-semibold">{script.focus}</p>
                      <div className="bg-white rounded-lg p-4 border-l-4 border-blue-600">
                        <p className="text-slate-700 whitespace-pre-wrap">{script.script}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Process Changes</h3>
                <div className="space-y-4">
                  {currentAnalysis.processChanges.map((change, index) => (
                    <div key={index} className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
                      <h4 className="text-lg font-bold text-slate-900 mb-3">{change.change}</h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-1">Why this matters:</p>
                          <p className="text-slate-700">{change.why}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-1">How to implement:</p>
                          <p className="text-slate-700">{change.how_to}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-600" />
                          <span className="text-slate-600 font-semibold">{change.time_estimate}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">30-Day Action Backlog</h3>
                <div className="space-y-4">
                  {currentAnalysis.backlogTasks.map((task, index) => (
                    <div key={index} className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-bold">
                              Week {task.week}
                            </span>
                          </div>
                          <p className="text-slate-900 font-semibold text-lg">{task.task}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Effort:</span>
                          <span className={`px-2 py-1 rounded text-sm font-semibold ${
                            task.effort === 'High' ? 'bg-red-100 text-red-700' :
                            task.effort === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {task.effort}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Impact:</span>
                          <span className={`px-2 py-1 rounded text-sm font-semibold ${
                            task.impact === 'High' ? 'bg-green-100 text-green-700' :
                            task.impact === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {task.impact}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Owner:</span>
                          <span className="text-slate-900 font-semibold">{task.owner}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
