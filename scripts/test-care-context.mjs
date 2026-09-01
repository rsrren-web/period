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

console.log('Care context mapping, neutral activity change, weighted scoring and legacy compatibility passed.');
