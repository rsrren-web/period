import { ANALYSIS_CONFIG, METRIC_DEFINITIONS } from './analysis-config.js';
import { buildCareContext } from './care-context.js';

const RECORDED_STATUSES = new Set(['reported', 'legacy_uncertain', 'legacy_inferred', 'system_generated', 'user_corrected', 'legacy_manual']);
const roundRate = value => Math.round(value * 1000) / 1000;
const STRUCTURED_CONTEXT_FIELDS = Object.freeze({
  'tcm:bloating': 'bloating', 'tcm:body_heaviness': 'body_heaviness', 'tcm:cold_sensation': 'cold_sensation', 'tcm:poor_appetite': 'appetite_low', 'tcm:nausea': 'nausea',
  'detail_single:bowel:hard': 'stool_hard', 'detail_single:bowel:loose': 'stool_loose', 'detail_single:bowel:sticky': 'stool_sticky', 'detail_single:bowel:not_passed': 'no_bowel_movement',
  'detail_multi:sleep_issue:sleep_onset': 'sleep_onset_difficulty', 'detail_multi:sleep_issue:waking': 'sleep_fragmentation', 'detail_multi:sleep_issue:early_waking': 'early_waking',
  'detail_multi:sleep_issue:unrefreshed': 'unrefreshed_sleep', 'detail_multi:sleep_issue:dreamy': 'dream_disturbed_sleep',
  'detail_multi:body_sense:cold_hands_feet': 'cold_hands_feet', 'detail_multi:body_sense:edema': 'subjective_puffiness', 'detail_multi:body_sense:head_heavy': 'head_heaviness',
  'detail_multi:pain_nature:cold': 'pain_quality.cold'
});
const pathValue = (value, path) => path.split('.').reduce((current, part) => current?.[part], value);

function dateList(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || end < start) return [];
  const result = [], cursor = new Date(`${start}T12:00:00Z`), last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return result;
}

export function metricValue(log, metric) {
  const definition = METRIC_DEFINITIONS[metric];
  if (!definition || !log || typeof log !== 'object') return null;
  if (['tcm', 'detail_single', 'detail_multi'].includes(definition.source)) {
    const key = definition.source === 'tcm' ? `tcm:${definition.field}` : `${definition.source}:${definition.field}:${definition.value}`;
    const field = STRUCTURED_CONTEXT_FIELDS[key]; if (!field) return null;
    const care = buildCareContext({ log }), evidence = care.evidence[field];
    return Array.isArray(evidence) && evidence.length ? pathValue(care.context, field) === true : null;
  }
  const value = log[definition.field], status = log.fieldStatus?.[definition.status_field];
  if (status === 'not_recorded' || (status && !RECORDED_STATUSES.has(status))) return null;
  if (definition.type === 'boolean') return typeof value === 'boolean' ? value : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function qualityLevel(validDays, totalDays, completionRate, rules, completeCycles) {
  if (validDays < (rules.min_valid_days || 0)) return 'insufficient';
  if (completionRate < (rules.min_completion_rate || 0)) return 'insufficient';
  if ((rules.min_complete_cycles || 0) > (completeCycles ?? Infinity)) return 'insufficient';
  if (completionRate >= ANALYSIS_CONFIG.quality_levels.good_completion_rate) return 'good';
  if (completionRate >= ANALYSIS_CONFIG.quality_levels.usable_completion_rate) return 'usable';
  return 'limited';
}

function reasonsFor(validDays, totalDays, completionRate, rules, completeCycles, quality) {
  const reasons = [];
  if (!totalDays) reasons.push('目标日期范围为空');
  if (validDays < (rules.min_valid_days || 0)) reasons.push(`有效记录日 ${validDays} 天，最低需要 ${rules.min_valid_days} 天`);
  if (completionRate < (rules.min_completion_rate || 0)) reasons.push(`有效记录率 ${(completionRate * 100).toFixed(0)}%，最低需要 ${(rules.min_completion_rate * 100).toFixed(0)}%`);
  if ((rules.min_complete_cycles || 0) > (completeCycles ?? Infinity)) reasons.push(`完整周期 ${completeCycles || 0} 个，最低需要 ${rules.min_complete_cycles} 个`);
  if (!reasons.length) reasons.push(quality === 'good' ? '记录覆盖充分' : quality === 'usable' ? '记录覆盖可用于当前分析' : '达到最低门槛，但覆盖仍有限');
  return reasons;
}

export function evaluateMetricQuality({ logs = {}, metric, start, end, dates, context = 'rolling_30d', complete_cycles } = {}) {
  if (!METRIC_DEFINITIONS[metric]) throw new TypeError(`未知指标：${metric}`);
  const rules = ANALYSIS_CONFIG.contexts[context];
  if (!rules) throw new TypeError(`未知质量场景：${context}`);
  const targetDates = Array.isArray(dates) ? [...new Set(dates)].sort() : dateList(start, end);
  const validDays = targetDates.reduce((count, date) => count + (metricValue(logs[date], metric) !== null ? 1 : 0), 0);
  const totalDays = targetDates.length, completionRate = totalDays ? validDays / totalDays : 0;
  const quality = qualityLevel(validDays, totalDays, completionRate, rules, complete_cycles);
  return {
    metric,
    valid_days: validDays,
    total_days: totalDays,
    completion_rate: roundRate(completionRate),
    quality_level: quality,
    reasons: reasonsFor(validDays, totalDays, completionRate, rules, complete_cycles, quality)
  };
}

export function metricCompletionReport({ logs = {}, start, end, metrics = ['mood', 'energy', 'sleep', 'bowel', 'pain', 'activity'] } = {}) {
  return Object.fromEntries(metrics.map(metric => {
    const quality = evaluateMetricQuality({ logs, metric, start, end, context: 'rolling_30d' });
    return [`${metric}_completion_rate`, quality];
  }));
}

export function evaluateComparisonQuality({ logs = {}, metric, first, second } = {}) {
  const left = evaluateMetricQuality({ logs, metric, ...first, context: 'comparison_segment' });
  const right = evaluateMetricQuality({ logs, metric, ...second, context: 'comparison_segment' });
  const usable = left.quality_level !== 'insufficient' && right.quality_level !== 'insufficient';
  return {
    metric,
    quality_level: usable ? (left.quality_level === 'good' && right.quality_level === 'good' ? 'good' : 'usable') : 'insufficient',
    first: left,
    second: right,
    reasons: usable ? ['两段时间均达到最低记录门槛'] : ['两段时间必须分别达到最低记录门槛', ...left.reasons, ...right.reasons]
  };
}

export const DataQualityEngine = Object.freeze({ metricValue, evaluateMetricQuality, metricCompletionReport, evaluateComparisonQuality });
