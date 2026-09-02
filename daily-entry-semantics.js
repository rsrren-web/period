const hasValue = (value) => value !== null && value !== undefined && value !== '';

export function resolveScalar({ prior = null, submitted = null, touched = false, parse = (value) => value } = {}) {
  if (!touched) return hasValue(prior) ? prior : null;
  if (!hasValue(submitted)) return null;
  const value = parse(submitted);
  return value === undefined || Number.isNaN(value) ? null : value;
}

export function resolveList({ prior = null, selected = [], touched = false, confirmedNone = false } = {}) {
  if (!touched) return Array.isArray(prior) ? [...prior] : null;
  const values = [...new Set((Array.isArray(selected) ? selected : []).filter(hasValue))];
  if (values.length) return values;
  return confirmedNone ? [] : null;
}

export function resolvePresenceGroup({ prior = {}, fields = [], selected = [], touched = false, confirmedNone = false } = {}) {
  if (!touched) return Object.fromEntries(fields.map((field) => [field, prior[field] ?? null]));
  const active = new Set(selected);
  return Object.fromEntries(fields.map((field) => [field, confirmedNone ? 'no' : active.has(field) ? 'yes' : null]));
}

export function resolvedStatus(value, { priorStatus = null, touched = false } = {}) {
  if (!touched) return priorStatus || (hasValue(value) ? 'reported' : 'not_recorded');
  return value === null || value === undefined ? 'not_recorded' : 'reported';
}

export const DailyEntrySemantics = Object.freeze({ resolveScalar, resolveList, resolvePresenceGroup, resolvedStatus });
