const PREFIX = 'detail:';

export const DAILY_DETAIL_ENUMS = Object.freeze({
  pain_nature: Object.freeze(['distending', 'stabbing', 'dull', 'bearing_down', 'cold']),
  pain_response: Object.freeze(['heat_relief', 'pressure_relief', 'activity_change']),
  bowel: Object.freeze(['normal', 'hard', 'loose', 'diarrhea', 'sticky', 'not_passed']),
  body_sense: Object.freeze(['cold_hands_feet', 'edema', 'head_heavy', 'easy_sweat', 'night_sweat']),
  sleep_issue: Object.freeze(['sleep_onset', 'waking', 'dreamy', 'early_waking', 'unrefreshed'])
});

export const DAILY_DETAIL_LABELS = Object.freeze({
  pain_nature: Object.freeze({ distending: '胀痛', stabbing: '刺痛', dull: '隐痛', bearing_down: '坠痛', cold: '冷痛' }),
  pain_response: Object.freeze({ heat_relief: '热敷缓解', pressure_relief: '按压缓解', activity_change: '活动后变化' }),
  bowel: Object.freeze({ normal: '正常', hard: '干硬', loose: '稀软', diarrhea: '腹泻', sticky: '黏滞', not_passed: '未排便' }),
  body_sense: Object.freeze({ cold_hands_feet: '手脚冷', edema: '浮肿', head_heavy: '头重', easy_sweat: '容易出汗', night_sweat: '夜间出汗' }),
  sleep_issue: Object.freeze({ sleep_onset: '难入睡', waking: '易醒', dreamy: '多梦', early_waking: '早醒', unrefreshed: '睡够仍累' })
});

const MULTI_FIELDS = new Set(['pain_nature', 'pain_response', 'body_sense', 'sleep_issue']);
const unique = (values) => [...new Set(values)];

export function readDailyDetails(tags = []) {
  const result = Object.fromEntries(Object.keys(DAILY_DETAIL_ENUMS).map((field) => [field, null]));
  const collected = Object.fromEntries([...MULTI_FIELDS].map((field) => [field, []]));
  const recordedEmpty = new Set();
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== 'string' || !tag.startsWith(PREFIX)) continue;
    const [, field, value] = tag.split(':');
    if (!DAILY_DETAIL_ENUMS[field]) continue;
    if (MULTI_FIELDS.has(field)) {
      if (value === 'none') recordedEmpty.add(field);
      else if (DAILY_DETAIL_ENUMS[field].includes(value)) collected[field].push(value);
    } else if (DAILY_DETAIL_ENUMS[field].includes(value)) result[field] = value;
  }
  for (const field of MULTI_FIELDS) {
    const values = unique(collected[field]);
    if (values.length) result[field] = values;
    else if (recordedEmpty.has(field)) result[field] = [];
  }
  return result;
}

export function writeDailyDetails(tags = [], details = {}) {
  const knownPrefixes = Object.keys(DAILY_DETAIL_ENUMS).map((field) => `${PREFIX}${field}:`);
  const preserved = (Array.isArray(tags) ? tags : []).filter((tag) => typeof tag === 'string' && !knownPrefixes.some((prefix) => tag.startsWith(prefix)));
  const encoded = [];
  for (const [field, allowed] of Object.entries(DAILY_DETAIL_ENUMS)) {
    const value = details[field];
    if (MULTI_FIELDS.has(field)) {
      if (!Array.isArray(value)) continue;
      const values = unique(value.filter((item) => allowed.includes(item)));
      if (values.length) values.forEach((item) => encoded.push(`${PREFIX}${field}:${item}`));
      else encoded.push(`${PREFIX}${field}:none`);
    } else if (allowed.includes(value)) encoded.push(`${PREFIX}${field}:${value}`);
  }
  return [...preserved, ...encoded];
}

export function dailyDetailRows(tags = []) {
  const details = readDailyDetails(tags), rows = [];
  for (const [field, value] of Object.entries(details)) {
    if (value === null || (Array.isArray(value) && !value.length)) continue;
    const labels = DAILY_DETAIL_LABELS[field];
    rows.push([field, Array.isArray(value) ? value.map((item) => labels[item]).filter(Boolean) : labels[value]]);
  }
  return rows;
}

export const DailyDetailModel = Object.freeze({ read: readDailyDetails, write: writeDailyDetails, rows: dailyDetailRows });
