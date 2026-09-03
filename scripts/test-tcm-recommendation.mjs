import assert from 'node:assert/strict';
import { rankInterventions } from '../analysis/intervention-engine.js';
import { generateRecommendations } from '../analysis/recommendation-engine.js';

const intervention = (id, extraField, priority = 50) => ({
  id, version: 1, status: 'active', availability: 'ready', category: 'test', name: id,
  matching: {
    hard_requirements: [], minimum_score: 3, exclusions: [],
    scoring_features: [
      { condition: { field: 'pain.lower_abdomen', operator: '>=', value: 1 }, weight: 3 },
      ...(extraField ? [{ condition: { field: extraField, operator: '==', value: true }, weight: 2 }] : [])
    ]
  },
  observation: { primary_metrics: ['pain.lower_abdomen', ...(extraField ? [extraField] : [])] },
  recommendation_policy: { recommendation_priority: priority, cooldown_hours: 0, max_daily_uses: 2, requires_current_state: true, requires_personal_pattern: false }
});

const warm = intervention('WARM', 'cold_sensation', 40), neutral = intervention('NEUTRAL', null, 60);
const library = { library: { version: 'tcm-test' }, interventions: [neutral, warm] };
const baseContext = { pain: { lower_abdomen: 2 }, current_state_available: true, safety_event: { active: false }, intervention_history: [] };
const baseline = rankInterventions(library, baseContext, { now: '2026-09-03T12:00:00Z' });
assert.equal(baseline.candidates[0].intervention_id, 'NEUTRAL', '没有TCM证据时仍按原有优先级排序');

const coldPattern = {
  cluster_id: 'cold_menstrual_pattern', display_name: '经期寒冷与冷痛样模式', status: 'detected', confidence_level: 'moderate',
  constituent_features: [{ field: 'cold_sensation', label: '明显怕冷' }, { field: 'pain_quality.cold', label: '冷痛' }],
  contradicting_features: [], phase_specificity: { type: 'menstrual', label: '主要在经期' }
};
const patterned = rankInterventions(library, { ...baseContext, cycle_phase: 'menstrual', tcm_patterns: [coldPattern] }, { now: '2026-09-03T12:00:00Z' });
assert.equal(patterned.candidates[0].intervention_id, 'WARM', '跨周期TCM模式必须真实改变相同当天证据下的排序');
assert.ok(patterned.candidates[0].tcm_pattern_boost > 0);
assert.equal(patterned.candidates[0].tcm_pattern_matches[0].phase_boost, 1, '模式集中阶段与今天一致时必须增加周期权重');

const coldState = {
  id: 'cold_state', name: '寒冷感受近期明显', active: true, confidence: 'high', trend: 'stable',
  supportingEvidence: [{ field: 'cold_sensation', label: '明显怕冷' }], contradictingEvidence: []
};
const stateRanked = rankInterventions(library, { ...baseContext, tcm_states: [coldState] }, { now: '2026-09-03T12:00:00Z' });
assert.equal(stateRanked.candidates[0].intervention_id, 'WARM', '近期状态必须参与干预排序');
assert.ok(stateRanked.candidates[0].recent_state_boost > 0);

const contradictedState = { ...coldState, supportingEvidence: [{ field: 'pain_response.warmth_relief', label: '热敷后缓解' }], contradictingEvidence: [{ field: 'cold_sensation', label: '明确没有怕冷' }] };
const contradicted = rankInterventions(library, { ...baseContext, tcm_states: [contradictedState] }, { now: '2026-09-03T12:00:00Z' });
const contradictedWarm = [...contradicted.candidates, ...contradicted.excluded].find((item) => item.intervention_id === 'WARM');
assert.ok(contradictedWarm.contradiction_penalty > 0, '反向状态证据必须降低推荐分数');
assert.ok(contradictedWarm.score < stateRanked.candidates.find((item) => item.intervention_id === 'WARM').score);

const log = { pain: 3, painLocations: ['小腹/盆腔'], fieldStatus: { pain: 'reported', painLocations: 'reported' } };
const result = generateRecommendations({ today_record: log, record_date: '2026-09-03', tcm_states: [coldState], tcm_patterns: [coldPattern], intervention_library: library, phase: { key: 'period', cycleDay: 2 }, now: '2026-09-03T12:00:00Z' });
assert.equal(result.status, 'RECOMMENDATIONS');
assert.equal(result.recommendations[0].reason.code, 'CURRENT_DISCOMFORT', '当天明确不适必须高于近期状态和跨周期模式');
assert.equal(result.recommendations[0].matched_states[0].state_id, 'cold_state');
assert.equal(result.recommendations[0].matched_patterns[0].pattern_id, 'cold_menstrual_pattern');
assert.ok('today_match' in result.recommendations[0].score_components && 'contradiction' in result.recommendations[0].score_components);

console.log('TCM state/pattern recommendation ranking, phase boost, contradiction and explanation tests passed.');
