import { ANALYSIS_CONFIG } from './analysis-config.js';
import { buildCareContext } from './care-context.js';

const DAY = 86400000;
const dayDistance = (start, end) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const datesBetween = (start, end) => { const dates = []; for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date); return dates; };

function completedCycles(periods, asOf) {
  const starts = [...new Set((periods || []).filter((item) => item?.type === 'period' && item.status !== 'deleted' && item.start <= asOf).map((item) => item.start))].sort();
  return starts.slice(0, -1).map((start, index) => ({ index, start, end: new Date(Date.parse(`${starts[index + 1]}T12:00:00Z`) - DAY).toISOString().slice(0, 10) }));
}

function cycleFor(date, cycles) { return cycles.find((cycle) => date >= cycle.start && date <= cycle.end) || null; }
function inMenstrualContext(log) { return log?.menstrual_status === 'on_period' || (log?.menstrual_status === 'spotting_only' && ['period_start_transition', 'period_end_transition'].includes(log?.spotting_context)); }

const legacyPresence = (value) => value === true ? 'yes' : value === false ? 'no' : null;
const known = (care, field) => Array.isArray(care.evidence[field]) && care.evidence[field].length > 0;
const positivePain = (value) => Number.isFinite(value) ? value > 0 : null;

function observationContext(date, log, periods) {
  const care = buildCareContext({ log, record_date: date }), context = care.context;
  const locations = new Set(log?.painLocations || []);
  const painFlag = (canonical, locationNames) => positivePain(canonical) ?? (Number(log?.pain) > 0 && locationNames.some((name) => locations.has(name)));
  const previousPeriod = [...periods].filter((period) => period?.type === 'period' && period.status !== 'deleted' && period.end < date).sort((a, b) => b.end.localeCompare(a.end))[0];
  return {
    cold_sensation: legacyPresence(context.cold_sensation),
    warmth_relief: legacyPresence(context.pain_response?.warmth_relief),
    nausea: legacyPresence(context.nausea), diarrhea: legacyPresence(context.diarrhea), bloating: legacyPresence(context.bloating),
    poor_appetite: legacyPresence(context.appetite_low), body_heaviness: legacyPresence(context.body_heaviness),
    menstrual_context: context.menstruating ?? inMenstrualContext(log),
    post_menstrual_window: Boolean(previousPeriod && dayDistance(previousPeriod.end, date) >= 1 && dayDistance(previousPeriod.end, date) <= 5),
    stress: context.stress ?? log?.stress ?? null, emotion: context.primary_emotion ?? log?.primaryEmotion ?? null, social_effect: context.social_aftereffect ?? log?.socialEffect ?? null,
    energy: context.energy ?? log?.energy ?? null, activity: context.activity_level ?? log?.activity ?? null, sleep: context.sleep_quality ?? log?.sleep ?? null,
    bedtime: known(care, 'late_sleep') ? (context.late_sleep ? 'after_23' : 'before_23') : log?.bedtime ?? null,
    bowel_movement: known(care, 'no_bowel_movement') ? !context.no_bowel_movement : typeof log?.bowelMovement === 'boolean' ? log.bowelMovement : null,
    clot_presence: known(care, 'clot_presence') ? legacyPresence(context.clot_presence) : log?.clot_presence === 'not_recorded' ? null : log?.clot_presence ?? null,
    blood_color: context.blood_color ?? log?.blood_color ?? null,
    lower_abdomen_pain: painFlag(context.pain?.lower_abdomen, ['小腹/盆腔']),
    breast_chest_pain: painFlag(context.breast_tenderness, ['乳房/胸部']),
    neck_shoulder_pain: painFlag(context.pain?.neck_shoulder, ['肩颈']), upper_abdomen_pain: painFlag(context.stomach_discomfort, ['胃/上腹']),
    head_neck_pain: painFlag(Math.max(...[context.pain?.head, context.pain?.neck_shoulder].filter(Number.isFinite)), ['头部', '肩颈']),
    structured_observation: Object.values(care.evidence).flat().some((item) => String(item.source).startsWith('tcm:') || String(item.source).startsWith('detail:'))
  };
}

function evaluate(value, condition) {
  if (value === null || value === undefined) return { known: false, matched: false };
  if (condition.operator === '==') return { known: true, matched: value === condition.value };
  if (condition.operator === 'in') return { known: true, matched: condition.value.includes(value) };
  if (condition.operator === '>=') return { known: true, matched: Number(value) >= Number(condition.value) };
  if (condition.operator === '<=') return { known: true, matched: Number(value) <= Number(condition.value) };
  throw new TypeError(`不支持的TCM规则运算符：${condition.operator}`);
}

function confidence(cyclesCovered, cyclesSupported, config) {
  const rate = cyclesCovered ? cyclesSupported / cyclesCovered : 0;
  if (cyclesCovered >= 6 && rate >= 0.70) return 'stable';
  if (cyclesCovered >= 4 && rate >= 0.60) return 'moderate';
  return 'exploratory';
}

function maturityFor(status, covered, supported, rate) {
  if (status !== 'detected') return 'collecting';
  if (supported >= ANALYSIS_CONFIG.tcm.stable_min_cycles && covered >= ANALYSIS_CONFIG.tcm.stable_min_cycles && rate >= ANALYSIS_CONFIG.tcm.stable_support_rate) return 'stable_cluster';
  return 'observed_cluster';
}

export function analyzeTcmClusters({ logs = {}, periods = [], as_of, rules_config } = {}) {
  if (!rules_config?.rules) throw new TypeError('TCM cluster rules are required');
  const cycles = completedCycles(periods, as_of), dated = Object.entries(logs).filter(([date]) => date <= as_of && cycleFor(date, cycles)).map(([date, log]) => [date, log, observationContext(date, log, periods)]).filter(([, , context]) => context.structured_observation);
  const firstStructuredDate = dated.map(([date]) => date).sort()[0] || null;
  const eligibleDays = firstStructuredDate ? cycles.flatMap((cycle) => datesBetween(cycle.start, cycle.end)).filter((date) => date >= firstStructuredDate && date <= as_of).length : 0;
  return rules_config.rules.map((rule) => {
    const evidence = [];
    for (const [date, , context] of dated) {
      const cycle = cycleFor(date, cycles);
      const hard = rule.hard_requirements.map((condition) => evaluate(context[condition.field], condition));
      if (hard.some((result) => !result.known || !result.matched)) continue;
      const checked = rule.weighted_features.map((feature) => ({ feature, ...evaluate(context[feature.field], feature) }));
      const known = checked.filter((item) => item.known), matched = checked.filter((item) => item.matched);
      const completion = checked.length ? known.length / checked.length : 0;
      const score = matched.reduce((sum, item) => sum + Number(item.feature.weight || 0), 0);
      if (completion < rules_config.minimum_feature_completion || matched.length < rules_config.minimum_constituent_features || score < rule.minimum_score) continue;
      evidence.push({ date, cycle_start: cycle.start, completion_rate: completion, score, features: matched.map((item) => ({ field: item.feature.field, label: item.feature.label, observed_value: context[item.feature.field] })) });
    }
    const byCycle = new Map(); evidence.forEach((item) => { const current = byCycle.get(item.cycle_start) || []; current.push(item); byCycle.set(item.cycle_start, current); });
    const covered = new Set(dated.map(([date]) => cycleFor(date, cycles)?.start).filter(Boolean)).size, supported = byCycle.size;
    const constituentCounts = new Map(); evidence.forEach((item) => item.features.forEach((feature) => constituentCounts.set(feature.label, (constituentCounts.get(feature.label) || 0) + 1)));
    const constituents = [...constituentCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
    const minimumCycles = Math.max(ANALYSIS_CONFIG.tcm.observed_min_cycles, Number(rules_config.minimum_cycles) || 0);
    const status = covered < minimumCycles ? 'insufficient' : supported >= minimumCycles ? 'detected' : 'not_detected';
    const supportRate = covered ? supported / covered : 0, maturity = maturityFor(status, covered, supported, supportRate);
    return Object.freeze({
      cluster_id: rule.id, rule_version: rules_config.version, display_name: rule.display_name, status,
      maturity, cycles_covered: covered, cycles_supported: supported, support_rate: supportRate,
      constituent_features: constituents, evidence, confidence_level: status === 'detected' ? (maturity === 'stable_cluster' ? 'stable' : confidence(covered, supported, rules_config)) : 'insufficient',
      cycle_evidence: [...byCycle.entries()].map(([cycle_start, items]) => ({ cycle_start, evidence_days: items.length, first_date: items[0]?.date || null, last_date: items.at(-1)?.date || null })),
      data_quality: { valid_days: dated.length, total_days: eligibleDays, completion_rate: eligibleDays ? dated.length / eligibleDays : 0, first_structured_date: firstStructuredDate, reasons: covered < minimumCycles ? [`需要至少${minimumCycles}个包含新体感记录的完整周期`] : supported < minimumCycles ? [`这组体感目前只在${supported}个周期出现，继续观察是否重复`] : [] },
      intervention_tags: rule.intervention_tags || [], generated_at: new Date().toISOString()
    });
  });
}

export const TCMClusterEngine = Object.freeze({ analyze: analyzeTcmClusters });
