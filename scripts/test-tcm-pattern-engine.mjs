import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeTcmClusters } from '../analysis/tcm-cluster-engine.js';
import { writeDailyDetails } from '../daily-detail-model.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const rules = JSON.parse(fs.readFileSync(new URL('../knowledge/tcm_cluster_rules.json', import.meta.url), 'utf8'));
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const starts = ['2026-01-01', '2026-01-31', '2026-03-02'];
const periods = starts.map((start) => ({ type: 'period', start, end: addDays(start, 4), status: 'confirmed' }));
const status = (...fields) => Object.fromEntries(fields.map((field) => [field, 'reported']));
const details = (base, value) => writeDailyDetails(base, { pain_nature: [], pain_response: [], bowel: null, body_sense: null, sleep_issue: null, ...value });
const tcm = (value) => writeTcmObservations([], { cold_sensation: null, warmth_relief: null, nausea: null, diarrhea: null, bloating: null, poor_appetite: null, body_heaviness: null, ...value });

function analyze(logs) { return analyzeTcmClusters({ logs, periods, as_of: '2026-03-02', rules_config: rules }); }
function find(result, id) { return result.find((item) => item.cluster_id === id); }

const coldLogs = {};
for (const date of ['2026-01-02', '2026-02-01']) {
  coldLogs[date] = {
    pain: 4, painLocations: ['小腹/盆腔'], menstrual_status: 'on_period',
    symptomTags: details(tcm({ cold_sensation: 'yes', warmth_relief: 'yes' }), { pain_nature: ['cold'], pain_response: ['heat_relief'], body_sense: ['cold_hands_feet'] }),
    fieldStatus: status('pain', 'painLocations', 'menstrual_status', 'symptomTags')
  };
}
const cold = find(analyze(coldLogs), 'cold_menstrual_pattern');
assert.equal(cold.status, 'detected', '寒冷、冷痛和热敷缓解跨两个经期重复时必须形成模式');
assert.equal(cold.phase_specificity.type, 'menstrual');
assert.ok(cold.constituent_features.some((item) => item.field === 'pain_quality.cold'));

const contradictedLogs = structuredClone(coldLogs);
for (const log of Object.values(contradictedLogs)) log.symptomTags = details(log.symptomTags, { pain_nature: ['cold'], pain_response: ['heat_relief'], body_sense: ['cold_hands_feet', 'night_sweat'] });
const contradicted = find(analyze(contradictedLogs), 'cold_menstrual_pattern');
assert.ok(contradicted.evidence[0].score < cold.evidence[0].score, '反向记录必须真实降低模式分数');
assert.ok(contradicted.contradicting_features.some((item) => item.field === 'night_sweat'));

const stasisLogs = {};
for (const date of ['2026-01-03', '2026-02-02']) {
  stasisLogs[date] = {
    pain: 4, painLocations: ['小腹/盆腔'], menstrual_status: 'on_period', blood_color: 'dark_red', clot_level: 'large',
    symptomTags: details(tcm({ cold_sensation: 'no' }), { pain_nature: ['stabbing'] }),
    fieldStatus: status('pain', 'painLocations', 'menstrual_status', 'blood_color', 'clot_level', 'symptomTags')
  };
}
const stasis = find(analyze(stasisLogs), 'blood_stasis_like_menstrual_pattern');
assert.equal(stasis.status, 'detected', '刺痛、暗色经血和血块不应依赖寒象才能形成模式');
assert.equal(find(analyze(stasisLogs), 'cold_menstrual_pattern').status, 'not_detected');

const digestiveLogs = {};
for (const date of ['2026-01-27', '2026-02-26']) {
  digestiveLogs[date] = {
    activity: 2,
    symptomTags: details(tcm({ bloating: 'yes', poor_appetite: 'yes', body_heaviness: 'yes' }), { bowel: 'sticky', body_sense: ['edema', 'head_heavy'] }),
    fieldStatus: status('activity', 'symptomTags')
  };
}
const digestiveResult = analyze(digestiveLogs);
assert.equal(find(digestiveResult, 'digestive_heaviness_pattern').status, 'detected');
assert.equal(find(digestiveResult, 'fluid_retention_pattern').status, 'detected');
assert.equal(find(digestiveResult, 'digestive_heaviness_pattern').phase_specificity.type, 'pms', '经前集中出现时必须标记周期特异性');

const stressLogs = {};
for (const date of ['2026-01-27', '2026-02-26']) {
  stressLogs[date] = {
    stress: 5, primaryEmotion: '生气', pain: 3, painLocations: ['乳房/胸部'],
    symptomTags: details(tcm({ bloating: 'yes' }), { pain_nature: ['distending'] }),
    fieldStatus: status('stress', 'primaryEmotion', 'pain', 'painLocations', 'symptomTags')
  };
}
assert.equal(find(analyze(stressLogs), 'stress_distension_pattern').status, 'detected');

const oneCycleOnly = analyze({ '2026-01-27': digestiveLogs['2026-01-27'] });
assert.notEqual(find(oneCycleOnly, 'digestive_heaviness_pattern').status, 'detected', '单个周期偶发不得输出跨周期模式');

for (const rule of rules.rules) {
  assert.ok(rule.supporting_conditions.length >= 2, `${rule.id} 必须有多个支持条件`);
  assert.ok(rule.contradicting_conditions.length >= 1, `${rule.id} 必须有反向条件`);
  assert.ok(rule.minimum_score > 0 && rule.minimum_constituents >= 2, `${rule.id} 必须声明阈值与最少组成项`);
  assert.ok(rule.explanation, `${rule.id} 必须提供用户可理解的解释`);
}

console.log('TCM pattern weighting, contradictions, cross-cycle support and phase specificity tests passed.');
