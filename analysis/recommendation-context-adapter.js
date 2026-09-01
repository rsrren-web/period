import { buildCareContext } from './care-context.js';

export function adaptRecommendationContext({ today_record: log = {}, record_date, phase = {}, health_events = [], patterns = [], safety = {}, contraindication = {}, medication = {}, intervention_history = [] } = {}) {
  const care = buildCareContext({ log, record_date, phase, health_events, patterns, safety, contraindication, medication, intervention_history });
  return { context: care.context, current_discomforts: care.current_discomforts, evidence: care.evidence };
}

export const RecommendationContextAdapter = Object.freeze({ adaptRecommendationContext });
