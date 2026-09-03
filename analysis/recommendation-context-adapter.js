import { buildCareContext } from './care-context.js';

export function adaptRecommendationContext({ today_record: log = {}, record_date, phase = {}, health_events = [], patterns = [], tcm_states = [], tcm_patterns = [], constitution_profile = null, safety = {}, contraindication = {}, medication = {}, intervention_history = [] } = {}) {
  const care = buildCareContext({ log, record_date, phase, health_events, patterns, safety, contraindication, medication, intervention_history });
  const context = Object.freeze({ ...care.context, tcm_states: Object.freeze(tcm_states), tcm_patterns: Object.freeze(tcm_patterns), constitution_profile });
  return { context, current_discomforts: care.current_discomforts, evidence: care.evidence };
}

export const RecommendationContextAdapter = Object.freeze({ adaptRecommendationContext });
