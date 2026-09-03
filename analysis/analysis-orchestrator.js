import { BASELINE_METRICS } from './analysis-config.js';
import { createBaselineSnapshot } from './baseline-engine.js';
import { metricCompletionReport } from './data-quality-engine.js';
import { buildRecommendationEvidence } from './recommendation-pipeline.js';
import { generateRecommendations } from './recommendation-engine.js';
import { analyzeTcmClusters } from './tcm-cluster-engine.js';
import { analyzeTcmStates } from './tcm-state-engine.js';
import { analyzeConstitutionProfile } from './constitution-profile.js';
import { buildInsights } from './insight-builder.js';
import { aggregateInterventionResponses } from './intervention-response-aggregator.js';
import { createExplanation, explanationFromEvent, explanationFromPattern } from './explanation-object.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const profiled = (name, operation) => { const report = globalThis.__PERIOD_ANALYSIS_PROFILE__; if (typeof report !== 'function') return operation(); const started = performance.now(); try { return operation(); } finally { report(name, performance.now() - started); } };

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function analysisFingerprint(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function insightExplanation(insight, calculatedAt) {
  return createExplanation({
    id: insight.id,
    kind: `insight.${insight.type}`,
    metric: insight.observation?.metric || insight.observation?.symptom || null,
    direction: Number(insight.observation?.effectSizeRaw) > 0 ? 'higher' : Number(insight.observation?.effectSizeRaw) < 0 ? 'lower' : 'neutral',
    scope: insight.timing?.onsetWindow || insight.observation?.window || {},
    evidence: [{ effect_size: insight.observation?.effectSizeRaw ?? null, sample_size: insight.observation?.sampleSize || 0, cycles_covered: insight.observation?.cyclesCovered || 0 }],
    quality_level: insight.confidenceLevel === 'stable' ? 'good' : insight.confidenceLevel === 'moderate' ? 'usable' : 'limited',
    confidence_level: insight.confidenceLevel,
    source_ids: [insight.id],
    calculated_at: calculatedAt
  });
}

function tcmExplanation(cluster, calculatedAt) {
  return createExplanation({
    id: `tcm:${cluster.cluster_id}`,
    kind: 'tcm.observation_cluster',
    metric: cluster.cluster_id,
    direction: 'neutral',
    scope: { cycles_covered: cluster.cycles_covered, phase_specificity: cluster.phase_specificity?.type || 'insufficient' },
    evidence: [
      ...cluster.constituent_features.map((item) => ({ feature: item.label, count: item.count, direction: 'supporting' })),
      ...(cluster.contradicting_features || []).map((item) => ({ feature: item.label, count: item.count, direction: 'contradicting' }))
    ],
    quality_level: cluster.maturity === 'stable_cluster' ? 'good' : cluster.status === 'detected' ? 'usable' : 'insufficient',
    confidence_level: cluster.confidence_level,
    reasons: cluster.data_quality?.reasons || [],
    source_ids: [cluster.cluster_id],
    calculated_at: calculatedAt
  });
}

function tcmStateExplanation(state, calculatedAt) {
  return createExplanation({
    id: `tcm-state:${state.id}`,
    kind: 'tcm.recent_state',
    metric: state.id,
    direction: state.trend,
    scope: state.window,
    evidence: [...state.supportingEvidence.map((item) => ({ feature: item.label, count: item.count, score: item.score })), ...state.contradictingEvidence.map((item) => ({ feature: item.label, count: item.count, score: item.score }))],
    quality_level: state.confidence === 'high' ? 'good' : state.confidence === 'moderate' ? 'usable' : state.confidence === 'exploratory' ? 'limited' : 'insufficient',
    confidence_level: state.confidence,
    reasons: state.insufficientDataReason ? [state.insufficientDataReason] : [],
    source_ids: [state.id],
    calculated_at: calculatedAt
  });
}

function buildSignatures(input) {
  const records = analysisFingerprint({ logs: input.logs, periods: input.periods, as_of: input.as_of });
  const knowledge = analysisFingerprint({ insights: input.config?.version, tcm: input.tcm_rules?.version, actions: input.observation_actions });
  const feedback = analysisFingerprint(input.intervention_usage || []);
  const constitution = analysisFingerprint(input.constitution_profile || {});
  const safety = analysisFingerprint(input.safety_context || {});
  return Object.freeze({ records, knowledge, feedback, constitution, safety, core: analysisFingerprint({ records, knowledge, constitution }), recommendations: analysisFingerprint({ records, knowledge, feedback, constitution, safety, library: input.intervention_library?.library?.version || null, phase: input.phase || null }) });
}

function calculateCore(input, signatures, calculatedAt, previous) {
  if (previous?._dependency_signatures?.core === signatures.core && previous.core) return previous.core;
  const quality = profiled('quality',()=>metricCompletionReport({ logs: input.logs, start: addDays(input.as_of, -29), end: input.as_of, metrics: ['mood', 'energy', 'sleep', 'bowel', 'pain', 'activity', 'stress', 'social_intensity'] }));
  const baselineAsOf = addDays(input.as_of, -1);
  const baselines = profiled('baselines',()=>createBaselineSnapshot({ logs: input.logs, periods: input.periods, as_of: baselineAsOf, calculated_at: calculatedAt, phaseForDate: input.phase_for_date, current_phase: input.phase?.key || input.current_phase }));
  const priorEvents = previous?.core?.health_events || [];
  const evidence = profiled('recommendation-evidence',()=>buildRecommendationEvidence({ logs: input.logs, periods: input.periods, phase: input.phase || {}, record_date: input.as_of, baseline_snapshot: baselines, prior_events: priorEvents, phase_for_date: input.phase_for_date }));
  const tcmStates = profiled('tcm-states',()=>analyzeTcmStates({ logs: input.logs, as_of: input.as_of }));
  const tcmClusters = profiled('tcm-clusters',()=>analyzeTcmClusters({ logs: input.logs, periods: input.periods, as_of: input.as_of, rules_config: input.tcm_rules }));
  const constitutionProfile = profiled('constitution-profile',()=>analyzeConstitutionProfile({ profile: input.constitution_profile, logs: input.logs, as_of: input.as_of }));
  const rawInsights = profiled('insight-builder',()=>buildInsights({ logs: input.logs, periods: input.periods, as_of: input.as_of, next_start: input.next_start, prediction_confidence: input.prediction_confidence, config: input.config, observation_actions: input.observation_actions, tcm_clusters: tcmClusters }));
  const explanations = profiled('explanations',()=>[
    ...evidence.health_events.map(explanationFromEvent),
    ...evidence.patterns.filter((item) => item.status !== 'insufficient').map((item) => explanationFromPattern(item, calculatedAt)),
    ...tcmStates.map((item) => tcmStateExplanation(item, calculatedAt)),
    ...tcmClusters.map((item) => tcmExplanation(item, calculatedAt)),
    ...rawInsights.map((item) => insightExplanation(item, calculatedAt))
  ]);
  return Object.freeze({ quality, baselines, health_events: evidence.health_events, patterns: evidence.patterns, target_window: evidence.target_window, tcm_states: tcmStates, tcm_clusters: tcmClusters, constitution_profile: constitutionProfile, raw_insights: rawInsights, explanations });
}

export function runAnalysis(input = {}, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.as_of || '')) throw new TypeError('analysis as_of must use YYYY-MM-DD');
  if (!input.config || !input.tcm_rules) throw new TypeError('analysis config and tcm rules are required');
  const normalized = { ...input, logs: input.logs || {}, periods: input.periods || [], observation_actions: input.observation_actions || [], intervention_usage: input.intervention_usage || [] };
  const calculatedAt = options.calculated_at || new Date().toISOString(), previous = options.previous_snapshot || null, signatures = profiled('signatures',()=>buildSignatures(normalized));
  const core = profiled('core',()=>calculateCore(normalized, signatures, calculatedAt, previous));
  const interventionResponses = previous?._dependency_signatures?.feedback === signatures.feedback && previous.intervention_responses ? previous.intervention_responses : aggregateInterventionResponses(normalized.intervention_usage);
  let recommendations = null;
  if (normalized.intervention_library) {
    recommendations = previous?._dependency_signatures?.recommendations === signatures.recommendations && previous.recommendations ? previous.recommendations : generateRecommendations({
      today_record: normalized.logs[normalized.as_of], record_date: normalized.as_of, health_events: core.health_events,
      patterns: core.patterns, tcm_states: core.tcm_states, tcm_patterns: core.tcm_clusters,
      constitution_profile: core.constitution_profile,
      safety: normalized.safety, contraindication: normalized.contraindication, medication: normalized.medication, safety_context: normalized.safety_context,
      intervention_library: normalized.intervention_library, phase: normalized.phase || {}, intervention_history: normalized.intervention_usage
    });
  }
  const reusedSections = previous ? [previous?._dependency_signatures?.core === signatures.core ? 'core' : null, previous?._dependency_signatures?.feedback === signatures.feedback ? 'feedback' : null, previous?._dependency_signatures?.recommendations === signatures.recommendations ? 'recommendations' : null].filter(Boolean) : [];
  return Object.freeze({ schema_version: 2, generated_at: calculatedAt, as_of: normalized.as_of, core, intervention_responses: interventionResponses, recommendations, explanations: core.explanations, performance: { mode: reusedSections.length ? 'incremental' : 'full', reused_sections: reusedSections }, _dependency_signatures: signatures });
}

export const AnalysisOrchestrator = Object.freeze({ run: runAnalysis, fingerprint: analysisFingerprint, baseline_metrics: BASELINE_METRICS });
