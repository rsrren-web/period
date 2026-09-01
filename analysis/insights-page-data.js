import { rankAndFilterInsights, rankInsight } from './insight-ranker.js';
import { runAnalysis } from './analysis-orchestrator.js';

const clusterConfidenceRank = Object.freeze({ stable: 3, moderate: 2, exploratory: 1 });

export function createInsightsPageData({ logs = {}, periods = [], as_of, next_start, prediction_confidence, config, tcm_rules, observation_actions = [], intervention_usage = [], phase, phase_for_date, previous_snapshot } = {}) {
  const analysis = runAnalysis({ logs, periods, as_of, next_start, prediction_confidence, config, tcm_rules, observation_actions, intervention_usage, phase, phase_for_date }, { previous_snapshot });
  const raw = analysis.core.raw_insights;
  const eligible = raw.filter((insight) => {
    if (['state_cluster', 'temporal_cluster', 'co_occurrence', 'temporal_association'].includes(insight.type)) return false;
    if (insight.observation.effectSizeType === 'mean_difference') return Math.abs(insight.observation.effectSizeRaw) >= config.pattern.scale_mean_diff_min;
    return Math.abs(insight.observation.effectSizeRaw) >= config.pattern.binary_effect_min;
  });
  const { ranked, top } = rankAndFilterInsights(eligible, config, as_of);
  const allRanked = raw.map((insight) => rankInsight(insight, config, as_of));
  const nextCycleWindows = allRanked.filter((insight) => insight.status === 'active' && insight.timing?.nextExpectedWindow && insight.ranking.insightValue >= 0.50).sort((a, b) => a.timing.nextExpectedWindow.startDate.localeCompare(b.timing.nextExpectedWindow.startDate));
  const phaseProfiles = ranked.filter((insight) => insight.type === 'phase_profile');
  const associations = ranked.filter((insight) => ['co_occurrence', 'temporal_association'].includes(insight.type));
  const stateClusters = allRanked.filter((insight) => insight.type === 'state_cluster' && insight.status === 'active')
    .sort((a, b) => clusterConfidenceRank[b.confidenceLevel] - clusterConfidenceRank[a.confidenceLevel] || b.observation.supportingData.constituentFeatures.length - a.observation.supportingData.constituentFeatures.length || b.observation.supportingData.occurrenceCount - a.observation.supportingData.occurrenceCount || a.id.localeCompare(b.id));
  const temporalClusters = allRanked.filter((insight) => insight.type === 'temporal_cluster' && insight.status === 'active')
    .sort((a, b) => clusterConfidenceRank[b.confidenceLevel] - clusterConfidenceRank[a.confidenceLevel] || b.observation.supportingData.todayFeatures.length + b.observation.supportingData.tomorrowFeatures.length - a.observation.supportingData.todayFeatures.length - a.observation.supportingData.tomorrowFeatures.length || b.observation.effectSizeRaw - a.observation.effectSizeRaw || a.id.localeCompare(b.id));
  const qualityReport = analysis.core.quality;
  const quality = Object.values(qualityReport);
  const metrics = Object.fromEntries(quality.map((item) => [item.metric, item]));
  return Object.freeze({
    generatedAt: analysis.generated_at, topInsights: top, nextCycleWindows, phaseProfiles, stateClusters, temporalClusters,
    associations: { sameDay: associations.filter((item) => item.observation.supportingData.relation === 'same_day'), previousToToday: associations.filter((item) => item.observation.supportingData.relation === 'previous_day'), todayToNextDay: associations.filter((item) => item.observation.supportingData.relation === 'next_day') },
    interventionResponses: analysis.intervention_responses,
    tcmClusters: allRanked.filter((item) => item.type === 'tcm_cluster' && item.status === 'active'),
    dataQualitySummary: { overall: quality.every((item) => ['usable', 'good'].includes(item.quality_level)) ? 'usable' : quality.some((item) => item.quality_level === 'insufficient') ? 'limited' : 'usable', incompleteMetrics: quality.filter((item) => !['usable', 'good'].includes(item.quality_level)).map((item) => item.metric), metrics },
    explanations: analysis.explanations,
    analysisPerformance: analysis.performance,
    _analysisSnapshot: analysis
  });
}

export const InsightsPageDataBuilder = Object.freeze({ create: createInsightsPageData });
