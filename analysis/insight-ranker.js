const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const CONFIDENCE_SCORES = Object.freeze({ exploratory: 0.40, moderate: 0.70, stable: 1 });
const CYCLE_SCORES = Object.freeze({ 0: 0, 1: 0.15, 2: 0.30, 3: 0.50, 4: 0.70, 5: 0.85 });

export function effectScore(observation = {}) {
  const raw = Math.abs(Number(observation.effectSizeRaw) || 0);
  if (observation.effectSizeType === 'mean_difference') return clamp(raw / 1.5);
  if (observation.effectSizeType === 'standardized_mean_difference') return clamp(raw / 1.0);
  if (observation.effectSizeType === 'risk_ratio') return clamp(Math.abs(raw - 1) / 1.5);
  return clamp(raw / 0.50);
}

export const confidenceScore = (level) => CONFIDENCE_SCORES[level] || 0;
export const cyclesScore = (cycles) => Number(cycles) >= 6 ? 1 : CYCLE_SCORES[Math.max(0, Math.floor(Number(cycles) || 0))] || 0;

export function recencyScore(insight, asOf) {
  const support = insight?.observation?.supportingData?.lastSupportedDate;
  if (!support || !asOf) return 0.20;
  const days = Math.max(0, Math.round((Date.parse(`${asOf}T12:00:00Z`) - Date.parse(`${support}T12:00:00Z`)) / 86400000));
  if (days <= 14) return 1;
  if (days <= 30) return 0.80;
  if (days <= 60) return 0.55;
  if (days <= 90) return 0.35;
  return 0.20;
}

export function actionabilityScore(action) {
  if (action?.type === 'intervention' && action.matchedInterventionIds?.length) return 1;
  if (action?.type === 'observation' && action.observationAction) return 0.75;
  if (action?.type === 'observation') return 0.55;
  if (action?.type === 'none') return 0.25;
  return 0;
}

export function rankInsight(insight, config, asOf) {
  const scores = {
    effectScore: effectScore(insight.observation),
    confidenceScore: confidenceScore(insight.confidenceLevel),
    cyclesScore: cyclesScore(insight.observation?.cyclesCovered),
    recencyScore: recencyScore(insight, asOf),
    actionabilityScore: actionabilityScore(insight.action)
  };
  const weights = config.ranking.weights;
  const insightValue = clamp(scores.effectScore * weights.effect + scores.confidenceScore * weights.confidence +
    scores.cyclesScore * weights.cycles + scores.recencyScore * weights.recency + scores.actionabilityScore * weights.actionability);
  return Object.freeze({ ...insight, ranking: Object.freeze({ ...scores, insightValue: Math.round(insightValue * 1000) / 1000 }) });
}

export function rankAndFilterInsights(insights, config, asOf) {
  const ranked = insights.map((insight) => rankInsight(insight, config, asOf))
    .filter((insight) => insight.status === 'active' && insight.ranking.insightValue >= config.ranking.detail_min)
    .sort((a, b) => b.ranking.insightValue - a.ranking.insightValue || b.ranking.actionabilityScore - a.ranking.actionabilityScore ||
      b.ranking.effectScore - a.ranking.effectScore || b.ranking.confidenceScore - a.ranking.confidenceScore || a.id.localeCompare(b.id));
  const top = [], targets = new Set();
  for (const insight of ranked) {
    if (insight.ranking.insightValue < config.ranking.top_insight_min) continue;
    const target = insight.observation.metric || insight.observation.symptom || insight.id;
    if (targets.has(target)) continue;
    top.push(insight); targets.add(target);
    if (top.length >= config.ranking.max_top_insights) break;
  }
  return Object.freeze({ ranked, top });
}

export const InsightRanker = Object.freeze({ rank: rankInsight, rankAndFilter: rankAndFilterInsights });
