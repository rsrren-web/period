import assert from 'node:assert/strict';
import { analyzeStateClusters } from '../analysis/state-cluster-engine.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const periods = ['2026-01-01', '2026-01-31', '2026-03-02'].map((start) => ({ type: 'period', start, end: addDays(start, 4), status: 'confirmed' }));
const logs = {};
for (let index = 0; index < 70; index += 1) {
  const date = addDays('2026-01-01', index);
  logs[date] = { mood: 4, energy: 4, stress: 2, sleep: 4, pain: 0, activity: 3, bowelMovement: true, symptomTags: writeTcmObservations([], { cold_sensation: 'no', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no' }) };
}
for (const date of ['2026-01-10', '2026-02-09', '2026-03-05']) Object.assign(logs[date], { energy: 2, stress: 5, sleep: 2 });

const result = analyzeStateClusters({ logs, periods, as_of: '2026-03-11', config: { state_clusters: { min_occurrences: 2, max_size: 4, max_results: 6, lookback_days: 90 } } });
const triple = result.find((item) => item.observation.supportingData.constituentFeatures.length === 3);
assert.ok(triple, '必须识别三个状态同时出现的组合');
assert.deepEqual(triple.observation.supportingData.constituentFeatures.map((item) => item.label).sort(), ['压力较高', '睡眠较差', '精力较低'].sort());
assert.equal(triple.observation.supportingData.occurrenceCount, 3);
assert.equal(triple.observation.cyclesCovered, 3);
assert.equal(triple.confidenceLevel, 'moderate');
assert.equal(triple.observation.supportingData.timeline.length, 28);
assert.equal(result.some((item) => item.observation.supportingData.constituentFeatures.length === 2 && item.observation.supportingData.occurrenceDates.join('|') === triple.observation.supportingData.occurrenceDates.join('|')), false, '完整组合存在时不得重复显示相同日期的子组合');

const short = analyzeStateClusters({ logs: { '2026-03-05': logs['2026-03-05'], '2026-03-06': logs['2026-03-05'] }, periods, as_of: '2026-03-06', config: { state_clusters: { min_occurrences: 2 } } });
assert.equal(short[0].observation.supportingData.maturity, 'new');
assert.equal(short[0].confidenceLevel, 'exploratory', '两次共同出现只能标为刚刚发现');

const missing = analyzeStateClusters({ logs: { '2026-03-05': { energy: 2 }, '2026-03-06': { stress: 5 } }, periods, as_of: '2026-03-06', config: { state_clusters: { min_occurrences: 2 } } });
assert.equal(missing.length, 0, '缺失字段不能被当作状态未出现或组成组合');

console.log('Multi-state cluster detection, maturity and subset suppression tests passed.');
