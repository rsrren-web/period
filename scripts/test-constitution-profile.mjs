import assert from 'node:assert/strict';
import { analyzeConstitutionProfile, CONSTITUTION_DEFINITIONS, normalizeConstitutionProfile } from '../analysis/constitution-profile.js';
import { rankInterventions } from '../analysis/intervention-engine.js';
import { generateRecommendations } from '../analysis/recommendation-engine.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const profile = normalizeConstitutionProfile({ baseline: { yang_deficiency: 'high', qi_stagnation: 'invalid' }, assessedAt: '2026-08-20', updatedAt: '2026-08-20T12:00:00.000Z' });
assert.equal(CONSTITUTION_DEFINITIONS.length, 9, '长期体质档案必须覆盖九类人工基线');
assert.equal(profile.baseline.yang_deficiency, 'high');
assert.equal(profile.baseline.qi_stagnation, null, '未知程度不得进入档案');
assert.equal(profile.source, 'manual');

const logs = {};
for (let offset = -29; offset <= 0; offset++) {
  const cold = offset >= -9;
  logs[addDays('2026-09-03', offset)] = { symptomTags: writeTcmObservations([], { cold_sensation: cold ? 'yes' : 'no', warmth_relief: cold ? 'yes' : 'no' }), fieldStatus: { symptomTags: 'reported' } };
}
const analysis = analyzeConstitutionProfile({ profile, logs, as_of: '2026-09-03' });
assert.equal(analysis.established, true);
assert.equal(analysis.active[0].id, 'yang_deficiency');
assert.equal(analysis.evidence90d.yang_deficiency.validDays, 30);
assert.equal(analysis.evidence90d.yang_deficiency.supportingDays, 10);
assert.equal(analysis.evidence90d.yang_deficiency.confidence, 'usable');
assert.equal(analysis.recentDifference.yang_deficiency.direction, 'increased', '最近14天必须与此前记录分开比较');
assert.equal(analysis.evidence90d.balanced.confidence, 'manual_only', '无可靠每日生产者的体质不得自动推断');

const item = (id, extraField, priority) => ({ id, version: 1, status: 'active', availability: 'ready', category: 'test', name: id,
  matching: { hard_requirements: [], exclusions: [], minimum_score: 3, scoring_features: [{ condition: { field: 'pain.lower_abdomen', operator: '>=', value: 1 }, weight: 3 }, ...(extraField ? [{ condition: { field: extraField, operator: '==', value: true }, weight: 2 }] : [])] },
  observation: { primary_metrics: ['pain.lower_abdomen', ...(extraField ? [extraField] : [])] }, recommendation_policy: { recommendation_priority: priority, cooldown_hours: 0, max_daily_uses: 2, requires_current_state: true, requires_personal_pattern: false } });
const library = { library: { version: 'constitution-test' }, interventions: [item('NEUTRAL', null, 60), item('WARM', 'cold_sensation', 40)] };
const context = { pain: { lower_abdomen: 2 }, current_state_available: true, constitution_profile: analysis };
const ranked = rankInterventions(library, context, { now: '2026-09-03T12:00:00Z' });
assert.equal(ranked.candidates[0].intervention_id, 'WARM', '人工基线与90天证据可低权重调整已触发建议的排序');
assert.ok(ranked.candidates[0].constitution_support_boost > 0 && ranked.candidates[0].constitution_support_boost <= 2);

const today = { pain: 3, painLocations: ['小腹/盆腔'], fieldStatus: { pain: 'reported', painLocations: 'reported' } };
const recommendations = generateRecommendations({ today_record: today, record_date: '2026-09-03', intervention_library: library, constitution_profile: analysis, phase: { key: 'period', cycleDay: 2 }, now: '2026-09-03T12:00:00Z' });
assert.equal(recommendations.recommendations[0].reason.code, 'CURRENT_DISCOMFORT', '长期体质不能替代当天触发原因');
assert.equal(recommendations.recommendations[0].matched_constitutions[0].constitution_id, 'yang_deficiency');
assert.ok(recommendations.recommendations[0].score_components.constitution_support > 0);
const noTrigger = generateRecommendations({ today_record: {}, record_date: '2026-09-03', intervention_library: library, constitution_profile: analysis, phase: { key: 'follicular', cycleDay: 9 }, now: '2026-09-03T12:00:00Z' });
assert.equal(noTrigger.status, 'NO_RECOMMENDATION', '长期体质不得单独触发调养建议');
console.log('Constitution baseline, 90-day evidence, recent difference and low-priority recommendation tests passed.');
