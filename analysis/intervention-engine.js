import { ANALYSIS_CONFIG } from './analysis-config.js';

const MISSING = Symbol('missing');

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const present = (value) => value !== MISSING && value !== null && value !== undefined;
const asTime = (value) => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
};

export function getPath(source, path) {
  if (!source || typeof source !== 'object' || typeof path !== 'string' || !path) return MISSING;
  let value = source;
  for (const segment of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, segment)) return MISSING;
    value = value[segment];
  }
  return value;
}

function baselineValue(entry) {
  if (finite(entry)) return entry;
  if (!entry || typeof entry !== 'object') return MISSING;
  if (entry.available === false || entry.status === 'unavailable') return MISSING;
  if (entry.quality_level && !['usable', 'good'].includes(entry.quality_level)) return MISSING;
  return finite(entry.value) ? entry.value : MISSING;
}

function deviationValue(field, context) {
  const explicit = getPath(context?.deviations, field);
  if (finite(explicit)) return explicit;
  if (explicit && typeof explicit === 'object' && finite(explicit.value)) return explicit.value;
  const current = getPath(context, field);
  const baseline = baselineValue(getPath(context?.baselines, field));
  return finite(current) && finite(baseline) ? current - baseline : MISSING;
}

function patternMatches(field, expected, context) {
  const direct = getPath(context?.patterns, field);
  if (present(direct)) {
    if (Array.isArray(direct)) return direct.includes(expected);
    if (typeof direct === 'object') return direct.value === expected || direct.pattern === expected || direct.status === expected;
    return direct === expected;
  }
  const list = Array.isArray(context?.patterns) ? context.patterns : [];
  return list.some((pattern) => pattern && pattern.metric === field &&
    [pattern.value, pattern.pattern, pattern.pattern_id, pattern.status].includes(expected));
}

export function evaluateCondition(condition, context = {}) {
  const { field, operator, value: expected } = condition || {};
  if (typeof field !== 'string' || typeof operator !== 'string') {
    return { matched: false, missing: true, actual: null, reason: 'invalid_condition' };
  }
  if (operator === 'pattern_exists') {
    const matched = patternMatches(field, expected, context);
    return { matched, missing: !matched && !present(getPath(context?.patterns, field)) && !Array.isArray(context?.patterns), actual: matched ? expected : null };
  }
  const actual = operator.startsWith('deviation_') ? deviationValue(field, context) : getPath(context, field);
  const missing = !present(actual);
  if (operator === 'exists') return { matched: !missing, missing, actual: missing ? null : actual };
  if (operator === 'not_exists') return { matched: missing, missing, actual: missing ? null : actual };
  // Unknown data must never earn a score or satisfy a negative condition.
  if (missing) return { matched: false, missing: true, actual: null };
  let matched = false;
  switch (operator) {
    case '==': matched = actual === expected; break;
    case '!=': matched = actual !== expected; break;
    case '>': matched = finite(actual) && finite(expected) && actual > expected; break;
    case '>=': matched = finite(actual) && finite(expected) && actual >= expected; break;
    case '<': matched = finite(actual) && finite(expected) && actual < expected; break;
    case '<=': matched = finite(actual) && finite(expected) && actual <= expected; break;
    case 'in': matched = Array.isArray(expected) && expected.includes(actual); break;
    case 'not_in': matched = Array.isArray(expected) && !expected.includes(actual); break;
    case 'deviation_gte': matched = finite(actual) && finite(expected) && actual >= expected; break;
    case 'deviation_lte': matched = finite(actual) && finite(expected) && actual <= expected; break;
    default: return { matched: false, missing: false, actual, reason: 'unsupported_operator' };
  }
  return { matched, missing: false, actual };
}

function normalizedHistory(history, interventionId) {
  return (Array.isArray(history) ? history : []).filter((entry) =>
    entry && (entry.intervention_id === interventionId || entry.id === interventionId));
}

function historyStats(intervention, history, now) {
  const entries = normalizedHistory(history, intervention.id);
  const times = entries.map((entry) => asTime(entry.occurred_at || entry.used_at || entry.recommended_at || entry.date)).filter(finite);
  const lastUsedAt = times.length ? Math.max(...times) : null;
  const today = new Date(now).toISOString().slice(0, 10);
  const dailyUses = entries.filter((entry) => {
    const time = asTime(entry.occurred_at || entry.used_at || entry.recommended_at || entry.date);
    return time !== null && new Date(time).toISOString().slice(0, 10) === today;
  }).length;
  const outcomes = entries.map((entry) => entry.helpful ?? entry.outcome).filter((value) =>
    value === true || value === false || value === 'helpful' || value === 'unhelpful');
  const helpful = outcomes.filter((value) => value === true || value === 'helpful').length;
  const unhelpful = outcomes.filter((value) => value === false || value === 'unhelpful').length;
  const paired = entries.filter((entry) => finite(Number(entry.before)) && finite(Number(entry.after)));
  const improvements = paired.map((entry) => Number(entry.before) - Number(entry.after));
  const meanImprovement = improvements.length ? improvements.reduce((sum, value) => sum + value, 0) / improvements.length : null;
  const responseUsable = outcomes.length >= ANALYSIS_CONFIG.feedback.minimum_uses;
  const cooldownHours = Math.max(0, Number(intervention.recommendation_policy?.cooldown_hours) || 0);
  const elapsedHours = lastUsedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, (now - lastUsedAt) / 3600000);
  return {
    uses: entries.length,
    daily_uses: dailyUses,
    helpful_uses: helpful,
    unhelpful_uses: unhelpful,
    helpful_rate: responseUsable ? helpful / outcomes.length : null,
    response_sample_size: outcomes.length,
    response_quality: outcomes.length >= ANALYSIS_CONFIG.feedback.stable_uses ? 'stable' : responseUsable ? 'usable' : 'insufficient',
    mean_discomfort_improvement: meanImprovement,
    last_used_at: lastUsedAt === null ? null : new Date(lastUsedAt).toISOString(),
    cooldown_hours: cooldownHours,
    cooldown_remaining_hours: Number.isFinite(elapsedHours) ? Math.max(0, cooldownHours - elapsedHours) : 0,
    cooldown_rank: Number.isFinite(elapsedHours) ? elapsedHours / Math.max(1, cooldownHours) : Number.MAX_SAFE_INTEGER
  };
}

function currentStateAvailable(context, matchedFeatures, options) {
  if (typeof options.currentStateAvailable === 'boolean') return options.currentStateAvailable;
  if (typeof context.current_state_available === 'boolean') return context.current_state_available;
  if (typeof context.meta?.current_state_available === 'boolean') return context.meta.current_state_available;
  return matchedFeatures.length > 0;
}

function personalPatternAvailable(context, matchedFeatures, options) {
  if (typeof options.personalPatternAvailable === 'boolean') return options.personalPatternAvailable;
  if (typeof context.personal_pattern_available === 'boolean') return context.personal_pattern_available;
  return matchedFeatures.some((feature) => feature.condition.operator === 'pattern_exists');
}

function contextualBoosts(context, matchedFeatures) {
  const matchedFields = new Set(matchedFeatures.map((feature) => feature.condition.field));
  const combinationMatches = [];
  let combinationBoost = 0;
  for (const [patternId, pattern] of Object.entries(context.care_patterns || {})) {
    if (!pattern?.active) continue;
    const fields = (pattern.fields || []).filter((field) => matchedFields.has(field));
    if (fields.length < 2) continue;
    const boost = Math.min(2, fields.length - 1);
    combinationBoost += boost;
    combinationMatches.push({ pattern_id: patternId, fields, boost });
  }
  const persistenceMatches = [];
  let persistenceBoost = 0;
  for (const [metric, state] of Object.entries(context.persistence || {})) {
    if (!state?.active || !matchedFields.has(metric)) continue;
    const boost = state.consecutive_days >= 7 ? 2 : 1;
    persistenceBoost += boost;
    persistenceMatches.push({ metric, consecutive_days: state.consecutive_days, event_id: state.event_id, boost });
  }
  return {
    combination_boost: Math.min(4, combinationBoost), persistence_boost: Math.min(3, persistenceBoost),
    combination_matches: combinationMatches, persistence_matches: persistenceMatches
  };
}

export function evaluateIntervention(intervention, context = {}, options = {}) {
  const now = asTime(options.now) ?? Date.now();
  const policy = intervention?.recommendation_policy || {};
  const matching = intervention?.matching || {};
  const history = historyStats(intervention || {}, options.history ?? context.intervention_history, now);
  const blocked = [];
  if (intervention?.status !== 'active') blocked.push({ code: 'inactive' });
  if (intervention?.availability !== 'ready') blocked.push({ code: 'unavailable' });
  const safetyActive = getPath(context, 'safety_event.active') === true;
  const safetySafe = intervention?.safety_safe === true || policy.safety_safe === true;
  if (safetyActive && !safetySafe) blocked.push({ code: 'safety_override' });

  const exclusionChecks = (matching.exclusions || []).map((condition) => ({ condition, ...evaluateCondition(condition, context) }));
  for (const check of exclusionChecks) if (check.matched) blocked.push({ code: 'exclusion_matched', condition: check.condition, actual: check.actual });

  const hardRequirementChecks = (matching.hard_requirements || []).map((condition) => ({ condition, ...evaluateCondition(condition, context) }));
  for (const check of hardRequirementChecks) if (!check.matched) blocked.push({ code: check.missing ? 'hard_requirement_missing' : 'hard_requirement_failed', condition: check.condition, actual: check.actual });

  const scoringChecks = (matching.scoring_features || []).map((feature) => {
    const result = evaluateCondition(feature.condition, context);
    return { condition: feature.condition, weight: Number(feature.weight) || 0, ...result };
  });
  const matchedFeatures = scoringChecks.filter((feature) => feature.matched);
  const baseScore = matchedFeatures.reduce((sum, feature) => sum + feature.weight, 0);
  const boosts = contextualBoosts(context, matchedFeatures);
  const score = baseScore + boosts.combination_boost + boosts.persistence_boost;
  const minimumScore = Number(matching.minimum_score) || 0;
  if (score < minimumScore) blocked.push({ code: 'minimum_score_not_met', score, minimum_score: minimumScore });
  if (policy.requires_current_state && !currentStateAvailable(context, matchedFeatures, options)) blocked.push({ code: 'current_state_required' });
  if (policy.requires_personal_pattern && !personalPatternAvailable(context, matchedFeatures, options)) blocked.push({ code: 'personal_pattern_required' });
  if (history.cooldown_remaining_hours > 0) blocked.push({ code: 'cooldown_active', remaining_hours: history.cooldown_remaining_hours });
  const maxDailyUses = Number(policy.max_daily_uses);
  if (finite(maxDailyUses) && history.daily_uses >= maxDailyUses) blocked.push({ code: 'max_daily_uses_reached', max_daily_uses: maxDailyUses });

  const deprioritizeAfter = Number(policy.deprioritize_after_unhelpful_uses);
  const deprioritized = finite(deprioritizeAfter) && deprioritizeAfter > 0 && history.unhelpful_uses >= deprioritizeAfter;
  const priority = Number(policy.recommendation_priority) || 0;
  const feedbackAdjustment = history.response_quality === 'insufficient' ? 0 : history.helpful_rate >= ANALYSIS_CONFIG.feedback.helpful_rate_preference ? 12 : history.helpful_rate < 0.40 ? -12 : 0;
  return {
    intervention_id: intervention?.id || null,
    intervention,
    eligible: blocked.length === 0,
    score,
    base_score: baseScore,
    ...boosts,
    minimum_score: minimumScore,
    matched_features: matchedFeatures,
    scoring_checks: scoringChecks,
    hard_requirement_checks: hardRequirementChecks,
    exclusion_checks: exclusionChecks,
    exclusion_reasons: blocked,
    unknown_safety_fields: exclusionChecks.filter((check) => check.missing && /^(contraindication|medication|state)\./.test(check.condition?.field || '')).map((check) => check.condition.field),
    recommendation_priority: priority,
    effective_priority: priority + feedbackAdjustment - (deprioritized ? 100 : 0),
    personally_helpful_rate: history.helpful_rate,
    feedback_adjustment: feedbackAdjustment,
    deprioritized,
    history,
    evaluated_at: new Date(now).toISOString()
  };
}

function compareCandidates(left, right) {
  return right.score - left.score ||
    right.effective_priority - left.effective_priority ||
    (right.personally_helpful_rate ?? -1) - (left.personally_helpful_rate ?? -1) ||
    right.history.cooldown_rank - left.history.cooldown_rank ||
    left.intervention_id.localeCompare(right.intervention_id);
}

export function rankInterventions(library, context = {}, options = {}) {
  const interventions = Array.isArray(library) ? library : library?.interventions;
  if (!Array.isArray(interventions)) throw new TypeError('Intervention library must contain an interventions array.');
  const evaluated = interventions.map((intervention) => evaluateIntervention(intervention, context, options));
  return {
    library_version: Array.isArray(library) ? null : library.library?.version || null,
    evaluated_at: new Date(asTime(options.now) ?? Date.now()).toISOString(),
    candidates: evaluated.filter((item) => item.eligible).sort(compareCandidates),
    excluded: evaluated.filter((item) => !item.eligible)
  };
}

export function validateInterventionLibrary(library) {
  const errors = [];
  if (!library || typeof library !== 'object') return { valid: false, errors: ['library_not_object'] };
  if (!Array.isArray(library.interventions)) errors.push('interventions_not_array');
  const declared = new Set(Array.isArray(library.condition_operators) ? library.condition_operators : []);
  const ids = new Set();
  for (const [index, intervention] of (library.interventions || []).entries()) {
    if (!intervention?.id) errors.push(`intervention_${index}_missing_id`);
    else if (ids.has(intervention.id)) errors.push(`duplicate_id_${intervention.id}`);
    else ids.add(intervention.id);
    if (!intervention?.matching || !Array.isArray(intervention.matching.scoring_features) || !Array.isArray(intervention.matching.exclusions) || !Array.isArray(intervention.matching.hard_requirements)) errors.push(`${intervention?.id || index}_invalid_matching`);
    const conditions = [...(intervention?.matching?.hard_requirements || []), ...(intervention?.matching?.scoring_features || []).map((item) => item.condition), ...(intervention?.matching?.exclusions || [])];
    for (const condition of conditions) if (!declared.has(condition?.operator)) errors.push(`${intervention?.id || index}_undeclared_operator_${condition?.operator}`);
  }
  return { valid: errors.length === 0, errors, intervention_count: library.interventions?.length || 0 };
}

export async function loadInterventionLibrary(url = './knowledge/interventions.v1.json') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Intervention library load failed: ${response.status}`);
  const library = await response.json();
  const validation = validateInterventionLibrary(library);
  if (!validation.valid) throw new Error(`Intervention library validation failed: ${validation.errors.join(', ')}`);
  return library;
}
