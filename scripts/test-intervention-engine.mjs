import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateCondition, evaluateIntervention, rankInterventions, validateInterventionLibrary } from '../analysis/intervention-engine.js';

const fullLibrary = JSON.parse(fs.readFileSync(new URL('../knowledge/interventions.v1.json', import.meta.url), 'utf8'));
const validation = validateInterventionLibrary(fullLibrary);
assert.equal(validation.valid, true, validation.errors.join('\n'));
assert.equal(validation.intervention_count, 114);

assert.equal(evaluateCondition({ field: 'bowel', operator: '==', value: false }, { bowel: false }).matched, true);
assert.equal(evaluateCondition({ field: 'bowel', operator: '==', value: false }, {}).matched, false, 'missing must not become false');
assert.equal(evaluateCondition({ field: 'bowel', operator: '!=', value: true }, {}).matched, false, 'missing must not satisfy !=');
assert.equal(evaluateCondition({ field: 'phase', operator: 'not_in', value: ['period'] }, {}).matched, false, 'missing must not satisfy not_in');
assert.equal(evaluateCondition({ field: 'phase', operator: 'in', value: ['period', 'late_luteal'] }, { phase: 'period' }).matched, true);
assert.equal(evaluateCondition({ field: 'phase', operator: 'not_in', value: ['period'] }, { phase: 'follicular' }).matched, true);
assert.equal(evaluateCondition({ field: 'score', operator: '>', value: 2 }, { score: 3 }).matched, true);
assert.equal(evaluateCondition({ field: 'score', operator: '<', value: 4 }, { score: 3 }).matched, true);
assert.equal(evaluateCondition({ field: 'score', operator: '<=', value: 3 }, { score: 3 }).matched, true);
assert.equal(evaluateCondition({ field: 'score', operator: '!=', value: 4 }, { score: 3 }).matched, true);
assert.equal(evaluateCondition({ field: 'pain', operator: 'exists' }, { pain: 0 }).matched, true, 'zero is a recorded value');
assert.equal(evaluateCondition({ field: 'pain', operator: 'not_exists' }, {}).matched, true);
assert.equal(evaluateCondition({ field: 'stress', operator: 'deviation_gte', value: 1 }, {
  stress: 4,
  baselines: { stress: { value: 2.5, quality_level: 'usable' } }
}).matched, true);
assert.equal(evaluateCondition({ field: 'stress', operator: 'deviation_gte', value: 1 }, {
  stress: 4,
  baselines: { stress: { value: 2.5, quality_level: 'limited' } }
}).matched, false, 'limited baseline cannot drive deviation matching');
assert.equal(evaluateCondition({ field: 'energy', operator: 'deviation_lte', value: -1 }, {
  deviations: { energy: -1.5 }
}).matched, true);
assert.equal(evaluateCondition({ field: 'menstrual_flow_pattern', operator: 'pattern_exists', value: 'recurrently_high' }, {
  patterns: { menstrual_flow_pattern: ['recurrently_high'] }
}).matched, true);

const base = {
  version: 1,
  status: 'active',
  availability: 'ready',
  category: 'test',
  matching: {
    hard_requirements: [{ field: 'consent', operator: '==', value: true }],
    scoring_features: [{ condition: { field: 'stress', operator: '>=', value: 3 }, weight: 3 }],
    minimum_score: 3,
    exclusions: [{ field: 'contraindication.blocked', operator: '==', value: true }]
  },
  recommendation_policy: {
    recommendation_priority: 50,
    cooldown_hours: 10,
    max_daily_uses: 2,
    requires_current_state: true,
    requires_personal_pattern: false,
    prefer_if_personally_helpful: true,
    deprioritize_after_unhelpful_uses: 3
  }
};
const first = { ...base, id: 'A', recommendation_policy: { ...base.recommendation_policy, recommendation_priority: 60 } };
const second = { ...base, id: 'B' };
const context = { consent: true, stress: 4, cycle_phase: 'late_luteal', evidence: { stress: [{}] }, contraindication: { blocked: false }, safety_event: { active: false } };

assert.equal(evaluateIntervention(first, context, { now: '2026-08-14T12:00:00Z' }).eligible, true);
assert.equal(evaluateIntervention(first, { ...context, contraindication: { blocked: true } }).eligible, false);
assert.ok(evaluateIntervention(first, { ...context, safety_event: { active: true } }).exclusion_reasons.some((reason) => reason.code === 'safety_override'));
assert.ok(evaluateIntervention(first, { stress: 4 }).exclusion_reasons.some((reason) => reason.code === 'hard_requirement_missing'));

const ranked = rankInterventions([second, first], context, { now: '2026-08-14T12:00:00Z' });
assert.deepEqual(ranked.candidates.map((item) => item.intervention_id), ['A', 'B'], 'priority must break equal matching scores');

const cooldown = evaluateIntervention(first, context, {
  now: '2026-08-14T12:00:00Z',
  history: [{ intervention_id: 'A', used_at: '2026-08-14T08:00:00Z', helpful: true }]
});
assert.equal(cooldown.eligible, false);
assert.ok(cooldown.exclusion_reasons.some((reason) => reason.code === 'cooldown_active'));

const deprioritized = rankInterventions([first, second], context, {
  now: '2026-08-14T12:00:00Z',
  history: [
    { intervention_id: 'A', context_version: 1, cycle_phase: 'late_luteal', matched_signals: ['stress'], used_at: '2026-08-10T08:00:00Z', helpful: false },
    { intervention_id: 'A', context_version: 1, cycle_phase: 'late_luteal', matched_signals: ['stress'], used_at: '2026-08-11T08:00:00Z', helpful: false },
    { intervention_id: 'A', context_version: 1, cycle_phase: 'late_luteal', matched_signals: ['stress'], used_at: '2026-08-12T08:00:00Z', helpful: false }
  ]
});
assert.deepEqual(deprioritized.candidates.map((item) => item.intervention_id), ['B', 'A'], 'repeatedly unhelpful intervention must be deprioritized');

const realResult = rankInterventions(fullLibrary, {
  menstrual_status: 'bleeding',
  pain: { lower_abdomen: 2 },
  cold_sensation: true,
  cold_hands_feet: true,
  safety_event: { active: false },
  pregnancy_status: 'not_known',
  contraindication: {},
  medication: {}
}, { now: '2026-08-14T12:00:00Z' });
assert.ok(realResult.candidates.length > 0);
assert.ok(realResult.candidates.every((item) => item.score >= item.minimum_score));

console.log(`Intervention engine passed: ${validation.intervention_count} items, ${realResult.candidates.length} candidates.`);
