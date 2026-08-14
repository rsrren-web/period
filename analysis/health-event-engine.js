import { ANALYSIS_CONFIG } from './analysis-config.js';
import { evaluateMetricQuality, metricValue } from './data-quality-engine.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);

function matches(value, condition) {
  if (value === null || !condition) return false;
  if (condition.operator === 'lte') return value <= condition.value;
  if (condition.operator === 'lt') return value < condition.value;
  if (condition.operator === 'gte') return value >= condition.value;
  if (condition.operator === 'gt') return value > condition.value;
  if (condition.operator === 'eq') return value === condition.value;
  throw new TypeError(`未知条件运算符：${condition.operator}`);
}

function conditionFor(metric, condition) {
  const resolved = condition || ANALYSIS_CONFIG.events.states[metric];
  if (!resolved) throw new TypeError(`指标 ${metric} 没有配置事件状态条件`);
  return resolved;
}

function fingerprint(value) {
  let hash = 2166136261;
  for (const character of JSON.stringify(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function confidence(qualityLevel, sampleSize) {
  if (qualityLevel === 'good' && sampleSize >= 30) return 'high';
  if (['usable', 'good'].includes(qualityLevel) && sampleSize >= 14) return 'medium';
  return 'low';
}

function eventObject({ type, metric, value, baselineValue = null, start, end, supportingData, sampleSize, qualityLevel, createdAt }) {
  const identity = { type, metric, value, baselineValue, start, end, supportingData };
  return Object.freeze({
    event_id: `event:${type}:${fingerprint(identity)}`,
    event_type: type,
    metric,
    value,
    baseline_value: baselineValue,
    date_range: { start, end },
    supporting_data: supportingData,
    sample_size: sampleSize,
    confidence_level: confidence(qualityLevel, sampleSize),
    created_at: createdAt
  });
}

export function detectDeviation({ logs = {}, metric, date, baseline, created_at = new Date().toISOString() } = {}) {
  if (!baseline || baseline.status !== 'available' || !['usable', 'good'].includes(baseline.quality_level)) return null;
  const quality = evaluateMetricQuality({ logs, metric, dates: [date], context: 'event_current' });
  if (quality.quality_level === 'insufficient') return null;
  const value = metricValue(logs[date], metric), difference = Number(value) - Number(baseline.value);
  if (!Number.isFinite(difference) || Math.abs(difference) < ANALYSIS_CONFIG.events.deviation_min_absolute_difference) return null;
  return eventObject({
    type: 'deviation', metric, value, baselineValue: baseline.value, start: date, end: date,
    supportingData: { absolute_difference: Math.abs(difference), signed_difference: difference, baseline_date_range: baseline.date_range, data_quality: quality },
    sampleSize: baseline.sample_size, qualityLevel: baseline.quality_level, createdAt: created_at
  });
}

export function detectPersistence({ logs = {}, metric, date, condition, created_at = new Date().toISOString() } = {}) {
  const resolved = conditionFor(metric, condition), dates = [];
  for (let cursor = date; ; cursor = addDays(cursor, -1)) {
    const value = metricValue(logs[cursor], metric);
    if (value === null || !matches(value, resolved)) break;
    dates.unshift(cursor);
  }
  if (dates.length < ANALYSIS_CONFIG.events.persistence_min_days) return null;
  const quality = evaluateMetricQuality({ logs, metric, dates, context: 'event_persistence' });
  if (quality.quality_level === 'insufficient') return null;
  return eventObject({
    type: 'persistence', metric, value: metricValue(logs[date], metric), start: dates[0], end: date,
    supportingData: { condition: resolved, consecutive_days: dates.length, observed_dates: dates, data_quality: quality },
    sampleSize: dates.length, qualityLevel: quality.quality_level, createdAt: created_at
  });
}

export function detectRecentlyFirstRecorded({ logs = {}, metric, date, condition, created_at = new Date().toISOString() } = {}) {
  const resolved = conditionFor(metric, condition), currentQuality = evaluateMetricQuality({ logs, metric, dates: [date], context: 'event_current' });
  const currentValue = metricValue(logs[date], metric);
  if (currentQuality.quality_level === 'insufficient' || !matches(currentValue, resolved)) return null;
  const lookback = ANALYSIS_CONFIG.events.recently_first_recorded_lookback_days;
  const priorDates = Array.from({ length: lookback }, (_, index) => addDays(date, -(lookback - index)));
  const priorQuality = evaluateMetricQuality({ logs, metric, dates: priorDates, context: 'event_recent_30d' });
  if (priorQuality.quality_level === 'insufficient') return null;
  const priorOccurrences = priorDates.filter(priorDate => matches(metricValue(logs[priorDate], metric), resolved));
  if (priorOccurrences.length) return null;
  return eventObject({
    type: 'recently_first_recorded', metric, value: currentValue, start: date, end: date,
    supportingData: { condition: resolved, lookback_date_range: { start: priorDates[0], end: priorDates.at(-1) }, prior_occurrences: 0, data_quality: priorQuality },
    sampleSize: priorQuality.valid_days + 1, qualityLevel: priorQuality.quality_level, createdAt: created_at
  });
}

export const HealthEventEngine = Object.freeze({ detectDeviation, detectPersistence, detectRecentlyFirstRecorded });
