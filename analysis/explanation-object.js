const LEVELS = new Set(['insufficient', 'limited', 'usable', 'good']);
const CONFIDENCE = new Set(['insufficient', 'low', 'medium', 'high', 'exploratory', 'moderate', 'stable']);

function freezeArray(value) {
  return Object.freeze(Array.isArray(value) ? value.map((item) => item && typeof item === 'object' ? Object.freeze({ ...item }) : item) : []);
}

export function createExplanation({
  id, kind, metric = null, direction = 'neutral', scope = {}, evidence = [],
  quality_level = 'insufficient', confidence_level = 'insufficient', reasons = [],
  source_ids = [], calculated_at = new Date().toISOString()
} = {}) {
  if (!id || !kind) throw new TypeError('explanation id and kind are required');
  return Object.freeze({
    explanation_id: `explanation:${id}`,
    schema_version: 1,
    kind,
    metric,
    direction,
    scope: Object.freeze({ ...scope }),
    evidence: freezeArray(evidence),
    quality_level: LEVELS.has(quality_level) ? quality_level : 'limited',
    confidence_level: CONFIDENCE.has(confidence_level) ? confidence_level : 'low',
    reasons: freezeArray(reasons),
    source_ids: freezeArray(source_ids.filter(Boolean)),
    calculated_at
  });
}

export function explanationFromEvent(event) {
  return createExplanation({
    id: event.event_id,
    kind: `health_event.${event.event_type}`,
    metric: event.metric,
    direction: event.supporting_data?.direction || 'neutral',
    scope: event.date_range,
    evidence: [{ value: event.value, baseline_value: event.baseline_value, sample_size: event.sample_size }],
    quality_level: event.supporting_data?.data_quality?.quality_level || 'usable',
    confidence_level: event.confidence_level,
    reasons: event.supporting_data?.data_quality?.reasons || [],
    source_ids: [event.event_id],
    calculated_at: event.created_at
  });
}

export function explanationFromPattern(pattern, calculatedAt = new Date().toISOString()) {
  const quality = pattern.data_quality?.target || pattern.data_quality?.metric_a;
  return createExplanation({
    id: pattern.pattern_id,
    kind: `pattern.${pattern.pattern_type}`,
    metric: pattern.metric,
    direction: Number(pattern.effect_size) > 0 ? 'higher' : Number(pattern.effect_size) < 0 ? 'lower' : 'neutral',
    scope: pattern.date_range || pattern.target_window || {},
    evidence: [{ effect_size: pattern.effect_size, sample_size: pattern.sample_size, cycles_covered: pattern.cycles_covered }],
    quality_level: quality?.quality_level || (pattern.status === 'insufficient' ? 'insufficient' : 'usable'),
    confidence_level: pattern.confidence_level,
    reasons: quality?.reasons || [],
    source_ids: [pattern.pattern_id],
    calculated_at: calculatedAt
  });
}

export const ExplanationObject = Object.freeze({ create: createExplanation, fromEvent: explanationFromEvent, fromPattern: explanationFromPattern });
