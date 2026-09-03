import { buildCareContext } from './care-context.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const valueAt = (source, path) => path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, source);

export const CONSTITUTION_LEVELS = Object.freeze(['low', 'moderate', 'high']);
export const CONSTITUTION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'balanced', name: '平和质倾向', description: '目前没有把日常记录自动解释为平和质；仅保留你的人工基线。', evidence: [] }),
  Object.freeze({ id: 'qi_deficiency', name: '气虚质倾向', description: '观察精力、活动、易出汗、恢复感和食欲记录。', evidence: [
    ['energy_level', '精力偏低', (value) => Number(value) <= 2], ['activity_level', '活动偏低', (value) => Number(value) <= 2],
    ['easy_sweating', '容易出汗', Boolean], ['unrefreshed_sleep', '睡够仍累', Boolean], ['appetite_low', '食欲较差', Boolean]
  ] }),
  Object.freeze({ id: 'yang_deficiency', name: '阳虚质倾向', description: '观察怕冷、手脚冷、冷痛和温热缓解记录。', evidence: [
    ['cold_sensation', '明显怕冷', Boolean], ['cold_hands_feet', '手脚冷', Boolean], ['pain_quality.cold', '冷痛', Boolean], ['pain_response.warmth_relief', '热敷缓解', Boolean]
  ] }),
  Object.freeze({ id: 'yin_deficiency', name: '阴虚质倾向', description: '观察夜间出汗、干硬便和睡眠中断记录。', evidence: [
    ['night_sweat', '夜间出汗', Boolean], ['stool_hard', '排便干硬', Boolean], ['sleep_fragmentation', '夜间易醒', Boolean], ['early_waking', '早醒', Boolean]
  ] }),
  Object.freeze({ id: 'phlegm_damp', name: '痰湿质倾向', description: '观察沉重、浮肿、头重、黏滞便和腹胀记录。', evidence: [
    ['body_heaviness', '身体沉重', Boolean], ['subjective_puffiness', '浮肿', Boolean], ['head_heaviness', '头重', Boolean], ['stool_sticky', '排便黏滞', Boolean], ['bloating', '腹胀', Boolean]
  ] }),
  Object.freeze({ id: 'damp_heat', name: '湿热质倾向', description: '现有记录维度有限，仅观察夜间出汗、黏滞便和腹泻；不会据此自动判断。', evidence: [
    ['night_sweat', '夜间出汗', Boolean], ['stool_sticky', '排便黏滞', Boolean], ['diarrhea', '腹泻', Boolean]
  ] }),
  Object.freeze({ id: 'blood_stasis', name: '血瘀质倾向', description: '观察刺痛、暗红经血和较多血块记录，不与寒冷表现强制绑定。', evidence: [
    ['pain_quality.stabbing', '刺痛', Boolean], ['blood_color', '暗红经血', (value) => value === 'dark_red'], ['clot_level', '血块较多', (value) => value === 'large']
  ] }),
  Object.freeze({ id: 'qi_stagnation', name: '气郁质倾向', description: '观察压力、焦虑或烦躁、腹胀、胀痛和乳房不适记录。', evidence: [
    ['stress_level', '压力偏高', (value) => Number(value) >= 4], ['anxiety', '焦虑', Boolean], ['irritability', '烦躁或生气', Boolean],
    ['bloating', '腹胀', Boolean], ['pain_quality.distending', '胀痛', Boolean], ['breast_tenderness', '乳房不适', Boolean]
  ] }),
  Object.freeze({ id: 'inherited_special', name: '特禀质倾向', description: '过敏等信息需要由本人或专业问卷确认，不从每日记录推断。', evidence: [] })
]);

const definitionById = new Map(CONSTITUTION_DEFINITIONS.map((item) => [item.id, item]));

export function normalizeConstitutionProfile(value = {}) {
  const baseline = {};
  for (const definition of CONSTITUTION_DEFINITIONS) {
    const level = value?.baseline?.[definition.id];
    baseline[definition.id] = CONSTITUTION_LEVELS.includes(level) ? level : null;
  }
  const assessedAt = /^\d{4}-\d{2}-\d{2}$/.test(value?.assessedAt || '') ? value.assessedAt : null;
  const updatedAt = Number.isFinite(Date.parse(value?.updatedAt || '')) ? value.updatedAt : null;
  return Object.freeze({ version: 1, baseline: Object.freeze(baseline), source: 'manual', assessedAt, editable: true, updatedAt });
}

function windowEvidence(entries, definition) {
  const counts = new Map(definition.evidence.map(([field, label]) => [field, { field, label, count: 0 }]));
  let validDays = 0, supportingDays = 0;
  for (const entry of entries) {
    const observed = definition.evidence.map(([field, , matches]) => ({ field, value: valueAt(entry.context, field), matches }));
    if (!observed.some((item) => item.value !== null && item.value !== undefined)) continue;
    validDays++;
    let supported = false;
    for (const item of observed) if (item.matches(item.value)) { counts.get(item.field).count++; supported = true; }
    if (supported) supportingDays++;
  }
  const frequency = validDays ? supportingDays / validDays : null;
  return Object.freeze({ validDays, supportingDays, frequency, supportingEvidence: Object.freeze([...counts.values()].filter((item) => item.count > 0)) });
}

function difference(recent, prior) {
  if (recent.validDays < 3 || prior.validDays < 5 || recent.frequency === null || prior.frequency === null) return 'insufficient';
  const delta = recent.frequency - prior.frequency;
  return delta >= 0.15 ? 'increased' : delta <= -0.15 ? 'decreased' : 'stable';
}

export function analyzeConstitutionProfile({ profile, logs = {}, as_of } = {}) {
  const normalized = normalizeConstitutionProfile(profile);
  const start = addDays(as_of, -89), recentStart = addDays(as_of, -13), priorEnd = addDays(recentStart, -1);
  const entries = Object.entries(logs).filter(([date]) => date >= start && date <= as_of).sort(([a], [b]) => a.localeCompare(b)).map(([date, log]) => ({ date, context: buildCareContext({ log, record_date: date }).context }));
  const evidence90d = {}, recentDifference = {};
  for (const definition of CONSTITUTION_DEFINITIONS) {
    const all = windowEvidence(entries, definition);
    const recent = windowEvidence(entries.filter((item) => item.date >= recentStart), definition);
    const prior = windowEvidence(entries.filter((item) => item.date <= priorEnd), definition);
    const confidence = !definition.evidence.length ? 'manual_only' : all.validDays >= 30 ? 'usable' : all.validDays >= 10 ? 'limited' : 'insufficient';
    evidence90d[definition.id] = Object.freeze({ ...all, confidence, definitionFields: Object.freeze(definition.evidence.map(([field]) => field)) });
    recentDifference[definition.id] = Object.freeze({ direction: difference(recent, prior), recentFrequency: recent.frequency, priorFrequency: prior.frequency, recentValidDays: recent.validDays, priorValidDays: prior.validDays });
  }
  const active = CONSTITUTION_DEFINITIONS.filter((item) => normalized.baseline[item.id]).map((item) => Object.freeze({ id: item.id, name: item.name, level: normalized.baseline[item.id], description: item.description, evidence90d: evidence90d[item.id], recentDifference: recentDifference[item.id] }));
  return Object.freeze({ ...normalized, established: active.length > 0, active: Object.freeze(active), evidence90d: Object.freeze(evidence90d), recentDifference: Object.freeze(recentDifference), asOf: as_of });
}

export function constitutionDefinition(id) { return definitionById.get(id) || null; }

export const ConstitutionProfile = Object.freeze({ normalize: normalizeConstitutionProfile, analyze: analyzeConstitutionProfile, definitions: CONSTITUTION_DEFINITIONS, levels: CONSTITUTION_LEVELS });
