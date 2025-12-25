import { supabase } from './supabase';

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.search = '';
    urlObj.hash = '';
    let normalized = urlObj.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.trim();
  }
}

export interface Business {
  id: string;
  user_id: string;
  business_name: string;
  google_maps_url: string;
  created_at: string;
}

export interface Analysis {
  id: string;
  business_id: string;
  user_id: string;
  business_url: string;
  business_name: string;
  is_baseline: boolean;
  review_count: number;
  average_rating: number;
  status: string;
  created_at: string;
  completed_at: string;
}

export interface RootCause {
  id: string;
  analysis_id: string;
  rank: number;
  title: string;
  severity: string;
  frequency: number;
  bullets: string[];
  quotes: string[];
}

export interface CoachingScript {
  id: string;
  analysis_id: string;
  role: string;
  focus: string;
  script: string;
}

export interface ProcessChange {
  id: string;
  analysis_id: string;
  change: string;
  why: string;
  steps: string[];
  time_estimate: string;
}

export interface BacklogTask {
  id: string;
  analysis_id: string;
  week: number;
  task: string;
  effort: string;
  impact: string;
  owner: string;
}

export interface FullAnalysisReport {
  analysis: Analysis;
  rootCauses: RootCause[];
  coachingScripts: CoachingScript[];
  processChanges: ProcessChange[];
  backlogTasks: BacklogTask[];
}

export interface BusinessWithLatestAnalysis extends Business {
  latest_analysis?: {
    id: string;
    average_rating: number;
    created_at: string;
  };
  analysis_count?: number;
}

export async function getUserBusinesses(): Promise<BusinessWithLatestAnalysis[]> {
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select(`
      *,
      analyses(id, average_rating, created_at)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return businesses.map((business: any) => ({
    ...business,
    latest_analysis: business.analyses?.[0] || null,
    analysis_count: business.analyses?.length || 0,
  }));
}

export async function getBusinessByUrl(url: string): Promise<Business | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const normalizedUrl = normalizeUrl(url);

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .eq('google_maps_url', normalizedUrl)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createBusiness(
  businessName: string,
  googleMapsUrl: string
): Promise<Business> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const normalizedUrl = normalizeUrl(googleMapsUrl);

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      user_id: user.id,
      business_name: businessName,
      google_maps_url: normalizedUrl,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBusinessName(
  businessId: string,
  newName: string
): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({ business_name: newName })
    .eq('id', businessId);

  if (error) throw error;
}

export async function deleteBusiness(businessId: string): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .delete()
    .eq('id', businessId);

  if (error) throw error;
}

export async function createAnalysis(
  businessId: string,
  businessUrl: string,
  businessName: string,
  reviewCount: number,
  averageRating: number,
  isBaseline: boolean,
  paymentId?: string | null,
  amountPaid?: number
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('analyses')
    .insert({
      business_id: businessId,
      user_id: user.id,
      business_url: businessUrl,
      business_name: businessName,
      review_count: reviewCount,
      average_rating: averageRating,
      is_baseline: isBaseline,
      status: 'completed',
      completed_at: new Date().toISOString(),
      payment_id: paymentId,
      amount_paid: amountPaid,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function saveRootCauses(
  analysisId: string,
  rootCauses: Array<{
    rank: number;
    title: string;
    severity: string;
    frequency: string;
    bullets: string[];
    quotes: string[];
  }>
): Promise<void> {
  const records = rootCauses.map((cause, index) => ({
    analysis_id: analysisId,
    rank: index + 1,
    title: cause.title,
    severity: cause.severity,
    frequency: parseInt(cause.frequency) || 0,
    bullets: cause.bullets,
    quotes: cause.quotes,
  }));

  const { error } = await supabase.from('root_causes').insert(records);

  if (error) throw error;
}

export async function saveCoachingScripts(
  analysisId: string,
  scripts: Array<{
    role: string;
    focus: string;
    script: string;
  }>
): Promise<void> {
  const records = scripts.map((script) => ({
    analysis_id: analysisId,
    role: script.role,
    focus: script.focus,
    script: script.script,
  }));

  const { error } = await supabase.from('coaching_scripts').insert(records);

  if (error) throw error;
}

export async function saveProcessChanges(
  analysisId: string,
  changes: Array<{
    change: string;
    why: string;
    howTo: string;
    timeEstimate: string;
  }>
): Promise<void> {
  const records = changes.map((change) => ({
    analysis_id: analysisId,
    change: change.change,
    why: change.why,
    steps: [change.howTo],
    time_estimate: change.timeEstimate,
  }));

  const { error } = await supabase.from('process_changes').insert(records);

  if (error) throw error;
}

export async function saveBacklogTasks(
  analysisId: string,
  tasks: Array<{
    week: string;
    task: string;
    effort: string;
    impact: string;
    owner: string;
  }>
): Promise<void> {
  const records = tasks.map((task) => ({
    analysis_id: analysisId,
    week: parseInt(task.week.replace('Week ', '')) || 1,
    task: task.task,
    effort: task.effort,
    impact: task.impact,
    owner: task.owner,
  }));

  const { error } = await supabase.from('backlog_tasks').insert(records);

  if (error) throw error;
}

export async function getFullAnalysisReport(
  analysisId: string
): Promise<FullAnalysisReport> {
  const { data: analysis, error: analysisError } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (analysisError) throw analysisError;

  const { data: rootCauses, error: rootCausesError } = await supabase
    .from('root_causes')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('rank');

  if (rootCausesError) throw rootCausesError;

  const { data: coachingScripts, error: coachingError } = await supabase
    .from('coaching_scripts')
    .select('*')
    .eq('analysis_id', analysisId);

  if (coachingError) throw coachingError;

  const { data: processChanges, error: processError } = await supabase
    .from('process_changes')
    .select('*')
    .eq('analysis_id', analysisId);

  if (processError) throw processError;

  const { data: backlogTasks, error: backlogError } = await supabase
    .from('backlog_tasks')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('week');

  if (backlogError) throw backlogError;

  return {
    analysis,
    rootCauses,
    coachingScripts,
    processChanges,
    backlogTasks,
  };
}

export async function getBusinessAnalyses(businessId: string): Promise<Analysis[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getBusinessById(businessId: string): Promise<Business | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getBaselineAnalysis(businessId: string): Promise<Analysis | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_baseline', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function hasDeltaAnalysis(analysisId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('analysis_deltas')
    .select('id')
    .eq('analysis_id', analysisId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export async function saveReviews(
  analysisId: string,
  reviews: Array<{
    rating: number;
    text: string;
    date: string;
    author: string;
  }>
): Promise<void> {
  const records = reviews.map((review) => ({
    analysis_id: analysisId,
    rating: review.rating,
    text: review.text,
    review_date: review.date,
    author: review.author || '',
  }));

  const { error } = await supabase.from('reviews').insert(records);

  if (error) throw error;
}

export async function getAnalysisReviews(analysisId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('review_date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function cleanupDuplicateBusinesses(): Promise<{
  cleaned: number;
  kept: number;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: allBusinesses, error: fetchError } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (fetchError) throw fetchError;
  if (!allBusinesses || allBusinesses.length === 0) {
    return { cleaned: 0, kept: 0 };
  }

  const urlMap = new Map<string, Business[]>();

  for (const business of allBusinesses) {
    const normalizedUrl = normalizeUrl(business.google_maps_url);
    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, []);
    }
    urlMap.get(normalizedUrl)!.push(business);
  }

  let cleanedCount = 0;
  let keptCount = 0;

  for (const [normalizedUrl, businesses] of urlMap.entries()) {
    if (businesses.length > 1) {
      const keepBusiness = businesses[0];
      const duplicates = businesses.slice(1);

      keptCount++;

      for (const duplicate of duplicates) {
        const { data: analyses, error: analysesError } = await supabase
          .from('analyses')
          .select('id')
          .eq('business_id', duplicate.id);

        if (analysesError) {
          console.error(`Error fetching analyses for business ${duplicate.id}:`, analysesError);
          continue;
        }

        if (analyses && analyses.length > 0) {
          const { error: updateError } = await supabase
            .from('analyses')
            .update({ business_id: keepBusiness.id })
            .eq('business_id', duplicate.id);

          if (updateError) {
            console.error(`Error moving analyses from ${duplicate.id} to ${keepBusiness.id}:`, updateError);
            continue;
          }
        }

        const { error: deleteError } = await supabase
          .from('businesses')
          .delete()
          .eq('id', duplicate.id);

        if (deleteError) {
          console.error(`Error deleting duplicate business ${duplicate.id}:`, deleteError);
        } else {
          cleanedCount++;
        }
      }

      if (keepBusiness.google_maps_url !== normalizedUrl) {
        const { error: normalizeError } = await supabase
          .from('businesses')
          .update({ google_maps_url: normalizedUrl })
          .eq('id', keepBusiness.id);

        if (normalizeError) {
          console.error(`Error normalizing URL for business ${keepBusiness.id}:`, normalizeError);
        }
      }
    } else {
      keptCount++;

      const business = businesses[0];
      if (business.google_maps_url !== normalizedUrl) {
        const { error: normalizeError } = await supabase
          .from('businesses')
          .update({ google_maps_url: normalizedUrl })
          .eq('id', business.id);

        if (normalizeError) {
          console.error(`Error normalizing URL for business ${business.id}:`, normalizeError);
        }
      }
    }
  }

  return { cleaned: cleanedCount, kept: keptCount };
}
