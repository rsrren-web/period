import { metricCompletionReport } from './data-quality-engine.js';
import { buildInsights } from './insight-builder.js';
import { rankAndFilterInsights, rankInsight } from './insight-ranker.js';
import { aggregateInterventionResponses } from './intervention-response-aggregator.js';
import { analyzeTcmClusters } from './tcm-cluster-engine.js';

const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);

export function createInsightsPageData({ logs = {}, periods = [], as_of, next_start, prediction_confidence, config, tcm_rules, observation_actions = [], intervention_usage = [] } = {}) {
  const tcmClusters = analyzeTcmClusters({ logs, periods, as_of, rules_config: tcm_rules });
  const raw = buildInsights({ logs, periods, as_of, next_start, prediction_confidence, config, observation_actions, tcm_clusters: tcmClusters });
  const eligible = raw.filter((insight) => {
    if (insight.observation.effectSizeType === 'mean_difference') return Math.abs(insight.observation.effectSizeRaw) >= config.pattern.scale_mean_diff_min;
    return Math.abs(insight.observation.effectSizeRaw) >= config.pattern.binary_effect_min;
  });
  const { ranked, top } = rankAndFilterInsights(eligible, config, as_of);
  const allRanked = raw.map((insight) => rankInsight(insight, config, as_of));
  const nextCycleWindows = allRanked.filter((insight) => insight.status === 'active' && insight.timing?.nextExpectedWindow && insight.ranking.insightValue >= 0.50).sort((a, b) => a.timing.nextExpectedWindow.startDate.localeCompare(b.timing.nextExpectedWindow.startDate));
  const phaseProfiles = ranked.filter((insight) => insight.type === 'phase_profile');
  const associations = ranked.filter((insight) => ['co_occurrence', 'temporal_association'].includes(insight.type));
  const start = addDays(as_of, -29);
  const qualityReport = metricCompletionReport({ logs, start, end: as_of, metrics: ['mood', 'energy', 'sleep', 'bowel', 'pain', 'activity'] });
  const quality = Object.values(qualityReport);
  const metrics = Object.fromEntries(quality.map((item) => [item.metric, item]));
  return Object.freeze({
    generatedAt: new Date().toISOString(), topInsights: top, nextCycleWindows, phaseProfiles,
    associations: { sameDay: associations.filter((item) => item.observation.supportingData.relation === 'same_day'), previousToToday: associations.filter((item) => item.observation.supportingData.relation === 'previous_day'), todayToNextDay: associations.filter((item) => item.observation.supportingData.relation === 'next_day') },
    interventionResponses: aggregateInterventionResponses(intervention_usage),
    tcmClusters: allRanked.filter((item) => item.type === 'tcm_cluster' && item.status === 'active'),
    dataQualitySummary: { overall: quality.every((item) => ['usable', 'good'].includes(item.quality_level)) ? 'usable' : quality.some((item) => item.quality_level === 'insufficient') ? 'limited' : 'usable', incompleteMetrics: quality.filter((item) => !['usable', 'good'].includes(item.quality_level)).map((item) => item.metric), metrics }
  });
}

export const InsightsPageDataBuilder = Object.freeze({ create: createInsightsPageData });
