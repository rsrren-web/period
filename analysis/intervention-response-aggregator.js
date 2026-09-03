import { ANALYSIS_CONFIG } from './analysis-config.js';

const round = (value) => value === null ? null : Math.round(value * 1000) / 1000;

export function aggregateInterventionResponses(entries = []) {
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.intervention_id || !entry?.target || !entry?.used_at) continue;
    const key = `${entry.target}:${entry.intervention_id}`;
    const list = groups.get(key) || []; list.push(entry); groups.set(key, list);
  }
  return [...groups.values()].flatMap((items) => {
    if (items.length < ANALYSIS_CONFIG.feedback.minimum_uses) return [];
    const paired = items.filter((item) => Number.isFinite(Number(item.before)) && Number.isFinite(Number(item.after)));
    const helpful = items.filter((item) => item.helpful === true || item.outcome === 'helpful').length;
    const meanBefore = paired.length ? paired.reduce((sum, item) => sum + Number(item.before), 0) / paired.length : null;
    const meanAfter = paired.length ? paired.reduce((sum, item) => sum + Number(item.after), 0) / paired.length : null;
    const meanDelta = meanBefore === null || meanAfter === null ? null : round(meanBefore - meanAfter);
    const recommendationIds = [...new Set(items.map((item) => item.recommendation_id).filter(Boolean))];
    const adverseEffects = items.filter((item) => item.adverse_effect === true).length;
    const contexts = [...new Set(items.filter((item) => item.context_version === 1).map((item) => [item.cycle_phase, ...(item.matched_states || []), ...(item.matched_patterns || [])].filter(Boolean).join(' · ')).filter(Boolean))].slice(0, 3);
    return [{ interventionId: items[0].intervention_id, interventionName: items[0].intervention_name || items[0].intervention_id, target: items[0].target, uses: items.length, pairedUses: paired.length, improvementCount: helpful, helpfulRate: items.length ? helpful / items.length : null, meanBefore: round(meanBefore), meanAfter: round(meanAfter), meanDelta, adverseEffects, contexts, recommendationIds, dataLabel: items.length < ANALYSIS_CONFIG.feedback.stable_uses ? '数据仍少' : '可比较', status: items.length < ANALYSIS_CONFIG.feedback.stable_uses ? 'exploratory' : 'usable', rankingSignal: items.length < ANALYSIS_CONFIG.feedback.minimum_uses ? 'none' : helpful / items.length >= ANALYSIS_CONFIG.feedback.helpful_rate_preference ? 'prefer' : helpful / items.length < 0.40 ? 'deprioritize' : 'neutral' }];
  });
}

const overlap = (a = [], b = []) => { const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]); return union.size ? [...left].filter((item) => right.has(item)).length / union.size : 0; };
export function contextSimilarity(entry = {}, context = {}) {
  if (entry.context_version !== 1) return 0;
  const phase = entry.cycle_phase && context.cycle_phase ? Number(entry.cycle_phase === context.cycle_phase) : 0;
  const signals = overlap(entry.matched_signals, context.matched_signals), states = overlap(entry.matched_states, context.matched_states), patterns = overlap(entry.matched_patterns, context.matched_patterns);
  return phase * 0.4 + Math.max(signals, states, patterns) * 0.6;
}

export function interventionEffectivenessByContext(entries = [], context = {}) {
  const similar = (Array.isArray(entries) ? entries : []).filter((entry) => contextSimilarity(entry, context) >= 0.5);
  const outcomes = similar.filter((entry) => entry.helpful === true || entry.helpful === false), helpful = outcomes.filter((entry) => entry.helpful === true).length;
  return Object.freeze({ uses: similar.length, sampleSize: outcomes.length, helpfulUses: helpful, helpfulRate: outcomes.length ? helpful / outcomes.length : null, adverseEffects: similar.filter((entry) => entry.adverse_effect === true).length, quality: outcomes.length >= ANALYSIS_CONFIG.feedback.stable_uses ? 'stable' : outcomes.length >= ANALYSIS_CONFIG.feedback.minimum_uses ? 'usable' : 'insufficient' });
}

export const InterventionResponseAggregator = Object.freeze({ aggregate: aggregateInterventionResponses, byContext: interventionEffectivenessByContext, similarity: contextSimilarity });
