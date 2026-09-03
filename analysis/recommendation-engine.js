import { ANALYSIS_CONFIG } from './analysis-config.js';
import { rankInterventions } from './intervention-engine.js';
import { adaptRecommendationContext } from './recommendation-context-adapter.js';
import { createExplanation } from './explanation-object.js';

const supportedConfidence = (pattern) => ANALYSIS_CONFIG.recommendations.supported_confidence.includes(pattern?.confidence_level);
const activeInterventions = (library) => (library?.interventions || []).filter((item) => item.status === 'active' && item.availability === 'ready');
const interventionFields = (item) => new Set([
  ...(item.matching?.hard_requirements || []).map((condition) => condition.field),
  ...(item.matching?.scoring_features || []).map((feature) => feature.condition?.field),
  ...(item.observation?.primary_metrics || [])
].filter(Boolean));

function librarySupportsMetric(library, metric) {
  return activeInterventions(library).some((item) => {
    const fields = interventionFields(item);
    if (fields.has(metric)) return true;
    return metric === 'pain_max' && [...fields].some((field) => field.startsWith('pain.'));
  });
}

function validEvent(event) {
  return event?.event_id && ['deviation', 'persistence'].includes(event.event_type) && event.confidence_level !== 'insufficient';
}

function canonicalEventMetric(event) {
  return event?.metric === 'bowel' && event?.value === false ? 'no_bowel_movement' : event?.metric;
}

function cycleWindowActive(pattern, cycleDay) {
  return pattern?.pattern_type === 'cycle_pattern' && pattern.status === 'detected' && supportedConfidence(pattern) &&
    Number.isInteger(cycleDay) && cycleDay >= pattern.target_window?.start_day && cycleDay <= pattern.target_window?.end_day;
}

function supportedTemporal(pattern) {
  return pattern?.pattern_type === 'temporal_association' && pattern.status === 'detected' && supportedConfidence(pattern);
}

const canonicalTcmField = (field) => ({ warmth_relief: 'pain_response.warmth_relief', lower_abdomen_pain: 'pain.lower_abdomen', breast_chest_pain: 'breast_tenderness', neck_shoulder_pain: 'pain.neck_shoulder', sleep: 'sleep_quality', activity: 'activity_level' })[field] || field;
const supportingFields = (item) => (item?.supportingEvidence || item?.constituent_features || []).map((evidence) => canonicalTcmField(evidence.field)).filter(Boolean);

export function evaluateRecommendationGate({ today_record, health_events = [], patterns = [], tcm_states = [], tcm_patterns = [], intervention_library, current_discomforts = [], cycle_day } = {}) {
  const triggers = [];
  for (const event of health_events.filter(validEvent)) triggers.push({
    trigger_type: 'health_event', source_event_id: event.event_id, source_pattern_id: null,
    metric: canonicalEventMetric(event), source_priority: ANALYSIS_CONFIG.recommendations.source_priority.health_event, evidence: event
  });
  for (const pattern of patterns.filter(supportedTemporal)) triggers.push({
    trigger_type: 'personal_pattern', source_event_id: null, source_pattern_id: pattern.pattern_id,
    metric: pattern.metric_b, related_metrics: [pattern.metric_a, pattern.metric_b], source_priority: ANALYSIS_CONFIG.recommendations.source_priority.personal_pattern, evidence: pattern,
    stability: pattern.confidence_level === ANALYSIS_CONFIG.recommendations.stable_confidence && pattern.cycles_covered >= ANALYSIS_CONFIG.recommendations.stable_min_cycles ? 'stable' : 'supported'
  });
  for (const pattern of patterns.filter((item) => cycleWindowActive(item, cycle_day))) triggers.push({
    trigger_type: 'cycle_pattern', source_event_id: null, source_pattern_id: pattern.pattern_id,
    metric: pattern.metric, source_priority: ANALYSIS_CONFIG.recommendations.source_priority.cycle_pattern, evidence: pattern
  });
  for (const state of tcm_states.filter((item) => item?.active && item.confidence !== 'insufficient')) {
    const related = supportingFields(state).filter((metric) => librarySupportsMetric(intervention_library, metric));
    if (related.length) triggers.push({
      trigger_type: 'recent_state', source_event_id: null, source_pattern_id: null, source_state_id: state.id,
      metric: state.id, related_metrics: related, source_priority: ANALYSIS_CONFIG.recommendations.source_priority.recent_state, evidence: state
    });
  }
  for (const pattern of tcm_patterns.filter((item) => item?.status === 'detected')) {
    const related = supportingFields(pattern).filter((metric) => librarySupportsMetric(intervention_library, metric));
    if (related.length) triggers.push({
      trigger_type: 'tcm_pattern', source_event_id: null, source_pattern_id: pattern.cluster_id,
      metric: pattern.cluster_id, related_metrics: related, source_priority: ANALYSIS_CONFIG.recommendations.source_priority.tcm_pattern, evidence: pattern
    });
  }
  for (const item of current_discomforts) if (librarySupportsMetric(intervention_library, item.metric)) triggers.push({
    trigger_type: 'current_discomfort', source_event_id: null, source_pattern_id: null,
    metric: item.metric, source_priority: ANALYSIS_CONFIG.recommendations.source_priority.current_discomfort, evidence: item
  });
  const unique = [...new Map(triggers.map((trigger) => [`${trigger.trigger_type}:${trigger.source_event_id || trigger.source_pattern_id || trigger.source_state_id || trigger.metric}`, trigger])).values()];
  return {
    passed: unique.length > 0,
    status: unique.length ? 'PASSED' : 'NO_RECOMMENDATION',
    triggers: unique,
    reasons: unique.length ? [] : [
      'NO_VALID_DEVIATION_OR_PERSISTENCE',
      'NO_ACTIVE_SUPPORTED_PATTERN',
      'NO_ACTIVE_TCM_STATE_OR_PATTERN',
      'NO_EXPLICIT_MAPPED_DISCOMFORT'
    ],
    record_present: Boolean(today_record)
  };
}

function triggerMatchesCandidate(trigger, candidate) {
  const fields = new Set([
    ...candidate.scoring_checks.map((feature) => feature.condition.field),
    ...(candidate.intervention?.observation?.primary_metrics || [])
  ]);
  if (fields.has(trigger.metric)) return true;
  if (trigger.related_metrics?.some((metric) => fields.has(metric))) return true;
  if (trigger.metric === 'pain_max' && [...fields].some((field) => field.startsWith('pain.'))) return true;
  if (trigger.trigger_type === 'cycle_pattern' && fields.has('cycle_phase')) return true;
  return false;
}

function evidenceRank(candidate, triggers) {
  const matches = triggers.filter((trigger) => triggerMatchesCandidate(trigger, candidate)).sort((a, b) => b.source_priority - a.source_priority ||
    String(a.source_event_id || a.source_pattern_id || a.metric).localeCompare(String(b.source_event_id || b.source_pattern_id || b.metric)));
  return matches;
}

function whyMatched(candidate, fieldEvidence = {}) {
  const excluded = new Set(['cycle_phase', 'cycle_day']);
  const rows = candidate.matched_features.map((feature) => {
    const field = feature.condition.field, sources = fieldEvidence[field] || [];
    return { field, value: feature.actual, weight: feature.weight, sources, explicit: sources.some((item) => /^(detail:|tcm:|painLocations|pain$|primaryEmotion|bedtime|flow_level|clot_level)/.test(item.source || '')) };
  }).filter((item) => !excluded.has(item.field));
  rows.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.weight - a.weight || a.field.localeCompare(b.field));
  return rows.slice(0, 4).map((item) => Object.freeze(item));
}

function recommendationId(date, interventionId, trigger) {
  const source = trigger.source_event_id || trigger.source_pattern_id || trigger.source_state_id || `${trigger.trigger_type}:${trigger.metric}`;
  return `recommendation:${date}:${interventionId}:${source}`;
}

function noRecommendation(gate, date, evaluatedAt, extraReasons = []) {
  const reasons = [...gate.reasons, ...extraReasons];
  return Object.freeze({ status: 'NO_RECOMMENDATION', recommendations: [], gate, reasons, explanations: [createExplanation({ id: `recommendation:none:${date}`, kind: 'recommendation.gate', scope: { date }, quality_level: 'limited', confidence_level: 'low', reasons, calculated_at: evaluatedAt })], valid_for_date: date, evaluated_at: evaluatedAt });
}

export function generateRecommendations({ today_record, record_date, health_events = [], patterns = [], tcm_states = [], tcm_patterns = [], constitution_profile = null, intervention_library, phase = {}, safety, contraindication, medication, safety_context, intervention_history = [], now = new Date().toISOString() } = {}) {
  if (!intervention_library) throw new TypeError('intervention_library is required');
  const adapted = adaptRecommendationContext({ today_record, record_date, phase, health_events, patterns, tcm_states, tcm_patterns, constitution_profile, safety, contraindication, medication, safety_context, intervention_history });
  const cycleDay = adapted.context.cycle_day;
  const gate = evaluateRecommendationGate({ today_record, health_events, patterns, tcm_states, tcm_patterns, intervention_library, current_discomforts: adapted.current_discomforts, cycle_day: cycleDay });
  if (!gate.passed) return noRecommendation(gate, record_date, now);
  const ranking = rankInterventions(intervention_library, adapted.context, { now, history: intervention_history, currentStateAvailable: adapted.context.current_state_available, personalPatternAvailable: gate.triggers.some((trigger) => ['personal_pattern', 'tcm_pattern'].includes(trigger.trigger_type)) });
  const linked = ranking.candidates.map((candidate) => ({ candidate, evidence: evidenceRank(candidate, gate.triggers) })).filter((item) => item.evidence.length);
  linked.sort((left, right) => right.evidence[0].source_priority - left.evidence[0].source_priority ||
    right.candidate.score - left.candidate.score || right.candidate.effective_priority - left.candidate.effective_priority ||
    (right.candidate.personally_helpful_rate ?? -1) - (left.candidate.personally_helpful_rate ?? -1) || left.candidate.intervention_id.localeCompare(right.candidate.intervention_id));
  const selected = [];
  const targetKeys = new Set();
  for (const item of linked) {
    const targetKey = (item.candidate.intervention.observation?.primary_metrics || []).slice().sort().join('|') || item.candidate.intervention_id;
    if (targetKeys.has(targetKey)) continue;
    const primary = item.evidence[0];
    const priority = primary.source_priority * 10_000 + item.candidate.score * 100 + item.candidate.effective_priority;
    selected.push(Object.freeze({
      recommendation_id: recommendationId(record_date, item.candidate.intervention_id, primary),
      source_event_id: primary.source_event_id,
      source_pattern_id: primary.source_pattern_id,
      source_state_id: primary.source_state_id || null,
      intervention_id: item.candidate.intervention_id,
      cycle_phase: adapted.context.cycle_phase || null,
      cycle_day: adapted.context.cycle_day || null,
      reason: Object.freeze({ code: primary.trigger_type.toUpperCase(), metric: primary.metric, evidence_type: primary.trigger_type, observed_value: primary.evidence?.value ?? null }),
      priority,
      supporting_evidence: item.evidence.map((evidence) => ({ type: evidence.trigger_type, id: evidence.source_event_id || evidence.source_pattern_id || evidence.source_state_id || null, metric: evidence.metric })),
      match_score: item.candidate.score,
      base_match_score: item.candidate.base_score,
      why_matched: whyMatched(item.candidate, adapted.evidence),
      combination_matches: item.candidate.combination_matches,
      persistence_matches: item.candidate.persistence_matches,
      matched_states: item.candidate.state_matches,
      matched_patterns: item.candidate.tcm_pattern_matches,
      matched_constitutions: item.candidate.constitution_matches,
      contradicting_signals: item.candidate.contradiction_matches,
      score_components: Object.freeze({ today_match: item.candidate.base_score, same_day_combination: item.candidate.combination_boost, persistence: item.candidate.persistence_boost, recent_state: item.candidate.recent_state_boost, tcm_pattern: item.candidate.tcm_pattern_boost, constitution_support: item.candidate.constitution_support_boost, contradiction: -item.candidate.contradiction_penalty, personal_effectiveness: item.candidate.feedback_adjustment }),
      personal_history: item.candidate.history,
      unknown_safety_fields: item.candidate.unknown_safety_fields,
      intervention: item.candidate.intervention
    }));
    targetKeys.add(targetKey);
    if (selected.length >= ANALYSIS_CONFIG.recommendations.max_items) break;
  }
  if (!selected.length) return noRecommendation(gate, record_date, now, [ranking.excluded.some((item) => item.exclusion_reasons.some((reason) => reason.code === 'unknown_safety')) ? 'SAFETY_PROFILE_REQUIRED' : 'NO_INTERVENTION_PASSED_MATCHING_AND_EXCLUSIONS']);
  const explanations = selected.map((item) => createExplanation({ id: item.recommendation_id, kind: 'recommendation.match', metric: item.reason.metric, scope: { date: record_date, cycle_phase: phase.key || null }, evidence: item.supporting_evidence, quality_level: 'usable', confidence_level: item.source_pattern_id || item.source_state_id ? 'medium' : 'low', source_ids: [item.source_event_id, item.source_pattern_id, item.source_state_id, ...(item.matched_constitutions || []).map((entry) => entry.constitution_id), item.intervention_id], calculated_at: now }));
  return Object.freeze({ status: 'RECOMMENDATIONS', recommendations: selected, gate, reasons: [], explanations, valid_for_date: record_date, evaluated_at: now });
}

export const RecommendationGate = Object.freeze({ evaluate: evaluateRecommendationGate });
export const RecommendationEngine = Object.freeze({ generate: generateRecommendations });
