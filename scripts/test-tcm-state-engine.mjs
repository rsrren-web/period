import assert from 'node:assert/strict';
import { analyzeTcmStates, TCM_STATE_DEFINITIONS } from '../analysis/tcm-state-engine.js';
import { writeDailyDetails } from '../daily-detail-model.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const asOf = '2026-09-14';
const tags = ({ cold = false, nightSweat = false, sleepIssue = [] } = {}) => writeDailyDetails(writeTcmObservations([], {
  cold_sensation: cold ? 'yes' : 'no', warmth_relief: cold ? 'yes' : 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no'
}), { pain_nature: cold ? ['cold'] : [], pain_response: cold ? ['heat_relief'] : [], bowel: 'normal', body_sense: [...(cold ? ['cold_hands_feet'] : []), ...(nightSweat ? ['night_sweat'] : [])], sleep_issue: sleepIssue });

assert.equal(TCM_STATE_DEFINITIONS.length, 7, '必须提供7类近期中医状态');
const empty = analyzeTcmStates({ logs: {}, as_of: asOf });
assert.equal(empty.length, 7);
assert.ok(empty.every((state) => state.confidence === 'insufficient' && state.insufficientDataReason), '无记录时每个状态必须提供收集原因');

const coldLogs = {};
for (const offset of [-2, -1, 0]) coldLogs[addDays(asOf, offset)] = { symptomTags: tags({ cold: true }) };
const coldStates = analyzeTcmStates({ logs: coldLogs, as_of: asOf });
const cold = coldStates.find((state) => state.id === 'cold_state');
assert.equal(cold.active, true);
assert.equal(cold.supportingDays, 3);
assert.ok(cold.supportingEvidence.some((item) => item.label === '冷痛'));
assert.equal(cold.trend, 'insufficient', '前7天没有可比记录时不得伪造上升趋势');

const contradictedLogs = structuredClone(coldLogs);
for (const date of Object.keys(contradictedLogs)) contradictedLogs[date].symptomTags = tags({ cold: true, nightSweat: true });
const contradicted = analyzeTcmStates({ logs: contradictedLogs, as_of: asOf }).find((state) => state.id === 'cold_state');
assert.ok(contradicted.score < cold.score, '反证必须真实降低状态分数');
assert.ok(contradicted.contradictingEvidence.some((item) => item.label === '夜间出汗'));

const sleepLogs = {
  [addDays(asOf, -1)]: { symptomTags: tags({ sleepIssue: ['sleep_onset'] }) },
  [asOf]: { symptomTags: tags({ sleepIssue: ['sleep_onset'] }) }
};
const sleep = analyzeTcmStates({ logs: sleepLogs, as_of: asOf }).find((state) => state.id === 'sleep_recovery_state');
assert.ok(sleep.supportingEvidence.some((item) => item.label === '难入睡'));
assert.ok(!sleep.supportingEvidence.some((item) => item.label === '夜间易醒'), '难入睡和夜间易醒必须保持不同 feature');

const hardBowelTags = writeDailyDetails([], { pain_nature: [], pain_response: [], bowel: 'hard', body_sense: [], sleep_issue: [] });
const drynessOnly = analyzeTcmStates({ logs: Object.fromEntries([-2, -1, 0].map((offset) => [addDays(asOf, offset), { symptomTags: hardBowelTags }])), as_of: asOf }).find((state) => state.id === 'heat_dryness_state');
assert.equal(drynessOnly.active, false, '只有干硬便时不得单独输出燥热相关状态');

const stressLogs = {};
for (const offset of [-9, -8]) stressLogs[addDays(asOf, offset)] = { stress: 5, fieldStatus: { stress: 'reported' } };
for (const offset of [-2, -1, 0]) stressLogs[addDays(asOf, offset)] = { stress: 5, primaryEmotion: '焦虑', fieldStatus: { stress: 'reported', primaryEmotion: 'reported' } };
const stress = analyzeTcmStates({ logs: stressLogs, as_of: asOf }).find((state) => state.id === 'stress_distension_state');
assert.equal(stress.active, true);
assert.equal(stress.trend, 'rising');
assert.ok(stress.supportingEvidence.some((item) => item.label === '焦虑'));

console.log('Recent TCM state weighting, contradiction, trend and missing-data tests passed.');
