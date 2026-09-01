import { readDailyDetails, DAILY_DETAIL_ENUMS } from '../daily-detail-model.js';
import { readTcmObservations, TCM_OBSERVATION_FIELDS } from '../tcm-observation-model.js';

const RECORDED = new Set(['reported', 'legacy_uncertain', 'legacy_inferred', 'system_generated', 'user_corrected', 'legacy_manual']);
const recorded = (log, field) => RECORDED.has(log?.fieldStatus?.[field]);
const numeric = (log, field) => recorded(log, field) && Number.isFinite(log?.[field]) ? Number(log[field]) : null;

const PAIN_FIELDS = Object.freeze({
  '头部': 'pain.head', '乳房/胸部': 'breast_tenderness', '肩颈': 'pain.neck_shoulder', '胃/上腹': 'stomach_discomfort',
  '小腹/盆腔': 'pain.lower_abdomen', '腰背': 'pain.lower_back', '臀髋': 'pain.legs', '腿部': 'pain.legs',
  '足部': 'pain.feet', '肌肉/关节': 'body_stiffness'
});

const DETAIL_CANONICAL = Object.freeze({
  cold_hands_feet: ['body_sense', 'cold_hands_feet'],
  subjective_puffiness: ['body_sense', 'edema'],
  head_heaviness: ['body_sense', 'head_heavy'],
  easy_sweating: ['body_sense', 'easy_sweat'],
  night_sweat: ['body_sense', 'night_sweat'],
  sleep_onset_difficulty: ['sleep_issue', 'sleep_onset'],
  sleep_fragmentation: ['sleep_issue', 'waking'],
  dream_disturbed_sleep: ['sleep_issue', 'dreamy'],
  early_waking: ['sleep_issue', 'early_waking'],
  unrefreshed_sleep: ['sleep_issue', 'unrefreshed'],
  stool_hard: ['bowel', 'hard'], stool_loose: ['bowel', 'loose'], stool_sticky: ['bowel', 'sticky'],
  no_bowel_movement: ['bowel', 'not_passed'], bowel_normal: ['bowel', 'normal']
});

const PAIN_QUALITY = Object.freeze({ distending: 'distending', stabbing: 'stabbing', dull: 'dull', bearing_down: 'dragging', cold: 'cold' });
const PAIN_RESPONSE = Object.freeze({ heat_relief: 'warmth_relief', pressure_relief: 'pressure_relief', activity_change: 'activity_changed' });
const PHASES = Object.freeze({ period: 'menstrual', follicular: 'early_follicular', ovulation: 'ovulation', pms: 'late_luteal' });

function setPath(target, path, value) {
  const parts = path.split('.'); let current = target;
  parts.slice(0, -1).forEach((part) => { current = current[part] ||= {}; });
  current[parts.at(-1)] = value;
}

function detailPresence(details, group, value) {
  const source = details[group];
  if (source === null) return null;
  if (Array.isArray(source)) return source.includes(value);
  return source === value;
}

function addEvidence(evidence, field, value, source, status = 'reported') {
  evidence[field] ||= [];
  evidence[field].push(Object.freeze({ field, value, source, status }));
}

function addDiscomfort(discomforts, metric, value, sourceField, recordDate) {
  if (value !== true && !(typeof value === 'number' && value > 0)) return;
  discomforts.push(Object.freeze({ metric, value, source_field: sourceField, record_date: recordDate, evidence_type: 'explicit_daily_record' }));
}

function mergeBoolean(context, evidence, field, candidates) {
  const known = candidates.filter((item) => item.value !== null && item.value !== undefined);
  if (!known.length) return;
  const value = known.some((item) => item.value === true);
  context[field] = value;
  known.forEach((item) => addEvidence(evidence, field, item.value, item.source, item.status));
}

function carePatterns(context) {
  const definitions = {
    cold_pattern: ['cold_sensation', 'cold_hands_feet', 'pain_quality.cold', 'pain_response.warmth_relief', 'pain.lower_abdomen'],
    digestive_heaviness_pattern: ['bloating', 'body_heaviness', 'stool_loose', 'stool_sticky', 'appetite_low', 'subjective_puffiness', 'head_heaviness'],
    stress_distension_pattern: ['stress', 'irritability', 'pain_quality.distending', 'breast_tenderness', 'bloating'],
    sleep_recovery_pattern: ['late_sleep', 'sleep_onset_difficulty', 'sleep_fragmentation', 'dream_disturbed_sleep', 'early_waking', 'unrefreshed_sleep', 'energy'],
    menstrual_discomfort_pattern: ['menstrual_status', 'pain.lower_abdomen', 'pain.lower_back', 'flow_level', 'clot_level']
  };
  return Object.fromEntries(Object.entries(definitions).map(([id, fields]) => {
    const activeFields = fields.filter((field) => {
      const value = field.split('.').reduce((current, part) => current?.[part], context);
      if (field === 'stress') return Number(value) >= 4;
      if (field === 'energy') return Number(value) <= 2;
      if (field === 'menstrual_status') return ['bleeding', 'spotting'].includes(value);
      if (field === 'flow_level' || field === 'clot_level') return value !== null && value !== undefined;
      return value === true || (typeof value === 'number' && value > 0);
    });
    return [id, Object.freeze({ active: activeFields.length >= 2, fields: activeFields, strength: activeFields.length })];
  }));
}

export const CARE_CONTEXT_RECORDED_FIELDS = Object.freeze([
  'stress', 'energy', 'sleep_quality', 'activity_level', 'social_intensity', 'social_aftereffect', 'late_sleep',
  'menstrual_status', 'menstruating', 'flow_level', 'blood_color', 'clot_level',
  ...Object.keys(TCM_OBSERVATION_FIELDS), ...Object.keys(DETAIL_CANONICAL),
  'diarrhea', 'pain_level', 'pain_locations', 'pain_quality.distending', 'pain_quality.stabbing', 'pain_quality.dull',
  'pain_quality.dragging', 'pain_quality.cold', 'pain_response.warmth_relief', 'pain_response.pressure_relief',
  'pain_response.activity_changed', ...Object.values(PAIN_FIELDS)
]);

export const CARE_CONTEXT_DETAIL_FIELDS = Object.freeze(Object.fromEntries(Object.entries(DAILY_DETAIL_ENUMS).map(([field, values]) => [field, [...values]])));

export function buildCareContext({ log = {}, record_date, phase = {}, health_events = [], patterns = [], safety = {}, contraindication = {}, medication = {}, intervention_history = [] } = {}) {
  const details = readDailyDetails(log.symptomTags), tcm = readTcmObservations(log.symptomTags), evidence = {}, discomforts = [];
  const context = {
    current_state_available: false, safety_event: { active: safety.active === true }, contraindication: { ...contraindication }, medication: { ...medication },
    intervention_history, deviations: {}, persistence: {}, patterns, pain: {}, pain_quality: {}, pain_response: {}
  };

  const scores = { stress: 'stress', energy: 'energy', sleep: 'sleep_quality', activity: 'activity_level', socialIntensity: 'social_intensity' };
  for (const [source, field] of Object.entries(scores)) {
    const value = numeric(log, source);
    if (value === null) continue;
    context[field] = value; context.current_state_available = true; addEvidence(evidence, field, value, source);
  }
  const coreDiscomforts = [
    ['stress', Number(context.stress) >= 4],
    ['energy', Number(context.energy) <= 2],
    ['sleep_quality', Number(context.sleep_quality) <= 2]
  ];
  coreDiscomforts.forEach(([field, active]) => addDiscomfort(discomforts, field, active, field, record_date));
  if (recorded(log, 'socialEffect') && log.socialEffect) { context.social_aftereffect = log.socialEffect; addEvidence(evidence, 'social_aftereffect', log.socialEffect, 'socialEffect'); }
  if (recorded(log, 'bedtime') && log.bedtime) { context.late_sleep = log.bedtime === 'after_23'; addEvidence(evidence, 'late_sleep', context.late_sleep, 'bedtime'); }

  if (recorded(log, 'menstrual_status') && log.menstrual_status) {
    context.menstrual_status = log.menstrual_status === 'on_period' ? 'bleeding' : log.menstrual_status === 'spotting_only' ? 'spotting' : 'not_bleeding';
    context.menstruating = ['bleeding', 'spotting'].includes(context.menstrual_status);
    addEvidence(evidence, 'menstrual_status', context.menstrual_status, 'menstrual_status');
  }
  for (const field of ['flow_level', 'blood_color']) if (recorded(log, field) && log[field]) { context[field] = log[field]; addEvidence(evidence, field, log[field], field); }
  if (recorded(log, 'clot_level') && log.clot_level) { context.clot_level = { small: 1, medium: 2, large: 3 }[log.clot_level] ?? null; addEvidence(evidence, 'clot_level', context.clot_level, 'clot_level'); }
  context.cycle_phase = PHASES[phase.key] || null;
  context.cycle_day = Number.isInteger(log.cycle_day) ? log.cycle_day : Number.isInteger(phase.cycleDay) ? phase.cycleDay : null;

  const pain = numeric(log, 'pain');
  if (pain !== null) { context.pain_level = pain; addEvidence(evidence, 'pain_level', pain, 'pain'); }
  if (pain !== null && pain > 0 && recorded(log, 'painLocations')) {
    context.pain_locations = [...(log.painLocations || [])];
    for (const location of context.pain_locations) {
      const target = PAIN_FIELDS[location]; if (!target) continue;
      const value = target === 'body_stiffness' ? true : pain;
      setPath(context, target, value); addEvidence(evidence, target, value, `painLocations:${location}`); addDiscomfort(discomforts, target, value, 'painLocations', record_date);
    }
  }
  for (const [stored, canonical] of Object.entries(PAIN_QUALITY)) {
    const value = detailPresence(details, 'pain_nature', stored); if (value === null) continue;
    context.pain_quality[canonical] = value; addEvidence(evidence, `pain_quality.${canonical}`, value, `detail:pain_nature:${stored}`);
    addDiscomfort(discomforts, `pain_quality.${canonical}`, value, `detail:pain_nature:${stored}`, record_date);
  }
  for (const [stored, canonical] of Object.entries(PAIN_RESPONSE)) {
    const value = detailPresence(details, 'pain_response', stored); if (value === null) continue;
    context.pain_response[canonical] = value; addEvidence(evidence, `pain_response.${canonical}`, value, `detail:pain_response:${stored}`);
  }

  for (const [field, [group, stored]] of Object.entries(DETAIL_CANONICAL)) {
    const value = detailPresence(details, group, stored); if (value === null) continue;
    context[field] = value; addEvidence(evidence, field, value, `detail:${group}:${stored}`);
    addDiscomfort(discomforts, field, value, `detail:${group}:${stored}`, record_date);
  }
  mergeBoolean(context, evidence, 'diarrhea', [
    { value: tcm.diarrhea === null ? null : tcm.diarrhea === 'yes', source: 'tcm:diarrhea' },
    { value: detailPresence(details, 'bowel', 'diarrhea'), source: 'detail:bowel:diarrhea' }
  ]);

  const tcmAliases = { poor_appetite: 'appetite_low' };
  for (const field of Object.keys(TCM_OBSERVATION_FIELDS)) {
    if (field === 'diarrhea') continue;
    const target = tcmAliases[field] || field, value = tcm[field] === null ? null : tcm[field] === 'yes';
    if (value === null) continue;
    if (target === 'warmth_relief') {
      if (context.pain_response.warmth_relief === undefined) context.pain_response.warmth_relief = value;
      addEvidence(evidence, 'pain_response.warmth_relief', value, `tcm:${field}`);
      continue;
    }
    context[target] = value; addEvidence(evidence, target, value, `tcm:${field}`); addDiscomfort(discomforts, target, value, `tcm:${field}`, record_date);
  }
  if (context.diarrhea === true) { context.contraindication.diarrhea = true; addDiscomfort(discomforts, 'diarrhea', true, 'daily_record', record_date); }

  if (recorded(log, 'primaryEmotion') && log.primaryEmotion) {
    context.irritability = log.primaryEmotion === '生气'; context.anxiety = log.primaryEmotion === '焦虑';
    addEvidence(evidence, 'primary_emotion', log.primaryEmotion, 'primaryEmotion');
  }
  if (recorded(log, 'bowelMovement') && typeof log.bowelMovement === 'boolean' && details.bowel === null) {
    context.no_bowel_movement = !log.bowelMovement;
    addEvidence(evidence, 'no_bowel_movement', context.no_bowel_movement, 'bowelMovement');
    addDiscomfort(discomforts, 'no_bowel_movement', context.no_bowel_movement, 'bowelMovement', record_date);
  }

  for (const event of health_events || []) {
    const difference = event?.supporting_data?.signed_difference;
    if (event?.metric && Number.isFinite(difference)) context.deviations[event.metric] = difference;
    if (event?.event_type === 'persistence' && event.metric && event.confidence_level !== 'insufficient') context.persistence[event.metric] = Object.freeze({
      active: true, consecutive_days: event.supporting_data?.consecutive_days || event.sample_size || 0, event_id: event.event_id
    });
  }
  context.care_patterns = carePatterns(context);
  context.current_state_available = context.current_state_available || discomforts.length > 0;
  return Object.freeze({ context: Object.freeze(context), evidence: Object.freeze(evidence), current_discomforts: Object.freeze(discomforts), details, tcm });
}

export const CareContext = Object.freeze({ build: buildCareContext, recorded_fields: CARE_CONTEXT_RECORDED_FIELDS });
