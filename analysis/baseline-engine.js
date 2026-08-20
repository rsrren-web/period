import { ANALYSIS_CONFIG, BASELINE_METRICS } from './analysis-config.js';
import { evaluateMetricQuality, metricValue } from './data-quality-engine.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const datesBetween = (start, end) => { const dates = []; for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date); return dates; };
const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const quantile = (values, q) => { const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null; const position = (sorted.length - 1) * q, lower = Math.floor(position), upper = Math.ceil(position); return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower); };

function completedCycles(periods, asOf) {
  const starts = [...new Set(periods.filter(period => period?.type === 'period' && period.status !== 'deleted' && period.start <= asOf).map(period => period.start))].sort();
  return starts.slice(0, -1).map((start, index) => ({ start, end: addDays(starts[index + 1], -1), next_start: starts[index + 1] })).filter(cycle => cycle.end <= asOf);
}

function unavailable(quality, dateRange, calculatedAt) {
  return { status: 'unavailable', value: null, sample_size: quality.valid_days, valid_days: quality.valid_days, date_range: dateRange, quality_level: quality.quality_level, calculated_at: calculatedAt, reasons: quality.reasons };
}

function calculateBaseline({ logs, metric, dates, context, completeCycles, calculatedAt }) {
  const ordered = [...new Set(dates)].sort(), dateRange = { start: ordered[0] || null, end: ordered.at(-1) || null };
  const quality = evaluateMetricQuality({ logs, metric, dates: ordered, context, complete_cycles: completeCycles });
  if (quality.quality_level === 'insufficient') return unavailable(quality, dateRange, calculatedAt);
  const values = ordered.map(date => metricValue(logs[date], metric)).filter(value => value !== null).map(Number);
  const value = median(values), deviations = values.map((item) => Math.abs(item - value));
  return { status: 'available', value, sample_size: values.length, valid_days: quality.valid_days, date_range: dateRange, quality_level: quality.quality_level, calculated_at: calculatedAt, reasons: quality.reasons, distribution: { median: value, mad: median(deviations), q1: quantile(values, 0.25), q3: quantile(values, 0.75), min: Math.min(...values), max: Math.max(...values) } };
}

export function calculateMetricBaselines({ logs = {}, periods = [], metric, as_of, calculated_at = new Date().toISOString(), phaseForDate, current_phase } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of || '')) throw new TypeError('as_of 必须为 YYYY-MM-DD');
  const cycles = completedCycles(periods, as_of), recentCount = ANALYSIS_CONFIG.contexts.recent_cycles.cycle_count, recent = cycles.slice(-recentCount);
  const recentDates = recent.flatMap(cycle => datesBetween(cycle.start, cycle.end));
  const phaseDates = typeof phaseForDate === 'function' && current_phase ? recentDates.filter(date => phaseForDate(date) === current_phase) : [];
  return {
    rolling_30d: calculateBaseline({ logs, metric, dates: datesBetween(addDays(as_of, -29), as_of), context: 'rolling_30d', calculatedAt: calculated_at }),
    rolling_90d: calculateBaseline({ logs, metric, dates: datesBetween(addDays(as_of, -89), as_of), context: 'rolling_90d', calculatedAt: calculated_at }),
    recent_cycles_baseline: calculateBaseline({ logs, metric, dates: recentDates, context: 'recent_cycles', completeCycles: recent.length, calculatedAt: calculated_at }),
    current_cycle_phase_baseline: calculateBaseline({ logs, metric, dates: phaseDates, context: 'cycle_phase', completeCycles: recent.length, calculatedAt: calculated_at })
  };
}

function inputFingerprint(logs, periods) {
  const logStamp = Object.entries(logs).sort(([a], [b]) => a.localeCompare(b)).map(([date, log]) => `${date}:${log?.updatedAt || ''}`).join(',');
  const periodStamp = periods.filter(period => period?.type === 'period' && period.status !== 'deleted').map(period => `${period.start}:${period.end}:${period.updatedAt || ''}`).sort().join(',');
  let hash = 2166136261;
  for (const character of `${logStamp}|${periodStamp}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createBaselineSnapshot({ logs = {}, periods = [], as_of, calculated_at = new Date().toISOString(), phaseForDate, current_phase } = {}) {
  const baselines = Object.fromEntries(BASELINE_METRICS.map(metric => [metric, calculateMetricBaselines({ logs, periods, metric, as_of, calculated_at, phaseForDate, current_phase })]));
  return Object.freeze({ id: `baseline:${as_of}:${inputFingerprint(logs, periods)}`, schema_version: 1, as_of, current_phase: current_phase || null, calculated_at, baselines });
}

export const BaselineEngine = Object.freeze({ calculateMetricBaselines, createBaselineSnapshot });
