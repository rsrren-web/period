import { ANALYSIS_CONFIG } from './analysis-config.js';
import { buildCareContext } from './care-context.js';

const DAY = 86_400_000;
const dayDistance = (start, end) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const get = (source, path) => path.split('.').reduce((value, part) => value?.[part], source);

function completedCycles(periods, asOf) {
  const starts = [...new Set((periods || []).filter((item) => item?.type === 'period' && item.status !== 'deleted' && item.start <= asOf).map((item) => item.start))].sort();
  return starts.slice(0, -1).map((start, index) => ({ index, start, end: addDays(starts[index + 1], -1), next_start: starts[index + 1] }));
}

function cycleFor(date, cycles) { return cycles.find((cycle) => date >= cycle.start && date <= cycle.end) || null; }
function periodForDate(date, periods) { return (periods || []).find((period) => period?.type === 'period' && period.status !== 'deleted' && date >= period.start && date <= period.end) || null; }

function phaseForDate(date, cycle, periods, menstruating) {
  const period = periodForDate(date, periods);
  if (menstruating === true || period) return 'menstrual';
  const cyclePeriod = periodForDate(cycle.start, periods);
  if (cyclePeriod?.end && dayDistance(cyclePeriod.end, date) >= 1 && dayDistance(cyclePeriod.end, date) <= 5) return 'follicular_recovery';
  if (dayDistance(date, cycle.next_start) >= 1 && dayDistance(date, cycle.next_start) <= 5) return 'pms';
  return 'cycle_other';
}

function observationContext(date, log, periods, cycle) {
  const care = buildCareContext({ log, record_date: date }), context = care.context;
  const menstrualContext = context.menstruating ?? Boolean(periodForDate(date, periods));
  return {
    ...context,
    stress: context.stress, energy: context.energy, activity: context.activity_level, sleep: context.sleep_quality,
    emotion: context.primary_emotion, social_effect: context.social_aftereffect,
    warmth_relief: context.pain_response?.warmth_relief,
    lower_abdomen_pain: Number.isFinite(context.pain?.lower_abdomen) ? context.pain.lower_abdomen > 0 : undefined,
    breast_chest_pain: Number.isFinite(context.breast_tenderness) ? context.breast_tenderness > 0 : undefined,
    neck_shoulder_pain: Number.isFinite(context.pain?.neck_shoulder) ? context.pain.neck_shoulder > 0 : undefined,
    menstrual_context: menstrualContext,
    post_menstrual_window: phaseForDate(date, cycle, periods, menstrualContext) === 'follicular_recovery',
    phase_bucket: phaseForDate(date, cycle, periods, menstrualContext),
    structured_observation: Object.keys(care.evidence).length > 0,
    _evidence: care.evidence
  };
}

function isKnown(context, field) {
  if (['menstrual_context', 'post_menstrual_window', 'phase_bucket'].includes(field)) return true;
  const evidenceField = ({ warmth_relief: 'pain_response.warmth_relief', lower_abdomen_pain: 'pain.lower_abdomen', breast_chest_pain: 'breast_tenderness', neck_shoulder_pain: 'pain.neck_shoulder', stress: 'stress', energy: 'energy', activity: 'activity_level', sleep: 'sleep_quality', emotion: 'primary_emotion', social_effect: 'social_aftereffect' })[field] || field;
  return Array.isArray(context._evidence?.[evidenceField]) && context._evidence[evidenceField].length > 0;
}

function evaluate(context, condition) {
  const value = get(context, condition.field);
  if (!isKnown(context, condition.field) || value === null || value === undefined) return { known: false, matched: false, value: null };
  if (condition.operator === '==') return { known: true, matched: value === condition.value, value };
  if (condition.operator === 'in') return { known: true, matched: condition.value.includes(value), value };
  if (condition.operator === '>=') return { known: true, matched: Number(value) >= Number(condition.value), value };
  if (condition.operator === '<=') return { known: true, matched: Number(value) <= Number(condition.value), value };
  throw new TypeError(`不支持的TCM规则运算符：${condition.operator}`);
}

function confidence(cyclesCovered, cyclesSupported, supportRate) {
  if (cyclesCovered >= 6 && cyclesSupported >= 4 && supportRate >= 0.70) return 'stable';
  if (cyclesCovered >= 4 && cyclesSupported >= 3 && supportRate >= 0.60) return 'moderate';
  return 'exploratory';
}

function maturityFor(status, covered, supported, rate) {
  if (status !== 'detected') return 'collecting';
  if (supported >= ANALYSIS_CONFIG.tcm.stable_min_cycles && covered >= ANALYSIS_CONFIG.tcm.stable_min_cycles && rate >= ANALYSIS_CONFIG.tcm.stable_support_rate) return 'stable_cluster';
  return 'observed_cluster';
}

const PHASE_LABELS = Object.freeze({ menstrual: '主要在经期', pms: '主要在经前5天', follicular_recovery: '主要在经后恢复期', cycle_wide: '分布在整个周期', non_cycle_specific: '暂未形成周期集中' });

function phaseSpecificity(evidence) {
  const counts = { menstrual: 0, pms: 0, follicular_recovery: 0, cycle_other: 0 };
  evidence.forEach((item) => { counts[item.phase] = (counts[item.phase] || 0) + 1; });
  const total = evidence.length;
  if (!total) return Object.freeze({ type: 'insufficient', label: '周期位置仍在收集', counts, dominant_rate: 0 });
  const [dominant, count] = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const rate = count / total;
  let type = 'non_cycle_specific';
  if (rate >= 0.60 && dominant === 'menstrual') type = 'menstrual';
  else if (rate >= 0.60 && dominant === 'pms') type = 'pms';
  else if (rate >= 0.60 && dominant === 'follicular_recovery') type = 'follicular_recovery';
  else if (Object.values(counts).filter(Boolean).length >= 3 && rate < 0.60) type = 'cycle_wide';
  return Object.freeze({ type, label: PHASE_LABELS[type], counts: Object.freeze(counts), dominant_rate: rate });
}

function summarizeMatches(evidence, key) {
  const counts = new Map();
  evidence.forEach((item) => item[key].forEach((feature) => {
    const current = counts.get(feature.label) || { field: feature.field, label: feature.label, count: 0, score: 0 };
    current.count += 1; current.score += Number(feature.weight || 0); counts.set(feature.label, current);
  }));
  return [...counts.values()].sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || b.count - a.count || a.label.localeCompare(b.label));
}

export function analyzeTcmClusters({ logs = {}, periods = [], as_of, rules_config } = {}) {
  if (!rules_config?.rules) throw new TypeError('TCM cluster rules are required');
  const cycles = completedCycles(periods, as_of);
  const dated = Object.entries(logs).filter(([date]) => date <= as_of).map(([date, log]) => {
    const cycle = cycleFor(date, cycles);
    return cycle ? [date, observationContext(date, log, periods, cycle), cycle] : null;
  }).filter(Boolean).filter(([, context]) => context.structured_observation);

  return rules_config.rules.map((rule) => {
    const supporting = rule.supporting_conditions || rule.weighted_features || [], contradicting = rule.contradicting_conditions || [];
    const minimumConstituents = Number(rule.minimum_constituents || rules_config.minimum_constituent_features || 2);
    const evaluatedCycles = new Set(), evidence = [];
    for (const [date, context, cycle] of dated) {
      const hard = (rule.hard_requirements || []).map((condition) => evaluate(context, condition));
      if (hard.some((result) => !result.known || !result.matched)) continue;
      const positive = supporting.map((feature) => ({ feature, ...evaluate(context, feature) }));
      const negative = contradicting.map((feature) => ({ feature, ...evaluate(context, feature) }));
      if (![...positive, ...negative].some((item) => item.known)) continue;
      evaluatedCycles.add(cycle.start);
      const matched = positive.filter((item) => item.matched), opposed = negative.filter((item) => item.matched);
      const supportScore = matched.reduce((sum, item) => sum + Math.abs(Number(item.feature.weight || 0)), 0);
      const contradictionScore = opposed.reduce((sum, item) => sum + Math.abs(Number(item.feature.weight || 0)), 0);
      const score = supportScore - contradictionScore;
      if (matched.length < minimumConstituents || score < Number(rule.minimum_score || 0)) continue;
      evidence.push(Object.freeze({
        date, cycle_start: cycle.start, phase: context.phase_bucket, score, support_score: supportScore, contradiction_score: contradictionScore,
        features: matched.map((item) => ({ field: item.feature.field, label: item.feature.label, weight: Math.abs(Number(item.feature.weight || 0)), observed_value: item.value })),
        contradicting_features: opposed.map((item) => ({ field: item.feature.field, label: item.feature.label, weight: -Math.abs(Number(item.feature.weight || 0)), observed_value: item.value }))
      }));
    }
    const byCycle = new Map(); evidence.forEach((item) => byCycle.set(item.cycle_start, [...(byCycle.get(item.cycle_start) || []), item]));
    const covered = evaluatedCycles.size, supported = byCycle.size, minimumCycles = Math.max(ANALYSIS_CONFIG.tcm.observed_min_cycles, Number(rules_config.minimum_cycles) || 0);
    const supportRate = covered ? supported / covered : 0;
    const status = covered < minimumCycles ? 'insufficient' : supported >= minimumCycles ? 'detected' : 'not_detected';
    const maturity = maturityFor(status, covered, supported, supportRate), phases = phaseSpecificity(evidence);
    const recentCutoff = addDays(as_of, -89), recentEvidence = evidence.filter((item) => item.date >= recentCutoff);
    return Object.freeze({
      cluster_id: rule.id, rule_version: rules_config.version, display_name: rule.display_name, explanation: rule.explanation, status, maturity,
      cycles_covered: covered, cycles_supported: supported, support_rate: supportRate,
      constituent_features: Object.freeze(summarizeMatches(evidence, 'features')),
      contradicting_features: Object.freeze(summarizeMatches(evidence, 'contradicting_features')),
      evidence: Object.freeze(evidence), confidence_level: status === 'detected' ? confidence(covered, supported, supportRate) : 'insufficient',
      phase_specificity: phases,
      recent_occurrence: Object.freeze({ days_in_last_90: recentEvidence.length, cycles_in_last_3: new Set(evidence.filter((item) => cycles.slice(-3).some((cycle) => cycle.start === item.cycle_start)).map((item) => item.cycle_start)).size, last_date: evidence.at(-1)?.date || null }),
      cycle_evidence: Object.freeze([...byCycle.entries()].map(([cycle_start, items]) => ({ cycle_start, evidence_days: items.length, first_date: items[0]?.date || null, last_date: items.at(-1)?.date || null, peak_score: Math.max(...items.map((item) => item.score)) }))),
      data_quality: Object.freeze({ valid_days: dated.length, cycles_with_relevant_data: covered, reasons: covered < minimumCycles ? [`需要至少${minimumCycles}个包含相关记录的完整周期`] : supported < minimumCycles ? [`这组状态目前只在${supported}个周期出现，继续观察是否重复`] : [] }),
      intervention_tags: Object.freeze(rule.intervention_tags || []), generated_at: new Date().toISOString()
    });
  });
}

export const TCMClusterEngine = Object.freeze({ analyze: analyzeTcmClusters });
