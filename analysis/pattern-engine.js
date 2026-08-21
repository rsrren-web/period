import { ANALYSIS_CONFIG } from './analysis-config.js';
import { evaluateMetricQuality, metricValue } from './data-quality-engine.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const dayDistance = (start, end) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
const datesBetween = (start, end) => { const result = [],endTime=Date.parse(`${end}T12:00:00Z`); for(let time=Date.parse(`${start}T12:00:00Z`);time<=endTime;time+=DAY)result.push(new Date(time).toISOString().slice(0,10)); return result; };
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

function cycleForDate(date, periods, asOf) {
  return completedCycles(periods, asOf).find((cycle) => date >= cycle.start && date <= cycle.end) || null;
}

function defaultPhaseForDate(date, periods, asOf) {
  const cycle = cycleForDate(date, periods, asOf);
  if (!cycle) return 'outside_cycle';
  const cycleDay = dayDistance(cycle.start, date) + 1, length = dayDistance(cycle.start, cycle.next_start);
  const recordedPeriod = periods.find((item) => item?.type === 'period' && item.status !== 'deleted' && date >= item.start && date <= item.end);
  if (recordedPeriod) return 'menstrual';
  if (cycleDay >= Math.max(1, length - 15) && cycleDay <= Math.max(1, length - 11)) return 'ovulatory_window';
  if (cycleDay > Math.max(1, length - 11)) return 'luteal';
  return 'follicular';
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

export function createCyclePatternContext({periods=[],as_of,target_window={start_day:1,end_day:5}}={}){const cycles=completedCycles(periods,as_of),targetDates=[],comparisonDates=[];cycles.forEach(cycle=>datesBetween(cycle.start,cycle.end).forEach(date=>{const cycleDay=dayDistance(cycle.start,date)+1;(cycleDay>=target_window.start_day&&cycleDay<=target_window.end_day?targetDates:comparisonDates).push(date)}));return {cycles,targetDates,comparisonDates}}

export function analyzeCyclePattern({ logs = {}, periods = [], metric, as_of, target_window = { start_day: 1, end_day: 5 }, mode = 'mean', condition, cycle_context } = {}) {
  const context=cycle_context||createCyclePatternContext({periods,as_of,target_window}),{cycles,targetDates,comparisonDates}=context, minimum = ANALYSIS_CONFIG.patterns.cycle_pattern_min_complete_cycles;
  if (cycles.length < minimum) return insufficient('cycle_pattern', metric, [], cycles.length, { mode, target_window, condition });
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

function associationStats(pairs, conditionA, conditionB, minimumGroupSize = ANALYSIS_CONFIG.patterns.minimum_exposed_days) {
  const withA = pairs.filter(([a]) => matches(a, conditionA)), withoutA = pairs.filter(([a]) => !matches(a, conditionA));
  if (withA.length < minimumGroupSize || withoutA.length < minimumGroupSize) return null;
  const exposedOccurrences = withA.filter(([, b]) => matches(b, conditionB)).length;
  const unexposedOccurrences = withoutA.filter(([, b]) => matches(b, conditionB)).length;
  const pGivenA = probability(withA.map(([, b]) => matches(b, conditionB))), pGivenNotA = probability(withoutA.map(([, b]) => matches(b, conditionB)));
  return { withA, withoutA, exposedOccurrences, unexposedOccurrences, pGivenA, pGivenNotA, effectSize: pGivenA - pGivenNotA, relativeRisk: pGivenNotA > 0 ? pGivenA / pGivenNotA : null };
}

function phaseStrata(pairs, conditionA, conditionB, phaseForDate) {
  const groups = new Map();
  pairs.forEach((pair) => { const phase = phaseForDate(pair[2]); groups.set(phase, [...(groups.get(phase) || []), pair]); });
  const strata = [...groups.entries()].flatMap(([phase, values]) => {
    if (values.length < ANALYSIS_CONFIG.patterns.phase_stratum_min_pairs) return [];
    const stats = associationStats(values, conditionA, conditionB, 2);
    return stats ? [{ phase, sample_size: values.length, exposed_days: stats.withA.length, unexposed_days: stats.withoutA.length, effect_size: round(stats.effectSize) }] : [];
  });
  return strata;
}

export function analyzeCoOccurrence({ logs = {}, periods = [], metric_a, metric_b, start, end, condition_a, condition_b } = {}) {
  const dates = associationDates(start, end), qualityA = evaluateMetricQuality({ logs, metric: metric_a, dates, context: 'association' }), qualityB = evaluateMetricQuality({ logs, metric: metric_b, dates, context: 'association' });
  if ([qualityA, qualityB].some(item => item.quality_level === 'insufficient')) return insufficient('co_occurrence', `${metric_a}:${metric_b}`, [qualityA, qualityB], cyclesCovered(dates, periods, end), { metric_a, metric_b, condition_a, condition_b });
  const pairs = dates.map(date => [metricValue(logs[date], metric_a), metricValue(logs[date], metric_b), date]).filter(([a, b]) => a !== null && b !== null);
  if (pairs.length < ANALYSIS_CONFIG.patterns.association_min_pairs) return insufficient('co_occurrence', `${metric_a}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, condition_a, condition_b });
  const stats = associationStats(pairs, condition_a, condition_b);
  if (!stats) return insufficient('co_occurrence', `${metric_a}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, condition_a, condition_b });
  const cycles = cyclesCovered(pairs.map(pair => pair[2]), periods, end), strata = phaseStrata(pairs, condition_a, condition_b, (date) => defaultPhaseForDate(date, periods, end));
  return Object.freeze({ pattern_id: patternId('co_occurrence', { metric_a, metric_b, condition_a, condition_b }), pattern_type: 'co_occurrence', metric: `${metric_a}:${metric_b}`, metric_a, metric_b, relation: 'same_day', lag_days: 0, direction: 'undirected', p_b_given_a: round(stats.pGivenA), p_b_given_not_a: round(stats.pGivenNotA), relative_risk: round(stats.relativeRisk), involved_days: { with_a: stats.withA.length, without_a: stats.withoutA.length, with_a_and_b: stats.exposedOccurrences, without_a_and_b: stats.unexposedOccurrences }, sample_size: pairs.length, cycles_covered: cycles, effect_size: round(stats.effectSize), confidence_level: confidence([qualityA.quality_level, qualityB.quality_level], pairs.length, cycles), status: detected(stats.effectSize), phase_strata: strata, date_range: { start, end }, missing_days: dates.length - pairs.length, causal_interpretation_allowed: false, data_quality: { metric_a: qualityA, metric_b: qualityB } });
}

export function analyzeTemporalAssociation({ logs = {}, periods = [], metric_a, metric_b, start, end, relation = 'same_day', condition_a, condition_b, phase_for_date, same_cycle_only = true } = {}) {
  const offsets = { same_day: 0, next_day: 1, previous_day: -1 };
  if (!(relation in offsets)) throw new TypeError(`不支持的时间关系：${relation}`);
  const anchorDates = associationDates(start, end).filter(date => addDays(date, offsets[relation]) >= start && addDays(date, offsets[relation]) <= end), targetDates = anchorDates.map(date => addDays(date, offsets[relation]));
  const qualityA = evaluateMetricQuality({ logs, metric: metric_a, dates: anchorDates, context: 'association' }), qualityB = evaluateMetricQuality({ logs, metric: metric_b, dates: targetDates, context: 'association' });
  if ([qualityA, qualityB].some(item => item.quality_level === 'insufficient')) return insufficient('temporal_association', `${metric_a}:${relation}:${metric_b}`, [qualityA, qualityB], cyclesCovered(anchorDates, periods, end), { metric_a, metric_b, relation, condition_a, condition_b });
  const pairs = anchorDates.map((date, index) => [metricValue(logs[date], metric_a), metricValue(logs[targetDates[index]], metric_b), date, targetDates[index]]).filter(([a, b, anchor, target]) => a !== null && b !== null && (!same_cycle_only || offsets[relation] === 0 || cycleForDate(anchor, periods, end)?.start === cycleForDate(target, periods, end)?.start));
  if (pairs.length < ANALYSIS_CONFIG.patterns.association_min_pairs) return insufficient('temporal_association', `${metric_a}:${relation}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, relation, condition_a, condition_b });
  const stats = associationStats(pairs, condition_a, condition_b);
  if (!stats) return insufficient('temporal_association', `${metric_a}:${relation}:${metric_b}`, [qualityA, qualityB], cyclesCovered(pairs.map(pair => pair[2]), periods, end), { metric_a, metric_b, relation, condition_a, condition_b });
  const cycles = cyclesCovered(pairs.map(pair => pair[2]), periods, end), phaseFor = typeof phase_for_date === 'function' ? phase_for_date : (date) => defaultPhaseForDate(date, periods, end), strata = phaseStrata(pairs, condition_a, condition_b, phaseFor);
  const consistent = strata.length ? strata.filter((item) => Math.sign(item.effect_size) === Math.sign(stats.effectSize)).length / strata.length : null;
  return Object.freeze({ pattern_id: patternId('temporal_association', { metric_a, metric_b, relation, condition_a, condition_b }), pattern_type: 'temporal_association', metric: `${metric_a}:${relation}:${metric_b}`, metric_a, metric_b, relation, lag_days: offsets[relation], direction: relation === 'same_day' ? 'undirected' : relation === 'next_day' ? 'a_precedes_b' : 'b_precedes_a', p_b_given_a: round(stats.pGivenA), p_b_given_not_a: round(stats.pGivenNotA), relative_risk: round(stats.relativeRisk), involved_days: { with_a: stats.withA.length, without_a: stats.withoutA.length, with_a_and_b: stats.exposedOccurrences, without_a_and_b: stats.unexposedOccurrences }, sample_size: pairs.length, cycles_covered: cycles, effect_size: round(stats.effectSize), confidence_level: confidence([qualityA.quality_level, qualityB.quality_level], pairs.length, cycles), status: detected(stats.effectSize), phase_strata: strata, phase_consistency: round(consistent), date_range: { start, end }, missing_or_excluded_pairs: anchorDates.length - pairs.length, same_cycle_only, causal_interpretation_allowed: false, data_quality: { metric_a: qualityA, metric_b: qualityB } });
}

export const PatternEngine = Object.freeze({ createCyclePatternContext, analyzeCyclePattern, analyzeCoOccurrence, analyzeTemporalAssociation });
