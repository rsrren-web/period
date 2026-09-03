import { buildCareContext } from './care-context.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const get = (value, path) => path.split('.').reduce((current, part) => current?.[part], value);

const positive = (path, label, weight = 1, test = (value) => value === true) => Object.freeze({ path, label, weight, test });
const negative = (path, label, weight = 1, test = (value) => value === true) => Object.freeze({ path, label, weight: -Math.abs(weight), test });
const low = (path, label, weight = 1, threshold = 2) => positive(path, label, weight, (value) => Number(value) <= threshold);
const high = (path, label, weight = 1, threshold = 4) => positive(path, label, weight, (value) => Number(value) >= threshold);
const contradictHigh = (path, label, weight = 1, threshold = 4) => negative(path, label, weight, (value) => Number(value) >= threshold);
const contradictLow = (path, label, weight = 1, threshold = 2) => negative(path, label, weight, (value) => Number(value) <= threshold);

export const TCM_STATE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'cold_state', name: '寒冷感受近期明显', icon: '❄️', threshold: 4,
    supporting: [positive('cold_sensation', '明显怕冷', 2), positive('cold_hands_feet', '手脚冷', 2), positive('pain_quality.cold', '冷痛', 3), positive('pain_response.warmth_relief', '热敷后缓解', 2)],
    contradicting: [negative('cold_sensation', '明确没有怕冷', 1, (value) => value === false), negative('cold_hands_feet', '明确没有手脚冷', 1, (value) => value === false), negative('night_sweat', '夜间出汗', 1)],
    explanation: '只整理最近的怕冷、手脚冷、冷痛和温热反应，不等同于体质或证型判断。'
  }),
  Object.freeze({
    id: 'heat_dryness_state', name: '燥热相关感受近期增加', icon: '🌡️', threshold: 3, minimumConstituents: 2,
    supporting: [positive('night_sweat', '夜间出汗', 2), positive('stool_hard', '排便干硬', 2), positive('early_waking', '早醒', 1)],
    contradicting: [negative('cold_sensation', '明显怕冷', 2), negative('pain_quality.cold', '冷痛', 2)],
    explanation: '目前仅根据夜间出汗、干硬便和早醒做保守观察；项目尚未采集怕热、口干等信息，因此不会据此判断热证。'
  }),
  Object.freeze({
    id: 'stress_distension_state', name: '情志紧张与胀感增加', icon: '🫧', threshold: 4,
    supporting: [high('stress', '压力较高', 2), positive('anxiety', '焦虑', 2), high('irritability', '烦躁或生气', 2, 1), positive('pain_quality.distending', '胀痛', 2), positive('breast_tenderness', '乳房或胸部不适', 1, (value) => Number(value) > 0), positive('bloating', '腹胀', 1)],
    contradicting: [contradictLow('stress', '压力较低', 1), negative('pain_quality.distending', '明确没有胀痛', 1, (value) => value === false)],
    explanation: '观察压力、情绪和胀感是否在近期共同增加，只表示个人记录中的动态状态。'
  }),
  Object.freeze({
    id: 'digestive_heaviness_state', name: '消化负担与沉重感增加', icon: '🍚', threshold: 4,
    supporting: [positive('bloating', '腹胀', 2), positive('body_heaviness', '身体沉重', 2), positive('appetite_low', '食欲较差', 2), positive('stool_sticky', '排便黏滞', 2), positive('stool_loose', '排便稀软', 1), positive('nausea', '恶心', 1), positive('head_heaviness', '头重', 1)],
    contradicting: [negative('bowel_normal', '排便正常', 1), negative('stool_hard', '只有干硬表现', 1)],
    explanation: '综合近期胃口、腹胀、沉重感和排便表现；不会把一次不适直接解释为长期问题。'
  }),
  Object.freeze({
    id: 'fluid_retention_state', name: '水湿滞留样感受增加', icon: '💧', threshold: 3,
    supporting: [positive('subjective_puffiness', '浮肿感', 3), positive('body_heaviness', '身体沉重', 1), positive('head_heaviness', '头重', 2), positive('stool_sticky', '排便黏滞', 1)],
    contradicting: [negative('subjective_puffiness', '明确没有浮肿感', 1, (value) => value === false), negative('head_heaviness', '明确没有头重', 1, (value) => value === false)],
    explanation: '“水湿”仅是对浮肿感、沉重感和头重等记录的传统观察标签，不代表液体潴留诊断。'
  }),
  Object.freeze({
    id: 'recovery_low_state', name: '近期恢复不足', icon: '🔋', threshold: 4,
    supporting: [low('energy', '精力较低', 2), low('activity_level', '活动较少', 1), low('sleep_quality', '睡眠评分较低', 1), positive('unrefreshed_sleep', '睡够仍累', 2), positive('body_heaviness', '身体沉重', 1)],
    contradicting: [contradictHigh('energy', '精力较好', 2), contradictHigh('sleep_quality', '睡眠评分较好', 1)],
    explanation: '根据近期精力、睡眠和活动恢复情况整理，优先帮助调整节律，不等同于“气虚”或“血虚”。'
  }),
  Object.freeze({
    id: 'sleep_recovery_state', name: '睡眠恢复近期不足', icon: '🌙', threshold: 4,
    supporting: [positive('late_sleep', '23点后入睡', 1), low('sleep_quality', '睡眠评分较低', 2), positive('sleep_onset_difficulty', '难入睡', 2), positive('sleep_fragmentation', '夜间易醒', 2), positive('dream_disturbed_sleep', '多梦', 1), positive('early_waking', '早醒', 1), positive('unrefreshed_sleep', '睡够仍累', 2)],
    contradicting: [contradictHigh('sleep_quality', '睡眠评分较好', 2), negative('unrefreshed_sleep', '明确没有睡后疲倦', 1, (value) => value === false)],
    explanation: '区分入睡、夜醒、早醒和醒后恢复感，帮助找到更具体的睡眠问题。'
  })
]);

function known(care, path) {
  return Array.isArray(care.evidence[path]) && care.evidence[path].length > 0;
}

function summarize(matches) {
  const grouped = new Map();
  matches.forEach((item) => {
    const current = grouped.get(item.label) || { field: item.path, label: item.label, count: 0, score: 0, dates: [] };
    current.count += 1; current.score += item.weight; current.dates.push(item.date); grouped.set(item.label, current);
  });
  return [...grouped.values()].sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || b.count - a.count || a.label.localeCompare(b.label));
}

function confidence(validDays, supportingDays) {
  if (validDays < 3 || supportingDays < 2) return 'insufficient';
  if (validDays >= 10 && supportingDays >= 5) return 'high';
  if (validDays >= 7 && supportingDays >= 3) return 'moderate';
  return 'exploratory';
}

function trendFor(dayResults) {
  const rate = (items) => { const valid = items.filter((item) => item.known).length; return valid ? items.reduce((sum, item) => sum + item.support, 0) / valid : null; };
  const previous = rate(dayResults.slice(0, 7)), recent = rate(dayResults.slice(7));
  if (previous === null || recent === null) return 'insufficient';
  if (recent >= previous + 0.75) return 'rising';
  if (recent <= previous - 0.75) return 'falling';
  return 'stable';
}

function analyzeDefinition(definition, daily) {
  const supportMatches = [], contradictionMatches = [], dayResults = [];
  for (const item of daily) {
    let support = 0, contradiction = 0, hasKnown = false;
    for (const condition of definition.supporting) {
      if (!known(item.care, condition.path)) continue;
      hasKnown = true; const value = get(item.care.context, condition.path);
      if (condition.test(value)) { support += condition.weight; supportMatches.push({ ...condition, date: item.date, value }); }
    }
    for (const condition of definition.contradicting) {
      if (!known(item.care, condition.path)) continue;
      hasKnown = true; const value = get(item.care.context, condition.path);
      if (condition.test(value)) { contradiction += Math.abs(condition.weight); contradictionMatches.push({ ...condition, date: item.date, value }); }
    }
    dayResults.push({ date: item.date, known: hasKnown, support, contradiction, net: support - contradiction });
  }
  const validDays = dayResults.filter((item) => item.known).length;
  const supportingDays = dayResults.filter((item) => item.support > 0).length;
  const rawScore = dayResults.reduce((sum, item) => sum + item.net, 0);
  const supportingEvidence = summarize(supportMatches), contradictingEvidence = summarize(contradictionMatches);
  const level = confidence(validDays, supportingDays);
  const active = level !== 'insufficient' && rawScore >= definition.threshold && supportingEvidence.length >= (definition.minimumConstituents || 1);
  const insufficientDataReason = validDays < 3
    ? `近14天只有${validDays}天记录了相关项目，至少需要3天。`
    : supportingDays < 2 ? `相关表现目前只在${supportingDays}天出现，至少重复2天后再判断。`
      : supportingEvidence.length < (definition.minimumConstituents || 1) ? `目前只有${supportingEvidence.length}类支持信息，还需要另一类相关记录。` : null;
  return Object.freeze({
    id: definition.id, name: definition.name, icon: definition.icon, active, score: rawScore,
    supportingEvidence: Object.freeze(supportingEvidence), contradictingEvidence: Object.freeze(contradictingEvidence),
    recentFrequency: validDays ? supportingDays / validDays : 0, supportingDays, validDays, trend: trendFor(dayResults), confidence: level,
    explanation: definition.explanation, insufficientDataReason, window: { days: 14, start: daily[0]?.date || null, end: daily.at(-1)?.date || null }
  });
}

export function analyzeTcmStates({ logs = {}, as_of } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of || '')) throw new TypeError('TCM state as_of must use YYYY-MM-DD');
  const dates = Array.from({ length: 14 }, (_, index) => addDays(as_of, index - 13));
  const daily = dates.map((date) => ({ date, care: buildCareContext({ log: logs[date] || {}, record_date: date }) }));
  return Object.freeze(TCM_STATE_DEFINITIONS.map((definition) => analyzeDefinition(definition, daily)));
}

export const TcmStateEngine = Object.freeze({ analyze: analyzeTcmStates, definitions: TCM_STATE_DEFINITIONS });
