export const TCM_OBSERVATION_VERSION = 3;

export const TCM_OBSERVATION_ENUMS = Object.freeze({
  presence: Object.freeze(['yes', 'no']),
  level: Object.freeze(['1', '2', '3', '4', '5'])
});

export const TCM_OBSERVATION_FIELDS = Object.freeze({
  cold_sensation: Object.freeze({ type: 'presence', label: '明显怕冷' }),
  warmth_relief: Object.freeze({ type: 'presence', label: '热敷后缓解' }),
  nausea: Object.freeze({ type: 'presence', label: '恶心' }),
  diarrhea: Object.freeze({ type: 'presence', label: '腹泻' }),
  bloating: Object.freeze({ type: 'presence', label: '腹胀' }),
  poor_appetite: Object.freeze({ type: 'presence', label: '食欲差' }),
  body_heaviness: Object.freeze({ type: 'presence', label: '身体沉重' })
});

const PREFIX = 'tcm:';
const stableTag = (field, value) => `${PREFIX}${field}:${value}`;

export function readTcmObservations(tags = []) {
  const result = Object.fromEntries(Object.keys(TCM_OBSERVATION_FIELDS).map((field) => [field, null]));
  let legacyBloating = null;
  let legacyAppetite = null;
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== 'string' || !tag.startsWith(PREFIX)) continue;
    const [, field, value] = tag.split(':');
    if (field === 'bloating_level' && TCM_OBSERVATION_ENUMS.level.includes(value)) legacyBloating = Number(value);
    if (field === 'appetite_level' && TCM_OBSERVATION_ENUMS.level.includes(value)) legacyAppetite = Number(value);
    const definition = TCM_OBSERVATION_FIELDS[field];
    if (!definition) continue;
    if (TCM_OBSERVATION_ENUMS[definition.type].includes(value)) result[field] = definition.type === 'level' ? Number(value) : value;
  }
  if (result.bloating === null && legacyBloating !== null) result.bloating = legacyBloating >= 2 ? 'yes' : 'no';
  if (result.poor_appetite === null && legacyAppetite !== null) result.poor_appetite = legacyAppetite <= 2 ? 'yes' : 'no';
  return result;
}

export function writeTcmObservations(tags = [], observations = {}) {
  const preserved = (Array.isArray(tags) ? tags : []).filter((tag) => typeof tag === 'string' && !tag.startsWith(PREFIX));
  const encoded = [];
  for (const [field, definition] of Object.entries(TCM_OBSERVATION_FIELDS)) {
    const raw = observations[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = String(raw);
    if (TCM_OBSERVATION_ENUMS[definition.type].includes(value)) encoded.push(stableTag(field, value));
  }
  return [...preserved, ...encoded];
}

export function tcmObservationCompletion(tags = []) {
  const values = readTcmObservations(tags), total = Object.keys(TCM_OBSERVATION_FIELDS).length;
  const valid = Object.values(values).filter((value) => value !== null).length;
  return Object.freeze({ valid, total, completion_rate: total ? valid / total : 0 });
}

export const TcmObservationModel = Object.freeze({ read: readTcmObservations, write: writeTcmObservations, completion: tcmObservationCompletion });
