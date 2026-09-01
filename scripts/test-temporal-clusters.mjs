import assert from 'node:assert/strict';
import { analyzeTemporalClusters } from '../analysis/temporal-cluster-engine.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const periods = ['2026-01-01', '2026-01-31', '2026-03-02', '2026-04-01'].map((start) => ({ type: 'period', start, end: addDays(start, 4), status: 'confirmed' }));
const symptomTags = writeTcmObservations([], { cold_sensation: 'no', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no' });
const logs = {};
for (let index = 0; index < 80; index += 1) logs[addDays('2026-01-01', index)] = { mood: 4, energy: 4, stress: 2, sleep: 4, pain: 0, activity: 3, bowelMovement: true, bedtime: 'before_23', symptomTags };
for (const date of ['2026-01-10', '2026-02-10', '2026-03-10']) {
  Object.assign(logs[date], { energy: 2, stress: 5 });
  Object.assign(logs[addDays(date, 1)], { sleep: 2, pain: 3 });
}

const config = { pattern: { binary_effect_min: 0.15 }, temporal_clusters: { min_occurrences: 2, min_eligible_pairs: 8, max_results: 4 } };
const result = analyzeTemporalClusters({ logs, periods, as_of: '2026-03-21', config });
const multi = result.find((item) => item.observation.supportingData.todayFeatures.length === 2 && item.observation.supportingData.tomorrowFeatures.length === 2);
assert.ok(multi, '必须识别多个今天状态到多个次日状态的关系');
assert.deepEqual(multi.observation.supportingData.todayFeatures.map((item) => item.label).sort(), ['压力较高', '精力较低'].sort());
assert.deepEqual(multi.observation.supportingData.tomorrowFeatures.map((item) => item.label).sort(), ['身体疼痛', '睡眠较差'].sort());
assert.equal(multi.observation.supportingData.occurrenceCount, 3);
assert.equal(multi.confidenceLevel, 'moderate');
assert.ok(multi.observation.effectSizeRaw > 0, '只能展示高于个人基线的正向先后关系');
assert.equal(multi.observation.supportingData.timeline.length, 28);
assert.equal(result.some((item) => item.observation.supportingData.occurrenceDates.join('|') === multi.observation.supportingData.occurrenceDates.join('|') && item.observation.supportingData.todayFeatures.length + item.observation.supportingData.tomorrowFeatures.length < 4), false, '完整关系存在时不得重复显示相同日期的子关系');

const shortLogs = { '2026-03-10': logs['2026-03-10'], '2026-03-11': logs['2026-03-11'], '2026-03-12': logs['2026-03-12'], '2026-03-13': logs['2026-03-13'], '2026-03-15': logs['2026-03-10'], '2026-03-16': logs['2026-03-11'] };
const short = analyzeTemporalClusters({ logs: shortLogs, periods, as_of: '2026-03-17', config: { pattern: { binary_effect_min: 0.15 }, temporal_clusters: { min_occurrences: 2, min_eligible_pairs: 2 } } });
assert.equal(short[0].observation.supportingData.maturity, 'new');
assert.equal(short[0].confidenceLevel, 'exploratory', '重复两次只能标为刚刚发现');

const incomplete = analyzeTemporalClusters({ logs: { '2026-03-10': { energy: 2 }, '2026-03-11': { sleep: 2 }, '2026-03-15': { energy: 2 }, '2026-03-16': { sleep: 2 } }, periods, as_of: '2026-03-17', config: { temporal_clusters: { min_occurrences: 2, min_eligible_pairs: 2 } } });
assert.equal(incomplete.length, 0, '缺失字段不能被当作未出现并形成前后日关系');

console.log('Multi-state next-day cluster, baseline direction and maturity tests passed.');
