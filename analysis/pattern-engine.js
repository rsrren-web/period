import { ANALYSIS_CONFIG } from './analysis-config.js';
import { evaluateMetricQuality, metricValue } from './data-quality-engine.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const dayDistance = (start, end) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
const datesBetween = (start, end) => { const result = []; for (let date = start; date <= end; date = addDays(date, 1)) result.push(date); return result; };
const mean = values => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
const round = value => value === null ? null : Math.round(value * 1000) / 1000;

function fingerprint(value) {
  let hash = 2166136261;
  for (const character of JSON.stringify(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const patternId = (patternType, identity) => `pattern:${patternType}:${fingerprint(identity)}`;

function matches(value, condition) {
  if (value === null) return false;
  if (!condition) return Boolean(value);
  if (condition.operator === 'lte') return value <= condition.value;
  if (condition.operator === 'lt') return value < condition.value;
  if (condition.operator === 'gte') return value >= condition.value;
  if (condition.operator === 'gt') return value > condition.value;
  if (condition.operator === 'eq') return value === condition.value;
  throw new TypeError(`未知条件运算符：${condition.operator}`);
}

function completedCycles(periods, asOf) {
  const starts = [...new Set(periods.filter(period => period?.type === 'period' && period.status !== 'deleted' && period.start <= asOf).map(period => period.start))].sort();
  return starts.slice(0, -1).map((start, index) => ({ start, end: addDays(starts[index + 1], -1), next_start: starts[index + 1] })).filter(cycle => cycle.end <= asOf);
}

function cyclesCovered(dates, periods, asOf) {
  const cycles = completedCycles(periods, asOf);
  return cycles.filter(cycle => dates.some(date => date >= cycle.start && date <= cycle.end)).length;
}

function confidence(qualities, sampleSize, cycles) {
  if (qualities.every(level => level === 'good') && sampleSize >= 30 && cycles >= 3) return 'high';
  if (qualities.every(level => ['usable', 'good'].includes(level)) && sampleSize >= 14 && cycles >= 2) return 'medium';
  return 'low';
}

function insufficient(patternType, metric, qualities = [], cycles = 0, identity = {}) {
  return Object.freeze({ pattern_id: patternId(patternType, { metric, ...identity }), pattern_type: patternType, metric, sample_size: 0, cycles_covered: cycles, effect_size: null, confidence_level: 'insufficient', status: 'insufficient', data_quality: qualities });
}

function detected(effectSize) { return Math.abs(effectSize) >= ANALYSIS_CONFIG.patterns.detected_effect_size ? 'detected' : 'not_detected'; }

export function analyzeCyclePattern({ logs = {}, periods = [], metric, as_of, target_window = { start_day: 1, end_day: 5 }, mode = 'mean', condition } = {}) {
  const cycles = completedCycles(periods, as_of), minimum = ANALYSIS_CONFIG.patterns.cycle_pattern_min_complete_cycles;
  if (cycles.length < minimum) return insufficient('cycle_pattern', metric, [], cycles.length, { mode, target_window, condition });
  const targetDates = [], comparisonDates = [];
  cycles.forEach(cycle => datesBetween(cycle.start, cycle.end).forEach(date => {
    const cycleDay = dayDistance(cycle.start, date) + 1;
    (cycleDay >= target_window.start_day && cycleDay <= target_window.end_day ? targetDates : comparisonDates).push(date);
  }));
  const targetQuality = evaluateMetricQuality({ logs, metric, dates: targetDates, context: 'pattern_window', complete_cycles: cycles.length });
  const comparisonQuality = evaluateMetricQuality({ logs, metric, dates: comparisonDates, context: 'pattern_window', complete_cycles: cycles.length });
  if ([targetQuality, comparisonQuality].some(item => item.quality_level === 'insufficient')) return insufficient('cycle_pattern', metric, [targetQuality, comparisonQuality], cycles.length, { mode, target_window, condition });
  const targetValues = targetDates.map(date => metricValue(logs[date], metric)).filter(value => value !== null), comparisonValues = comparisonDates.map(date => metricValue(logs[date], metric)).filter(value => value !== null);
  const targetValue = mode === 'occurrence' ? targetValues.filter(value => matches(value, condition)).length / targetValues.length : mean(targetValues);
  const comparisonValue = mode === 'occurrence' ? comparisonValues.filter(value => matches(value, condition)).length / comparisonValues.length : mean(comparisonValues);
  const effectSize = targetValue - comparisonValue, sampleSize = targetValues.length + comparisonValues.length;
  return Object.freeze({ pattern_id: patternId('cycle_pattern', { metric, mode, target_window, condition }), pattern_type: 'cycle_pattern', metric, mode, target_window, target_value: round(targetValue), comparison_value: round(comparisonValue), sample_size: sampleSize, cycles_covered: cycles.length, effect_size: round(effectSize), confidence_level: confidence([targetQuality.quality_level, comparisonQuality.quality_level], sampleSize, cycles.length), status: detected(effectSize), data_quality: { target: targetQuality, comparison: comparisonQuality } });
}

function associationDates(start, end) { return datesBetween(start, end); }
function probability(values) { return values.length ? values.filter(Boolean).length / values.length : null; }

export function analyzeCoOccurrence({ logs = {}, periods = [], metric_a, metric_b, start, end, condition_a, condition_b } = {}) {
  const dates = associationDates(start, end), qualityA = evaluateMetricQuality({ logs, metric: metric_a, dates, context: 'association' }), qualityB = evaluateMetricQuality({ logs, metric: metric_b, dates, context: 'association' });
  if ([qualityA, qualityB].some(item => item.quality_level === 'insufficient')) return insufficient('co_occurrence', `${metric_a}:${metric_b}`, [qualityA, qualityB], cyclesCovered(dates, periods, end), { metric_a, metric_b, condition_a, condition_b });
  const pairs = dates.map(date => [metricValue(logs[date], metric_a), metricValue(logs[date], metric_b), date]).filter(([a, b]) => a !== null && b !== null);
  if (pairs.length < ANALYSIS_CONFIG.patterns.association_min_pairs) return insufficient('co_occurrence', `${metric_a}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, condition_a, condition_b });
  const withA = pairs.filter(([a]) => matches(a, condition_a)), withoutA = pairs.filter(([a]) => !matches(a, condition_a));
  if (!withA.length || !withoutA.length) return insufficient('co_occurrence', `${metric_a}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, condition_a, condition_b });
  const pGivenA = probability(withA.map(([, b]) => matches(b, condition_b))), pGivenNotA = probability(withoutA.map(([, b]) => matches(b, condition_b))), effectSize = pGivenA - pGivenNotA, cycles = cyclesCovered(pairs.map(pair => pair[2]), periods, end);
  return Object.freeze({ pattern_id: patternId('co_occurrence', { metric_a, metric_b, condition_a, condition_b }), pattern_type: 'co_occurrence', metric: `${metric_a}:${metric_b}`, metric_a, metric_b, p_b_given_a: round(pGivenA), p_b_given_not_a: round(pGivenNotA), involved_days: { with_a: withA.length, without_a: withoutA.length }, sample_size: pairs.length, cycles_covered: cycles, effect_size: round(effectSize), confidence_level: confidence([qualityA.quality_level, qualityB.quality_level], pairs.length, cycles), status: detected(effectSize), data_quality: { metric_a: qualityA, metric_b: qualityB } });
}

export function analyzeTemporalAssociation({ logs = {}, periods = [], metric_a, metric_b, start, end, relation = 'same_day', condition_a, condition_b } = {}) {
  const offsets = { same_day: 0, next_day: 1, previous_day: -1 };
  if (!(relation in offsets)) throw new TypeError(`不支持的时间关系：${relation}`);
  const anchorDates = associationDates(start, end).filter(date => addDays(date, offsets[relation]) >= start && addDays(date, offsets[relation]) <= end), targetDates = anchorDates.map(date => addDays(date, offsets[relation]));
  const qualityA = evaluateMetricQuality({ logs, metric: metric_a, dates: anchorDates, context: 'association' }), qualityB = evaluateMetricQuality({ logs, metric: metric_b, dates: targetDates, context: 'association' });
  if ([qualityA, qualityB].some(item => item.quality_level === 'insufficient')) return insufficient('temporal_association', `${metric_a}:${relation}:${metric_b}`, [qualityA, qualityB], cyclesCovered(anchorDates, periods, end), { metric_a, metric_b, relation, condition_a, condition_b });
  const pairs = anchorDates.map((date, index) => [metricValue(logs[date], metric_a), metricValue(logs[targetDates[index]], metric_b), date]).filter(([a, b]) => a !== null && b !== null);
  if (pairs.length < ANALYSIS_CONFIG.patterns.association_min_pairs) return insufficient('temporal_association', `${metric_a}:${relation}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, relation, condition_a, condition_b });
  const withA = pairs.filter(([a]) => matches(a, condition_a)), withoutA = pairs.filter(([a]) => !matches(a, condition_a));
  if (!withA.length || !withoutA.length) return insufficient('temporal_association', `${metric_a}:${relation}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, relation, condition_a, condition_b });
  const pGivenA = probability(withA.map(([, b]) => matches(b, condition_b))), pGivenNotA = probability(withoutA.map(([, b]) => matches(b, condition_b))), effectSize = pGivenA - pGivenNotA, cycles = cyclesCovered(pairs.map(pair => pair[2]), periods, end);
  return Object.freeze({ pattern_id: patternId('temporal_association', { metric_a, metric_b, relation, condition_a, condition_b }), pattern_type: 'temporal_association', metric: `${metric_a}:${relation}:${metric_b}`, metric_a, metric_b, relation, p_b_given_a: round(pGivenA), p_b_given_not_a: round(pGivenNotA), involved_days: { with_a: withA.length, without_a: withoutA.length }, sample_size: pairs.length, cycles_covered: cycles, effect_size: round(effectSize), confidence_level: confidence([qualityA.quality_level, qualityB.quality_level], pairs.length, cycles), status: detected(effectSize), data_quality: { metric_a: qualityA, metric_b: qualityB } });
}

export const PatternEngine = Object.freeze({ analyzeCyclePattern, analyzeCoOccurrence, analyzeTemporalAssociation });

