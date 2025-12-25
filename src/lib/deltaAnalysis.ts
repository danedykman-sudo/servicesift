import { supabase } from './supabase';
import { RootCause } from './database';
import {
  filterReviewsByDateRange,
  getLast30Days,
  getPrevious30Days,
  getRolling180Days,
  getNewSinceDate,
  getConfidenceLabel,
  type Review
} from './dateFiltering';

export interface IssueChange {
  theme: string;
  baselineFrequency: number;
  newFrequency: number;
  percentChange: number;
  exampleQuotes: string[];
}

export interface StableIssue {
  theme: string;
}

export interface DeltaAnalysis {
  overallTrend: 'improving' | 'declining' | 'mixed';
  biggestImprovement: string | null;
  biggestConcern: string | null;
  improved: IssueChange[];
  worsened: IssueChange[];
  newIssues: IssueChange[];
  stable: StableIssue[];
}

export interface PulseComparison {
  improved: IssueChange[];
  worsened: IssueChange[];
  newIssues: IssueChange[];
  reviewCount30: number;
  reviewCountPrev30: number;
  confidence: ReturnType<typeof getConfidenceLabel>;
  dateRange30: string;
  dateRangePrev30: string;
}

export interface NewSinceLastRunComparison {
  newIssues: IssueChange[];
  emergingThemes: string[];
  reviewCount: number;
  lastAnalysisDate: string;
  confidence: ReturnType<typeof getConfidenceLabel>;
}

export interface BaselineDriftComparison {
  vsBaseline: IssueChange[];
  betterOrWorse: 'better' | 'worse' | 'stable';
  reviewCount30: number;
  reviewCount180: number;
  confidence: ReturnType<typeof getConfidenceLabel>;
  baselineIssues: string[];
}

function normalizeTheme(theme: string): string {
  return theme.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeTheme(str1);
  const norm2 = normalizeTheme(str2);

  if (norm1 === norm2) return 1.0;

  const words1 = new Set(norm1.split(/\s+/));
  const words2 = new Set(norm2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function findMatchingCause(
  targetCause: RootCause,
  candidateCauses: RootCause[],
  threshold: number = 0.5
): RootCause | null {
  let bestMatch: RootCause | null = null;
  let bestScore = threshold;

  for (const candidate of candidateCauses) {
    const similarity = calculateSimilarity(targetCause.title, candidate.title);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

export async function compareAnalyses(
  baselineId: string,
  newAnalysisId: string
): Promise<DeltaAnalysis> {
  const { data: baselineCauses, error: baselineError } = await supabase
    .from('root_causes')
    .select('*')
    .eq('analysis_id', baselineId)
    .order('rank');

  if (baselineError) throw baselineError;

  const { data: newCauses, error: newError } = await supabase
    .from('root_causes')
    .select('*')
    .eq('analysis_id', newAnalysisId)
    .order('rank');

  if (newError) throw newError;

  const improved: IssueChange[] = [];
  const worsened: IssueChange[] = [];
  const newIssues: IssueChange[] = [];
  const stable: StableIssue[] = [];

  const matchedNewCauseIds = new Set<string>();

  for (const baselineCause of baselineCauses || []) {
    const matchingNewCause = findMatchingCause(
      baselineCause,
      newCauses || []
    );

    if (matchingNewCause) {
      matchedNewCauseIds.add(matchingNewCause.id);

      const baselineFreq = baselineCause.frequency;
      const newFreq = matchingNewCause.frequency;
      const percentChange = ((newFreq - baselineFreq) / baselineFreq) * 100;

      const issueChange: IssueChange = {
        theme: matchingNewCause.title,
        baselineFrequency: baselineFreq,
        newFrequency: newFreq,
        percentChange: Math.round(percentChange),
        exampleQuotes: matchingNewCause.quotes.slice(0, 2),
      };

      if (percentChange <= -20) {
        improved.push(issueChange);
      } else if (percentChange >= 20) {
        worsened.push(issueChange);
      } else {
        stable.push({ theme: matchingNewCause.title });
      }
    }
  }

  for (const newCause of newCauses || []) {
    if (!matchedNewCauseIds.has(newCause.id)) {
      newIssues.push({
        theme: newCause.title,
        baselineFrequency: 0,
        newFrequency: newCause.frequency,
        percentChange: 100,
        exampleQuotes: newCause.quotes.slice(0, 2),
      });
    }
  }

  improved.sort((a, b) => a.percentChange - b.percentChange);
  worsened.sort((a, b) => b.percentChange - a.percentChange);
  newIssues.sort((a, b) => b.newFrequency - a.newFrequency);

  let overallTrend: 'improving' | 'declining' | 'mixed';
  const improvementScore = improved.length;
  const concernScore = worsened.length + newIssues.length;

  if (improvementScore > concernScore) {
    overallTrend = 'improving';
  } else if (concernScore > improvementScore) {
    overallTrend = 'declining';
  } else {
    overallTrend = 'mixed';
  }

  const biggestImprovement = improved.length > 0 ? improved[0].theme : null;
  const biggestConcern = worsened.length > 0
    ? worsened[0].theme
    : (newIssues.length > 0 ? newIssues[0].theme : null);

  return {
    overallTrend,
    biggestImprovement,
    biggestConcern,
    improved,
    worsened,
    newIssues,
    stable,
  };
}

export async function saveDeltaAnalysis(
  analysisId: string,
  baselineId: string,
  deltaData: DeltaAnalysis
): Promise<void> {
  const { error } = await supabase
    .from('analysis_deltas')
    .insert({
      analysis_id: analysisId,
      baseline_id: baselineId,
      delta_data: deltaData,
    });

  if (error) throw error;
}

export async function getDeltaAnalysis(analysisId: string): Promise<DeltaAnalysis | null> {
  const { data, error } = await supabase
    .from('analysis_deltas')
    .select('delta_data')
    .eq('analysis_id', analysisId)
    .maybeSingle();

  if (error) throw error;
  return data ? (data.delta_data as DeltaAnalysis) : null;
}

export async function getPulseComparison(analysisId: string): Promise<PulseComparison | null> {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('analysis_id', analysisId);

  if (error) throw error;
  if (!reviews || reviews.length === 0) return null;

  const last30 = getLast30Days();
  const prev30 = getPrevious30Days();

  const reviews30 = filterReviewsByDateRange(reviews, last30.startDate, last30.endDate);
  const reviewsPrev30 = filterReviewsByDateRange(reviews, prev30.startDate, prev30.endDate);

  const rootCauses30 = await getRootCausesForPeriod(analysisId, reviews30);
  const rootCausesPrev30 = await getRootCausesForPeriod(analysisId, reviewsPrev30);

  const comparison = compareRootCauseSets(rootCausesPrev30, rootCauses30);

  return {
    improved: comparison.improved,
    worsened: comparison.worsened,
    newIssues: comparison.newIssues,
    reviewCount30: reviews30.length,
    reviewCountPrev30: reviewsPrev30.length,
    confidence: getConfidenceLabel(reviews30.length),
    dateRange30: `${last30.startDate.toLocaleDateString()} - ${last30.endDate.toLocaleDateString()}`,
    dateRangePrev30: `${prev30.startDate.toLocaleDateString()} - ${prev30.endDate.toLocaleDateString()}`,
  };
}

export async function getNewSinceLastRunComparison(
  analysisId: string,
  previousAnalysisDate: Date
): Promise<NewSinceLastRunComparison | null> {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('analysis_id', analysisId);

  if (error) throw error;
  if (!reviews || reviews.length === 0) return null;

  const dateRange = getNewSinceDate(previousAnalysisDate);
  const newReviews = filterReviewsByDateRange(reviews, dateRange.startDate, dateRange.endDate);

  const newRootCauses = await getRootCausesForPeriod(analysisId, newReviews);

  const emergingThemes = newRootCauses
    .filter(cause => cause.frequency > 10)
    .map(cause => cause.title);

  const newIssues: IssueChange[] = newRootCauses.map(cause => ({
    theme: cause.title,
    baselineFrequency: 0,
    newFrequency: cause.frequency,
    percentChange: 100,
    exampleQuotes: cause.quotes.slice(0, 2),
  }));

  return {
    newIssues,
    emergingThemes,
    reviewCount: newReviews.length,
    lastAnalysisDate: previousAnalysisDate.toLocaleDateString(),
    confidence: getConfidenceLabel(newReviews.length),
  };
}

export async function getBaselineDriftComparison(analysisId: string): Promise<BaselineDriftComparison | null> {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('analysis_id', analysisId);

  if (error) throw error;
  if (!reviews || reviews.length === 0) return null;

  const last30 = getLast30Days();
  const rolling180 = getRolling180Days();

  const reviews30 = filterReviewsByDateRange(reviews, last30.startDate, last30.endDate);
  const reviews180 = filterReviewsByDateRange(reviews, rolling180.startDate, rolling180.endDate);

  const rootCauses30 = await getRootCausesForPeriod(analysisId, reviews30);
  const rootCauses180 = await getRootCausesForPeriod(analysisId, reviews180);

  const comparison = compareRootCauseSets(rootCauses180, rootCauses30);

  let betterOrWorse: 'better' | 'worse' | 'stable' = 'stable';
  if (comparison.improved.length > comparison.worsened.length) {
    betterOrWorse = 'better';
  } else if (comparison.worsened.length > comparison.improved.length) {
    betterOrWorse = 'worse';
  }

  return {
    vsBaseline: [...comparison.improved, ...comparison.worsened, ...comparison.newIssues],
    betterOrWorse,
    reviewCount30: reviews30.length,
    reviewCount180: reviews180.length,
    confidence: getConfidenceLabel(reviews30.length),
    baselineIssues: rootCauses180.map(cause => cause.title),
  };
}

async function getRootCausesForPeriod(analysisId: string, reviews: Review[]): Promise<RootCause[]> {
  if (reviews.length === 0) return [];

  const { data: rootCauses, error } = await supabase
    .from('root_causes')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('rank');

  if (error) throw error;
  return rootCauses || [];
}

function compareRootCauseSets(
  baselineCauses: RootCause[],
  newCauses: RootCause[]
): { improved: IssueChange[]; worsened: IssueChange[]; newIssues: IssueChange[] } {
  const improved: IssueChange[] = [];
  const worsened: IssueChange[] = [];
  const newIssues: IssueChange[] = [];

  const matchedNewCauseIds = new Set<string>();

  for (const baselineCause of baselineCauses) {
    const matchingNewCause = findMatchingCause(baselineCause, newCauses);

    if (matchingNewCause) {
      matchedNewCauseIds.add(matchingNewCause.id);

      const baselineFreq = baselineCause.frequency;
      const newFreq = matchingNewCause.frequency;
      const percentChange = ((newFreq - baselineFreq) / baselineFreq) * 100;

      const issueChange: IssueChange = {
        theme: matchingNewCause.title,
        baselineFrequency: baselineFreq,
        newFrequency: newFreq,
        percentChange: Math.round(percentChange),
        exampleQuotes: matchingNewCause.quotes.slice(0, 2),
      };

      if (percentChange <= -20) {
        improved.push(issueChange);
      } else if (percentChange >= 20) {
        worsened.push(issueChange);
      }
    }
  }

  for (const newCause of newCauses) {
    if (!matchedNewCauseIds.has(newCause.id)) {
      newIssues.push({
        theme: newCause.title,
        baselineFrequency: 0,
        newFrequency: newCause.frequency,
        percentChange: 100,
        exampleQuotes: newCause.quotes.slice(0, 2),
      });
    }
  }

  improved.sort((a, b) => a.percentChange - b.percentChange);
  worsened.sort((a, b) => b.percentChange - a.percentChange);
  newIssues.sort((a, b) => b.newFrequency - a.newFrequency);

  return { improved, worsened, newIssues };
}
