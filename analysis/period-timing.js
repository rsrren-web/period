import { buildCareContext } from './care-context.js';

const DAY = 86_400_000;
const dayDistance = (start, end) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function startsFrom(periods) {
  return [...new Set((periods || [])
    .filter((item) => item?.type === 'period' && item.status !== 'deleted' && /^\d{4}-\d{2}-\d{2}$/.test(item.start || ''))
    .map((item) => item.start))].sort();
}

function predictionFromIntervals(intervals, anchor, lifeStage = 'regular') {
  const valid = intervals.filter((value) => value >= 15 && value <= 60).slice(-12);
  if (!valid.length) return null;
  const weighted = [];
  valid.forEach((value, index) => {
    const weight = index >= valid.length - 3 ? 3 : index >= valid.length - 6 ? 2 : 1;
    for (let count = 0; count < weight; count += 1) weighted.push(value);
  });
  const center = Math.round(median(weighted) || 29);
  let spread = Math.max(2, Math.ceil(median(valid.map((value) => Math.abs(value - center))) * 1.5));
  if (lifeStage === 'menarche') spread = Math.max(5, spread + 2);
  if (lifeStage === 'perimenopause') spread = Math.max(7, spread + 4);
  const expectedStart = addDays(anchor, center);
  return Object.freeze({
    anchorStart: anchor, center, spread, expectedStart,
    windowStart: addDays(expectedStart, -spread), windowEnd: addDays(expectedStart, spread),
    sourceCycles: valid.length, confidence: valid.length >= 6 && spread <= 4 ? 'high' : valid.length >= 3 ? 'moderate' : 'low'
  });
}

function classify(actualStart, prediction) {
  const deltaDays = dayDistance(prediction.expectedStart, actualStart);
  const direction = actualStart < prediction.windowStart ? 'early' : actualStart > prediction.windowEnd ? 'late' : 'within_range';
  const outsideByDays = direction === 'early'
    ? dayDistance(actualStart, prediction.windowStart)
    : direction === 'late' ? dayDistance(prediction.windowEnd, actualStart) : 0;
  return Object.freeze({ ...prediction, actualStart, deltaDays, direction, outsideByDays, withinRange: direction === 'within_range' });
}

function historicalTiming(starts, lifeStage) {
  const observations = [];
  for (let index = 2; index < starts.length; index += 1) {
    const priorIntervals = [];
    for (let cursor = 0; cursor < index - 1; cursor += 1) priorIntervals.push(dayDistance(starts[cursor], starts[cursor + 1]));
    const prediction = predictionFromIntervals(priorIntervals, starts[index - 1], lifeStage);
    if (prediction) observations.push(classify(starts[index], prediction));
  }
  return observations;
}

const SIGNALS = Object.freeze([
  Object.freeze({ id: 'stress_high', label: '压力偏高', test: (context) => Number(context.stress) >= 4 }),
  Object.freeze({ id: 'late_sleep', label: '23点后入睡', test: (context) => context.late_sleep === true }),
  Object.freeze({ id: 'sleep_low', label: '睡眠评分偏低', test: (context) => Number(context.sleep_quality) <= 2 }),
  Object.freeze({ id: 'energy_low', label: '精力偏低', test: (context) => Number(context.energy) <= 2 }),
  Object.freeze({ id: 'anxiety', label: '焦虑', test: (context) => context.anxiety === true }),
  Object.freeze({ id: 'irritability', label: '烦躁或生气', test: (context) => Number(context.irritability) >= 1 }),
  Object.freeze({ id: 'bloating', label: '腹胀', test: (context) => context.bloating === true }),
  Object.freeze({ id: 'cold_sensation', label: '明显怕冷', test: (context) => context.cold_sensation === true })
]);

function timingTrend(observations) {
  const recent = observations.slice(-3), earlyCount = recent.filter((item) => item.direction === 'early').length, lateCount = recent.filter((item) => item.direction === 'late').length;
  let status = 'no_repeated_shift', direction = null, count = 0;
  if (recent.at(-1)?.direction === 'early' && earlyCount >= 2) { status = 'repeated_early'; direction = 'early'; count = earlyCount; }
  if (recent.at(-1)?.direction === 'late' && lateCount >= 2) { status = 'repeated_late'; direction = 'late'; count = lateCount; }
  return Object.freeze({ status, direction, count, sampleSize: recent.length, observations: Object.freeze(recent) });
}

function timingContext(observations, trend, logs) {
  if (!trend.direction) return Object.freeze({ eligible: false, direction: null, cycles: 0, signals: Object.freeze([]) });
  const affected = observations.slice(-6).filter((item) => item.direction === trend.direction);
  const counts = new Map();
  affected.forEach((item) => {
    const seen = new Set(), start = addDays(item.actualStart, -14), end = addDays(item.actualStart, -1);
    Object.entries(logs || {}).forEach(([date, log]) => {
      if (date < start || date > end) return;
      const care = buildCareContext({ log, record_date: date }).context;
      SIGNALS.forEach((signal) => { if (signal.test(care)) seen.add(signal.id); });
    });
    seen.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  });
  const signals = SIGNALS.map((signal) => ({ ...signal, count: counts.get(signal.id) || 0 }))
    .filter((signal) => signal.count >= 2 && signal.count / Math.max(1, affected.length) >= 0.6)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 4)
    .map(({ id, label, count }) => Object.freeze({ id, label, count }));
  return Object.freeze({ eligible: affected.length >= 2, direction: trend.direction, cycles: affected.length, signals: Object.freeze(signals), windowDays: 14 });
}

export function analyzePeriodTiming({ periods = [], logs = {}, as_of, life_stage = 'regular', safety_profile = {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of || '')) throw new TypeError('period timing as_of must use YYYY-MM-DD');
  const starts = startsFrom(periods), observations = historicalTiming(starts, life_stage), latest = observations.at(-1) || null;
  const intervals = starts.slice(1).map((start, index) => dayDistance(starts[index], start));
  const forecast = starts.length ? predictionFromIntervals(intervals, starts.at(-1), life_stage) : null;
  const activePeriod = (periods || []).some((item) => item?.type === 'period' && item.status !== 'deleted' && item.start === starts.at(-1) && (item.status === 'ongoing' || !item.end));
  const current = !forecast || activePeriod ? null : Object.freeze({
    ...forecast,
    status: as_of > forecast.windowEnd ? 'past_window' : as_of >= forecast.windowStart ? 'in_window' : 'before_window',
    daysPastWindow: as_of > forecast.windowEnd ? dayDistance(forecast.windowEnd, as_of) : 0,
    pregnancyCheckRelevant: as_of > forecast.windowEnd && ['unknown', 'possible', 'pregnant'].includes(safety_profile?.pregnancyStatus || 'unknown')
  });
  const trend = timingTrend(observations), tcmContext = timingContext(observations, trend, logs);
  return Object.freeze({ latest, current, trend, tcmContext, observations: Object.freeze(observations) });
}

export const PeriodTiming = Object.freeze({ analyze: analyzePeriodTiming });
