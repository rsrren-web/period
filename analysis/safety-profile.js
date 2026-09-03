const PREGNANCY = new Set(['unknown', 'not_pregnant', 'possible', 'pregnant']);
const REVIEW = new Set(['unknown', 'no', 'yes']);
const SKIN = new Set(['unknown', 'clear', 'injury']);

export function normalizeSafetyProfile(value = {}) {
  return Object.freeze({ version: 1, pregnancyStatus: PREGNANCY.has(value.pregnancyStatus) ? value.pregnancyStatus : 'unknown', herbMedicationReview: REVIEW.has(value.herbMedicationReview) ? value.herbMedicationReview : 'unknown', severeReflux: REVIEW.has(value.severeReflux) ? value.severeReflux : 'unknown', localSkinStatus: SKIN.has(value.localSkinStatus) ? value.localSkinStatus : 'unknown', allergies: String(value.allergies || '').trim().slice(0, 500), updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null });
}

export function safetyContextFromProfile(value = {}) {
  const profile = normalizeSafetyProfile(value), context = { safety_profile_complete: false };
  if (profile.pregnancyStatus !== 'unknown') { context.pregnancy_status = profile.pregnancyStatus === 'not_pregnant' ? 'not_pregnant' : profile.pregnancyStatus === 'possible' ? 'possible' : 'known'; context.state = { pregnancy_known_or_possible: profile.pregnancyStatus !== 'not_pregnant' }; context.contraindication = { pregnancy_known_or_possible: profile.pregnancyStatus !== 'not_pregnant' }; }
  if (profile.herbMedicationReview !== 'unknown') context.medication = { herb_interaction_review_required: profile.herbMedicationReview === 'yes' };
  if (profile.severeReflux !== 'unknown') context.contraindication = { ...(context.contraindication || {}), active_severe_reflux: profile.severeReflux === 'yes', severe_reflux: profile.severeReflux === 'yes' };
  if (profile.localSkinStatus !== 'unknown') { const injured = profile.localSkinStatus === 'injury'; context.local_skin_injury_at_point = injured; context.local_skin_injury_at_any_point = injured; context.local_skin_injury_on_route = injured; context.acute_local_infection_at_point = injured; }
  context.safety_profile_complete = [profile.pregnancyStatus, profile.herbMedicationReview, profile.severeReflux, profile.localSkinStatus].every((item) => item !== 'unknown');
  return Object.freeze(context);
}

export const SafetyProfile = Object.freeze({ normalize: normalizeSafetyProfile, toContext: safetyContextFromProfile });
