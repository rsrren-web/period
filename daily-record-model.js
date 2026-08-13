export const DAILY_MODEL_VERSION = 2;

export const DAILY_ENUMS = Object.freeze({
  primaryEmotion: ['开心', '满足', '平静', '普通', '疲倦', '焦虑', '低落', '生气', '害怕'],
  bedtime: ['before_23', 'after_23'],
  exerciseTypes: ['健身房', '拉伸', '八段锦', '网球', '徒步'],
  socialTypes: ['工作', '娱乐', '日常'],
  socialEffect: ['restorative', 'neutral', 'draining'],
  painLocations: ['头部', '乳房/胸部', '肩颈', '胃/上腹', '小腹/盆腔', '腰背', '臀髋', '腿部', '足部', '肌肉/关节']
});

export const SCORE_FIELDS = Object.freeze(['mood', 'energy', 'sleep', 'activity', 'stress', 'pain']);
export const STRUCTURED_FIELDS = Object.freeze([
  ...SCORE_FIELDS, 'primaryEmotion', 'bedtime', 'bowelMovement', 'exerciseTypes',
  'socialTypes', 'socialIntensity', 'socialEffect', 'painLocations', 'symptomTags', 'temperature'
]);

const META_PREFIXES = ['情绪：', '入睡：', '排便：', '运动：', '社交：', '社交强度：', '社交影响：', '疼痛部位：'];
const emotionScores = { 开心: 5, 满足: 5, 平静: 4, 普通: 3, 疲倦: 2, 焦虑: 2, 低落: 1, 生气: 1, 害怕: 1 };
const bedtimeValues = { '23:00前': 'before_23', '23:00后': 'after_23' };
const socialEffects = { 恢复: 'restorative', 无明显影响: 'neutral', 消耗: 'draining' };
const painAliases = { '乳房胀痛/触痛': '乳房/胸部', '上腹/胃部': '胃/上腹' };

const unique = (values) => [...new Set(values)];
const tagsFrom = (log = {}) => Array.isArray(log.legacySymptoms)
  ? [...log.legacySymptoms]
  : Array.isArray(log.symptoms) ? [...log.symptoms] : [];
const tagged = (tags, prefix) => tags.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
const taggedAll = (tags, prefix) => tags.filter((item) => item.startsWith(prefix)).map((item) => item.slice(prefix.length));
const score = (value, min, max) => value === null || value === undefined || value === ''
  ? null
  : Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const enumValue = (value, allowed) => allowed.includes(value) ? value : null;
const enumList = (value, allowed) => Array.isArray(value) ? unique(value.filter((item) => allowed.includes(item))) : null;

export function migrateDailyLog(input = {}, { legacy = input.modelVersion !== DAILY_MODEL_VERSION } = {}) {
  const tags = tagsFrom(input);
  const exactEmotion = tagged(tags, '情绪：');
  const bedtimeTag = tagged(tags, '入睡：');
  const bowelTag = tagged(tags, '排便：');
  const socialIntensityTag = tagged(tags, '社交强度：');
  const socialEffectTag = tagged(tags, '社交影响：');
  const oldPainLocations = taggedAll(tags, '疼痛部位：').map((item) => painAliases[item] || item);
  const inferredPainLocations = [];
  if (tags.includes('头痛')) inferredPainLocations.push('头部');
  if (tags.includes('腰腹不适')) inferredPainLocations.push('小腹/盆腔', '腰背');
  const painLocations = oldPainLocations.length
    ? enumList(oldPainLocations, DAILY_ENUMS.painLocations)
    : inferredPainLocations.length ? enumList(inferredPainLocations, DAILY_ENUMS.painLocations) : null;
  const extractedSymptoms = Array.isArray(input.symptomTags)
    ? unique(input.symptomTags.filter((item) => typeof item === 'string' && item && !META_PREFIXES.some((prefix) => item.startsWith(prefix))))
    : unique(tags.filter((item) => !META_PREFIXES.some((prefix) => item.startsWith(prefix))));
  const symptomTags = extractedSymptoms.length ? extractedSymptoms : null;
  const status = input.fieldStatus && typeof input.fieldStatus === 'object' && !Array.isArray(input.fieldStatus)
    ? { ...input.fieldStatus }
    : {};
  if (legacy) {
    for (const field of SCORE_FIELDS) if (input[field] !== undefined) status[field] = 'legacy_uncertain';
    if (exactEmotion) status.primaryEmotion = 'reported';
    if (bedtimeTag) status.bedtime = 'reported';
    if (bowelTag) status.bowelMovement = 'reported';
    if (taggedAll(tags, '运动：').length) status.exerciseTypes = 'reported';
    if (taggedAll(tags, '社交：').length) status.socialTypes = 'reported';
    if (socialIntensityTag) status.socialIntensity = 'reported';
    if (socialEffectTag) status.socialEffect = 'reported';
    if (oldPainLocations.length) status.painLocations = 'reported';
    else if (inferredPainLocations.length) status.painLocations = 'legacy_inferred';
    if (symptomTags?.length) status.symptomTags = 'reported';
    if (input.temperature !== '' && input.temperature !== null && input.temperature !== undefined) status.temperature = 'reported';
  }
  const temperature = input.temperature === '' || input.temperature === null || input.temperature === undefined
    ? null : Number(input.temperature);
  const migrated = {
    modelVersion: DAILY_MODEL_VERSION,
    mood: score(input.mood ?? (exactEmotion ? emotionScores[exactEmotion] : null), 1, 5),
    energy: score(input.energy, 1, 5),
    sleep: score(input.sleep, 1, 5),
    activity: score(input.activity, 1, 5),
    stress: score(input.stress, 1, 5),
    pain: score(input.pain, 0, 10),
    primaryEmotion: enumValue(input.primaryEmotion ?? exactEmotion, DAILY_ENUMS.primaryEmotion),
    bedtime: enumValue(input.bedtime ?? bedtimeValues[bedtimeTag], DAILY_ENUMS.bedtime),
    bowelMovement: typeof input.bowelMovement === 'boolean' ? input.bowelMovement : bowelTag === '已排便' ? true : bowelTag === '未排便' ? false : null,
    exerciseTypes: enumList(input.exerciseTypes ?? (taggedAll(tags, '运动：').length ? taggedAll(tags, '运动：') : null), DAILY_ENUMS.exerciseTypes),
    socialTypes: enumList(input.socialTypes ?? (taggedAll(tags, '社交：').length ? taggedAll(tags, '社交：') : null), DAILY_ENUMS.socialTypes),
    socialIntensity: score(input.socialIntensity ?? socialIntensityTag, 1, 5),
    socialEffect: enumValue(input.socialEffect ?? socialEffects[socialEffectTag], DAILY_ENUMS.socialEffect),
    painLocations: enumList(input.painLocations ?? painLocations, DAILY_ENUMS.painLocations),
    symptomTags,
    temperature: Number.isFinite(temperature) && temperature >= 34 && temperature <= 42 ? temperature : null,
    fieldStatus: Object.fromEntries(Object.entries(status).filter(([field, value]) => STRUCTURED_FIELDS.includes(field) && ['reported', 'legacy_uncertain', 'legacy_inferred'].includes(value))),
    legacySymptoms: tags,
    updatedAt: input.updatedAt || new Date(0).toISOString()
  };
  return migrated;
}

export function migrateDailyLogs(logs = {}) {
  return Object.fromEntries(Object.entries(logs && typeof logs === 'object' && !Array.isArray(logs) ? logs : {})
    .map(([date, log]) => [date, migrateDailyLog(log)]));
}

export function compatibilityTags(log = {}) {
  const value = migrateDailyLog(log, { legacy: false });
  const tags = [...(value.symptomTags || [])];
  if (value.primaryEmotion) tags.push(`情绪：${value.primaryEmotion}`);
  if (value.bedtime) tags.push(`入睡：${value.bedtime === 'before_23' ? '23:00前' : '23:00后'}`);
  if (value.bowelMovement !== null) tags.push(`排便：${value.bowelMovement ? '已排便' : '未排便'}`);
  for (const item of value.exerciseTypes || []) tags.push(`运动：${item}`);
  for (const item of value.socialTypes || []) tags.push(`社交：${item}`);
  if (value.socialIntensity !== null) tags.push(`社交强度：${value.socialIntensity}`);
  if (value.socialEffect) tags.push(`社交影响：${{ restorative: '恢复', neutral: '无明显影响', draining: '消耗' }[value.socialEffect]}`);
  for (const item of value.painLocations || []) tags.push(`疼痛部位：${item}`);
  return unique(tags);
}

export const bedtimeDisplay = (value) => value === 'before_23' ? '23:00前' : value === 'after_23' ? '23:00后' : null;
export const bowelDisplay = (value) => value === true ? '已排便' : value === false ? '未排便' : null;
export const socialEffectDisplay = (value) => ({ restorative: '恢复', neutral: '无明显影响', draining: '消耗' })[value] || null;
export const scoreWasReported = (log, field) => log?.fieldStatus?.[field] === 'reported';
