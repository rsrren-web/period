import assert from 'node:assert/strict';
import { evaluateComparisonQuality, evaluateMetricQuality, metricCompletionReport, metricValue } from '../analysis/data-quality-engine.js';
import { createBaselineSnapshot } from '../analysis/baseline-engine.js';
import { appendBaselineSnapshot, readBaselineSnapshots } from '../analysis/baseline-snapshot-store.js';
import { writeDailyDetails } from '../daily-detail-model.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const logs = {};
for (let index = 0; index < 30; index += 1) {
  const date = addDays('2026-07-15', index);
  logs[date] = {
    energy: index < 14 ? (index % 5) + 1 : null,
    stress: index < 24 ? 2 : null,
    sleep: index < 18 ? 4 : null,
    bowelMovement: index < 20 ? index % 2 === 0 : null,
    pain: index < 15 ? 0 : null,
    activity: index < 12 ? 3 : null,
    socialIntensity: index < 16 ? 2 : null,
    fieldStatus: {
      energy: index < 14 ? 'reported' : 'not_recorded', stress: index < 24 ? 'reported' : 'not_recorded',
      sleep: index < 18 ? 'reported' : 'not_recorded', bowelMovement: index < 20 ? 'reported' : 'not_recorded',
      pain: index < 15 ? 'reported' : 'not_recorded', activity: index < 12 ? 'reported' : 'not_recorded',
      socialIntensity: index < 16 ? 'reported' : 'not_recorded'
    },
    updatedAt: `2026-08-13T00:00:${String(index).padStart(2, '0')}Z`
  };
}

assert.equal(metricValue({ bowelMovement: false, fieldStatus: { bowelMovement: 'reported' } }, 'bowel'), false, '明确“没有排便”必须是有效记录');
assert.equal(metricValue({ bowelMovement: null, fieldStatus: { bowelMovement: 'not_recorded' } }, 'bowel'), null, '未记录不得解释为 false');
assert.equal(metricValue({ pain: 0, fieldStatus: { pain: 'reported' } }, 'pain'), 0, '明确疼痛 0 分必须是有效记录');
const noStructuredSymptoms = writeDailyDetails(writeTcmObservations([], { cold_sensation: 'no', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no' }), { pain_nature: [], pain_response: [], bowel: 'normal', body_sense: [], sleep_issue: [] });
assert.equal(metricValue({ symptomTags: noStructuredSymptoms }, 'bloating'), false, '明确无腹胀必须是有效的 false');
assert.equal(metricValue({ symptomTags: noStructuredSymptoms }, 'sleep_fragmentation'), false, '明确无易醒必须是有效的 false');
assert.equal(metricValue({ symptomTags: [] }, 'bloating'), null, '未记录体感不得解释为 false');
assert.equal(metricValue({ symptomTags: [] }, 'sleep_fragmentation'), null, '未记录睡眠表现不得解释为 false');

const report = metricCompletionReport({ logs, start: '2026-07-15', end: '2026-08-13' });
assert.equal(report.energy_completion_rate.valid_days, 14);
assert.equal(report.sleep_completion_rate.valid_days, 18);
assert.equal(report.bowel_completion_rate.valid_days, 20);
assert.notEqual(report.energy_completion_rate.completion_rate, report.bowel_completion_rate.completion_rate, '必须逐指标计算完整度');

assert.equal(evaluateMetricQuality({ logs, metric: 'activity', start: '2026-07-15', end: '2026-08-13' }).quality_level, 'insufficient');
assert.equal(evaluateMetricQuality({ logs, metric: 'energy', start: '2026-07-15', end: '2026-08-13' }).quality_level, 'limited');
assert.equal(evaluateMetricQuality({ logs, metric: 'sleep', start: '2026-07-15', end: '2026-08-13' }).quality_level, 'usable');
assert.equal(evaluateMetricQuality({ logs, metric: 'stress', start: '2026-07-15', end: '2026-08-13' }).quality_level, 'good');

const comparison = evaluateComparisonQuality({ logs, metric: 'energy', first: { start: '2026-07-15', end: '2026-07-21' }, second: { start: '2026-08-07', end: '2026-08-13' } });
assert.equal(comparison.quality_level, 'insufficient', '任一时间段不达门槛必须阻止比较');

const periods = ['2026-04-17', '2026-05-17', '2026-06-16', '2026-07-16', '2026-08-15'].map(start => ({ type: 'period', start, end: addDays(start, 4) }));
const snapshot = createBaselineSnapshot({ logs, periods, as_of: '2026-08-13', current_phase: 'follicular', phaseForDate: () => 'follicular', calculated_at: '2026-08-13T12:00:00Z' });
assert.equal(snapshot.baselines.activity_level.rolling_30d.status, 'unavailable');
assert.equal(snapshot.baselines.energy.rolling_30d.status, 'available');
for (const metric of Object.values(snapshot.baselines)) for (const baseline of Object.values(metric)) {
  for (const key of ['value', 'sample_size', 'valid_days', 'date_range', 'quality_level', 'calculated_at']) assert.ok(key in baseline, `baseline 缺少 ${key}`);
}
assert.equal('deviation' in snapshot, false);
assert.equal('advice' in snapshot, false);

const memory = new Map();
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
assert.equal(appendBaselineSnapshot(snapshot, storage).added, true);
assert.equal(appendBaselineSnapshot(snapshot, storage).added, false, '同一快照不得覆盖或重复追加');
const changed = { ...snapshot, id: `${snapshot.id}:changed`, calculated_at: '2026-08-13T13:00:00Z' };
assert.equal(appendBaselineSnapshot(changed, storage).added, true);
assert.equal(readBaselineSnapshots(storage).length, 2, '新版本必须追加保留');

console.log('analysis engine tests passed');
