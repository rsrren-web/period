import assert from 'node:assert/strict';
import { detectDeviation, detectPersistence, detectRecentlyFirstRecorded } from '../analysis/health-event-engine.js';
import { analyzeCoOccurrence, analyzeCyclePattern, analyzeTemporalAssociation } from '../analysis/pattern-engine.js';

const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const periods = ['2026-04-01', '2026-05-01', '2026-05-31', '2026-06-30', '2026-07-30'].map(start => ({ type: 'period', start, end: addDays(start, 4), status: 'confirmed' }));
const logs = {};
for (let index = 0; index < 120; index += 1) {
  const date = addDays('2026-04-01', index), cycleDay = index % 30 + 1, highStress = index % 2 === 0, previousHighStress = index > 0 && (index - 1) % 2 === 0;
  logs[date] = {
    energy: cycleDay <= 5 ? 5 : 2,
    stress: highStress ? 5 : 2,
    sleep: index >= 117 ? 1 : previousHighStress ? 1 : 4,
    activity: 3,
    pain: date === '2026-07-29' ? 2 : 0,
    bowelMovement: index >= 116 ? false : true,
    socialIntensity: 3,
    fieldStatus: Object.fromEntries(['energy', 'stress', 'sleep', 'activity', 'pain', 'bowelMovement', 'socialIntensity'].map(field => [field, 'reported']))
  };
}

const deviation = detectDeviation({ logs, metric: 'energy', date: '2026-07-02', baseline: { status: 'available', value: 2, sample_size: 35, quality_level: 'good', date_range: { start: '2026-06-01', end: '2026-07-01' } }, created_at: '2026-07-02T12:00:00Z' });
assert.equal(deviation.event_type, 'deviation');
assert.equal(deviation.baseline_value, 2);
for (const field of ['event_id', 'event_type', 'metric', 'value', 'baseline_value', 'date_range', 'supporting_data', 'sample_size', 'confidence_level', 'created_at']) assert.ok(field in deviation, `event 缺少 ${field}`);
assert.equal(detectDeviation({ logs, metric: 'energy', date: '2026-07-02', baseline: { status: 'available', value: 2, sample_size: 10, quality_level: 'limited' } }), null, 'limited baseline 不得生成 deviation');

const persistentSleep = detectPersistence({ logs, metric: 'sleep_quality', date: '2026-07-29' });
assert.ok(persistentSleep && persistentSleep.event_type === 'persistence');
const persistentBowel = detectPersistence({ logs, metric: 'bowel', date: '2026-07-29' });
assert.ok(persistentBowel && persistentBowel.supporting_data.consecutive_days >= 3);

const firstPain = detectRecentlyFirstRecorded({ logs, metric: 'pain_max', date: '2026-07-29' });
assert.equal(firstPain.event_type, 'recently_first_recorded');
const sparse = { '2026-07-29': logs['2026-07-29'] };
for (let index = 1; index <= 13; index += 1) sparse[addDays('2026-07-29', -index)] = logs[addDays('2026-07-29', -index)];
assert.equal(detectRecentlyFirstRecorded({ logs: sparse, metric: 'pain_max', date: '2026-07-29' }), null, '前30天覆盖不足不得判断首次记录');

const cyclePattern = analyzeCyclePattern({ logs, periods, metric: 'energy', as_of: '2026-07-29', target_window: { start_day: 1, end_day: 5 } });
assert.equal(cyclePattern.status, 'detected');
assert.equal(cyclePattern.cycles_covered, 3);
assert.ok(cyclePattern.effect_size > 0);

const tooFewCycles = analyzeCyclePattern({ logs, periods: periods.slice(0, 2), metric: 'energy', as_of: '2026-05-30' });
assert.equal(tooFewCycles.status, 'insufficient');

const coOccurrence = analyzeCoOccurrence({ logs, periods, metric_a: 'stress', metric_b: 'sleep_quality', start: '2026-04-02', end: '2026-07-29', condition_a: { operator: 'gte', value: 4 }, condition_b: { operator: 'lte', value: 2 } });
assert.equal(coOccurrence.pattern_type, 'co_occurrence');
assert.ok(coOccurrence.sample_size >= 14);
assert.ok('p_b_given_a' in coOccurrence && 'p_b_given_not_a' in coOccurrence);

const temporal = analyzeTemporalAssociation({ logs, periods, metric_a: 'stress', metric_b: 'sleep_quality', start: '2026-04-01', end: '2026-07-29', relation: 'next_day', condition_a: { operator: 'gte', value: 4 }, condition_b: { operator: 'lte', value: 2 } });
assert.equal(temporal.pattern_type, 'temporal_association');
assert.equal(temporal.relation, 'next_day');
assert.ok(temporal.p_b_given_a > temporal.p_b_given_not_a);

for (const pattern of [cyclePattern, coOccurrence, temporal]) for (const field of ['sample_size', 'cycles_covered', 'effect_size', 'confidence_level', 'status']) assert.ok(field in pattern, `pattern 缺少 ${field}`);
assert.equal(JSON.stringify([deviation, persistentSleep, firstPain, cyclePattern, coOccurrence, temporal]).includes('advice'), false);
assert.equal(JSON.stringify([deviation, persistentSleep, firstPain, cyclePattern, coOccurrence, temporal]).includes('diagnosis'), false);

console.log('health event and pattern engine tests passed');
