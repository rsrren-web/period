import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCareContext } from '../analysis/care-context.js';
import { evaluateIntervention } from '../analysis/intervention-engine.js';
import { generateRecommendations } from '../analysis/recommendation-engine.js';
import { writeDailyDetails } from '../daily-detail-model.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const library = JSON.parse(fs.readFileSync(new URL('../knowledge/interventions.v1.json', import.meta.url), 'utf8'));
const byId = (id) => library.interventions.find((item) => item.id === id);
const status = { pain: 'reported', stress: 'reported', energy: 'reported', sleep: 'reported', painLocations: 'reported', menstrual_status: 'reported' };

const coldTags = writeDailyDetails(writeTcmObservations([], {
  cold_sensation: 'yes', warmth_relief: 'yes', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no'
}), { pain_nature: ['cold'], pain_response: ['heat_relief', 'activity_change'], bowel: 'normal', body_sense: ['cold_hands_feet'], sleep_issue: [] });
const cold = buildCareContext({ log: { pain: 3, painLocations: ['小腹/盆腔'], menstrual_status: 'on_period', symptomTags: coldTags, fieldStatus: status }, record_date: '2026-09-01', phase: { key: 'period', cycleDay: 2 } });
assert.equal(cold.context.stress_level, undefined, '不得创建与知识库冲突的 stress_level 字段');
assert.equal(cold.context.pain_response.activity_changed, true, '活动后变化只能保存为中性“发生变化”');
assert.equal(cold.context.pain_response.activity_improved, undefined);
assert.equal(cold.context.pain_response.activity_worsened, undefined);
assert.equal(cold.context.pain_quality.cold, true);
assert.equal(cold.context.pain_response.warmth_relief, true);
assert.ok(cold.current_discomforts.some((item) => item.metric === 'cold_hands_feet'));

const coldResult = generateRecommendations({ today_record: { pain: 3, painLocations: ['小腹/盆腔'], menstrual_status: 'on_period', symptomTags: coldTags, fieldStatus: status }, record_date: '2026-09-01', intervention_library: library, phase: { key: 'period', cycleDay: 2 } });
assert.equal(coldResult.status, 'RECOMMENDATIONS');
assert.ok(coldResult.recommendations.some((item) => item.why_matched.some((reason) => reason.field === 'pain_quality.cold')));

const digestiveTags = writeDailyDetails(writeTcmObservations([], {
  cold_sensation: 'no', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'yes', poor_appetite: 'yes', body_heaviness: 'yes'
}), { pain_nature: [], pain_response: [], bowel: 'sticky', body_sense: ['edema', 'head_heavy'], sleep_issue: [] });
const digestive = buildCareContext({ log: { symptomTags: digestiveTags, fieldStatus: {} }, record_date: '2026-09-01' });
const fullScore = evaluateIntervention(byId('TCM_TEA_011'), digestive.context).score;
const singleScore = evaluateIntervention(byId('TCM_TEA_011'), { bloating: true, safety_event: { active: false }, contraindication: {}, medication: {} }).score;
assert.ok(fullScore > singleScore, '同组明确记录应通过现有加权评分获得更高排序');

const sleepTags = writeDailyDetails([], { pain_nature: [], pain_response: [], bowel: 'normal', body_sense: [], sleep_issue: ['waking', 'early_waking'] });
const sleep = buildCareContext({ log: { symptomTags: sleepTags, fieldStatus: {} }, record_date: '2026-09-01' });
assert.equal(sleep.context.sleep_fragmentation, true);
assert.equal(sleep.context.early_waking, true);

const legacy = buildCareContext({ log: { symptomTags: ['tcm:bloating_level:4', 'tcm:appetite_level:1'], fieldStatus: {} }, record_date: '2026-09-01' });
assert.equal(legacy.context.bloating, true);
assert.equal(legacy.context.appetite_low, true);

const bowelEvent = { event_id: 'event:bowel', event_type: 'persistence', metric: 'bowel', value: false, sample_size: 3, confidence_level: 'low', supporting_data: { consecutive_days: 3 } };
const bowelTags = writeDailyDetails([], { pain_nature: [], pain_response: [], bowel: 'not_passed', body_sense: [], sleep_issue: [] });
const bowelResult = generateRecommendations({ today_record: { bowelMovement: false, symptomTags: bowelTags, fieldStatus: { bowelMovement: 'reported' } }, record_date: '2026-09-01', health_events: [bowelEvent], intervention_library: library, phase: { key: 'pms', cycleDay: 24 } });
assert.equal(bowelResult.status, 'RECOMMENDATIONS', '连续未排便事件必须与知识库 canonical 字段正确衔接');
assert.ok(bowelResult.recommendations.some((item) => item.intervention_id === 'TCM_ACU_018'));

const activity = buildCareContext({ log: { activity: 1, fieldStatus: { activity: 'reported' } }, record_date: '2026-09-01' });
assert.ok(activity.current_discomforts.some((item) => item.metric === 'activity_level'));
const anger = buildCareContext({ log: { primaryEmotion: '生气', fieldStatus: { primaryEmotion: 'reported' } }, record_date: '2026-09-01' });
assert.ok(anger.current_discomforts.some((item) => item.metric === 'irritability'));
assert.equal(anger.evidence.irritability[0].source, 'primaryEmotion');
assert.equal(anger.context.irritability, 1, '知识库数值条件不得接收布尔类型');
const angerResult = generateRecommendations({ today_record: { primaryEmotion: '生气', fieldStatus: { primaryEmotion: 'reported' } }, record_date: '2026-09-01', intervention_library: library, phase: { key: 'pms', cycleDay: 24 } });
assert.equal(angerResult.status, 'RECOMMENDATIONS');
assert.ok(angerResult.recommendations.every((item) => item.why_matched.some((reason) => reason.field === 'irritability')));
const draining = buildCareContext({ log: { socialEffect: 'draining', fieldStatus: { socialEffect: 'reported' } }, record_date: '2026-09-01' });
assert.ok(draining.current_discomforts.some((item) => item.metric === 'social_aftereffect'));
const menstrual = buildCareContext({ log: { menstrual_status: 'on_period', flow_level: 'heavy', clot_level: 'medium', fieldStatus: { menstrual_status: 'reported', flow_level: 'reported', clot_level: 'reported' } }, record_date: '2026-09-01' });
assert.ok(menstrual.current_discomforts.some((item) => item.metric === 'flow_level'));
assert.ok(menstrual.current_discomforts.some((item) => item.metric === 'clot_level'));
const identity = buildCareContext({ log: { mood: 2, primaryEmotion: '焦虑', clot_presence: 'no', fieldStatus: { mood: 'reported', primaryEmotion: 'reported', clot_presence: 'reported' } }, record_date: '2026-09-01' });
assert.equal(identity.context.mood, 2, '情绪分数必须进入统一上下文');
assert.equal(identity.context.primary_emotion, '焦虑', '主要情绪必须保留原始中文语义');
assert.equal(identity.context.anxiety, true);
assert.equal(identity.context.clot_presence, false, '明确无血块必须区别于未记录');
assert.equal(identity.evidence.clot_presence[0].value, false);

const persistentPain = evaluateIntervention({
  id: 'TEST_PAIN', status: 'active', availability: 'ready', category: 'test',
  matching: { hard_requirements: [], scoring_features: [{ condition: { field: 'pain.lower_abdomen', operator: '>=', value: 1 }, weight: 2 }], minimum_score: 3, exclusions: [] },
  recommendation_policy: { recommendation_priority: 1, cooldown_hours: 0, max_daily_uses: 1, requires_current_state: false, requires_personal_pattern: false }
}, { pain: { lower_abdomen: 2 }, persistence: { pain_max: { active: true, consecutive_days: 3, event_id: 'pain-event' } }, safety_event: { active: false } });
assert.equal(persistentPain.eligible, true, '持续疼痛事件应复用原有 persistence 加权到具体疼痛部位');
assert.equal(persistentPain.persistence_boost, 1);

console.log('Care context mapping, neutral activity change, weighted scoring and legacy compatibility passed.');
