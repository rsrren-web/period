import assert from 'node:assert/strict';
import { evaluateRecommendationGate, generateRecommendations } from '../analysis/recommendation-engine.js';

const item = (id, field, priority = 50) => ({
  id, version: 1, status: 'active', availability: 'ready', category: 'test', name: id,
  matching: { hard_requirements: [], scoring_features: [{ condition: { field, operator: field === 'cycle_phase' ? '==' : '>=', value: field === 'cycle_phase' ? 'menstrual' : 1 }, weight: 3 }], minimum_score: 3, exclusions: [{ field: 'safety_event.active', operator: '==', value: true }] },
  observation: { primary_metrics: [field] },
  recommendation_policy: { recommendation_priority: priority, cooldown_hours: 0, max_daily_uses: 2, requires_current_state: true, requires_personal_pattern: false, prefer_if_personally_helpful: true, deprioritize_after_unhelpful_uses: 3 }
});
const library = { library: { version: 'test' }, interventions: [item('PAIN_A', 'pain.lower_abdomen', 70), item('PAIN_B', 'pain.lower_abdomen', 60), item('CYCLE', 'cycle_phase', 40)] };
const date = '2026-08-14';

const empty = generateRecommendations({ today_record: {}, record_date: date, intervention_library: library, phase: { key: 'follicular', cycleDay: 8 }, now: `${date}T12:00:00Z` });
assert.equal(empty.status, 'NO_RECOMMENDATION');
assert.equal(empty.recommendations.length, 0, 'no evidence must never be backfilled');

const log = { pain: 3, painLocations: ['小腹/盆腔'], fieldStatus: { pain: 'reported', painLocations: 'reported' } };
const current = generateRecommendations({ today_record: log, record_date: date, intervention_library: library, phase: { key: 'follicular', cycleDay: 8 }, now: `${date}T12:00:00Z` });
assert.equal(current.status, 'RECOMMENDATIONS');
assert.equal(current.recommendations.length, 1, 'same-target interventions must not duplicate the page');
assert.equal(current.recommendations[0].intervention_id, 'PAIN_A');
assert.equal(current.recommendations[0].reason.code, 'CURRENT_DISCOMFORT');

const event = { event_id: 'event:deviation:test', event_type: 'deviation', metric: 'pain_max', value: 3, confidence_level: 'medium', supporting_data: { signed_difference: 2 } };
const eventGate = evaluateRecommendationGate({ today_record: log, health_events: [event], patterns: [], intervention_library: library, current_discomforts: [], cycle_day: 8 });
assert.equal(eventGate.passed, true);
assert.equal(eventGate.triggers[0].source_event_id, event.event_id);

const cyclePattern = { pattern_id: 'pattern:cycle:test', pattern_type: 'cycle_pattern', metric: 'pain_max', target_window: { start_day: 1, end_day: 7 }, status: 'detected', confidence_level: 'medium', cycles_covered: 2 };
assert.equal(evaluateRecommendationGate({ today_record: log, patterns: [cyclePattern], intervention_library: library, current_discomforts: [], cycle_day: 8 }).passed, false, 'outside cycle window must not pass');
assert.equal(evaluateRecommendationGate({ today_record: log, patterns: [cyclePattern], intervention_library: library, current_discomforts: [], cycle_day: 5 }).passed, true);

const temporal = { pattern_id: 'pattern:temporal:test', pattern_type: 'temporal_association', metric: 'stress:next_day:sleep_quality', metric_a: 'stress', metric_b: 'sleep_quality', status: 'detected', confidence_level: 'low', cycles_covered: 2 };
assert.equal(evaluateRecommendationGate({ patterns: [temporal], intervention_library: library, current_discomforts: [] }).passed, false, 'low-confidence temporal association must not pass');
temporal.confidence_level = 'high'; temporal.cycles_covered = 3;
const temporalGate = evaluateRecommendationGate({ patterns: [temporal], intervention_library: library, current_discomforts: [] });
assert.equal(temporalGate.passed, true);
assert.equal(temporalGate.triggers[0].stability, 'stable');

const blocked = generateRecommendations({ today_record: log, record_date: date, intervention_library: library, phase: { key: 'follicular', cycleDay: 8 }, safety: { active: true }, now: `${date}T12:00:00Z` });
assert.equal(blocked.status, 'NO_RECOMMENDATION');
assert.ok(blocked.reasons.includes('NO_INTERVENTION_PASSED_MATCHING_AND_EXCLUSIONS'));

console.log('Recommendation gate and engine tests passed.');

