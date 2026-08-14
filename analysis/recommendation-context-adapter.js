import { readTcmObservations } from '../tcm-observation-model.js';

const RECORDED = new Set(['reported', 'user_corrected', 'system_generated']);

const recorded = (log, field) => RECORDED.has(log?.fieldStatus?.[field]);
const numeric = (log, field) => recorded(log, field) && Number.isFinite(log[field]) ? Number(log[field]) : null;

const PAIN_FIELDS = Object.freeze({
  '头部': 'pain.head',
  '乳房/胸部': 'breast_tenderness',
  '肩颈': 'pain.neck_shoulder',
  '胃/上腹': 'stomach_discomfort',
  '小腹/盆腔': 'pain.lower_abdomen',
  '腰背': 'pain.lower_back',
  '臀髋': 'pain.legs',
  '腿部': 'pain.legs',
  '足部': 'pain.feet',
  '肌肉/关节': 'body_stiffness'
});

function setPath(target, path, value) {
  const parts = path.split('.');
  let current = target;
  parts.slice(0, -1).forEach((part) => { current = current[part] ||= {}; });
  current[parts.at(-1)] = value;
}

function discomfort(metric, value, sourceField, recordDate) {
  return Object.freeze({ metric, value, source_field: sourceField, record_date: recordDate, evidence_type: 'explicit_daily_record' });
}

export function adaptRecommendationContext({ today_record: log = {}, record_date, phase = {}, health_events = [], patterns = [], safety = {}, contraindication = {}, medication = {}, intervention_history = [] } = {}) {
  const bodySense = readTcmObservations(log.symptomTags);
  const context = {
    current_state_available: false,
    safety_event: { active: safety.active === true },
    contraindication: { ...contraindication },
    medication: { ...medication },
    intervention_history,
    deviations: {},
    patterns,
    pain: {}
  };
  const discomforts = [];
  const scores = { stress: 'stress', energy: 'energy', sleep: 'sleep_quality', activity: 'activity_level', socialIntensity: 'social_intensity' };
  for (const [field, target] of Object.entries(scores)) {
    const value = numeric(log, field);
    if (value !== null) { context[target] = value; context.current_state_available = true; }
  }
  if (recorded(log, 'socialEffect') && log.socialEffect) context.social_aftereffect = log.socialEffect;
  if (recorded(log, 'flow_level') && log.flow_level) context.flow_level = log.flow_level;
  if (recorded(log, 'clot_level') && log.clot_level) context.clot_level = { small: 1, medium: 2, large: 3 }[log.clot_level] ?? null;
  if (recorded(log, 'menstrual_status') && log.menstrual_status) context.menstrual_status = log.menstrual_status === 'on_period' ? 'bleeding' : log.menstrual_status === 'spotting_only' ? 'spotting' : 'not_bleeding';
  context.cycle_phase = { period: 'menstrual', follicular: 'early_follicular', ovulation: 'ovulation', pms: 'late_luteal' }[phase.key] || null;
  context.cycle_day = Number.isInteger(log.cycle_day) ? log.cycle_day : Number.isInteger(phase.cycleDay) ? phase.cycleDay : null;

  const pain = numeric(log, 'pain');
  if (pain !== null && pain > 0 && recorded(log, 'painLocations')) {
    context.current_state_available = true;
    for (const location of log.painLocations || []) {
      const target = PAIN_FIELDS[location];
      if (!target) continue;
      setPath(context, target, target === 'body_stiffness' ? true : pain);
      discomforts.push(discomfort(target, target === 'body_stiffness' ? true : pain, 'painLocations', record_date));
    }
  }
  if (recorded(log, 'bowelMovement') && log.bowelMovement === false) { context.current_state_available = true; discomforts.push(discomfort('bowel', false, 'bowelMovement', record_date)); }
  if (numeric(log, 'stress') >= 4) discomforts.push(discomfort('stress', log.stress, 'stress', record_date));
  if (numeric(log, 'sleep') !== null && log.sleep <= 2) discomforts.push(discomfort('sleep_quality', log.sleep, 'sleep', record_date));
  if (numeric(log, 'energy') !== null && log.energy <= 2) discomforts.push(discomfort('energy', log.energy, 'energy', record_date));

  const presenceFields = ['cold_sensation', 'nausea', 'diarrhea', 'body_heaviness', 'warmth_relief', 'bloating', 'poor_appetite'];
  for (const field of presenceFields) {
    if (bodySense[field] === null) continue;
    context[field] = bodySense[field] === 'yes';
    context.current_state_available = true;
  }
  context.appetite_low = bodySense.poor_appetite === 'yes';
  if (bodySense.diarrhea === 'yes') context.contraindication.diarrhea = true;
  if (bodySense.nausea === 'yes') discomforts.push(discomfort('nausea', true, 'tcm:nausea', record_date));
  if (bodySense.cold_sensation === 'yes') discomforts.push(discomfort('cold_sensation', true, 'tcm:cold_sensation', record_date));
  if (bodySense.bloating === 'yes') discomforts.push(discomfort('bloating', true, 'tcm:bloating', record_date));
  if (bodySense.body_heaviness === 'yes') discomforts.push(discomfort('body_heaviness', true, 'tcm:body_heaviness', record_date));
  if (bodySense.poor_appetite === 'yes') discomforts.push(discomfort('appetite_low', true, 'tcm:poor_appetite', record_date));

  for (const event of health_events || []) {
    const difference = event?.supporting_data?.signed_difference;
    if (event?.metric && Number.isFinite(difference)) context.deviations[event.metric] = difference;
  }
  return { context, current_discomforts: discomforts };
}

export const RecommendationContextAdapter = Object.freeze({ adaptRecommendationContext });
