import { stateFeaturesForLog } from './state-cluster-engine.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const datesBetween = (start, end) => { const dates = []; for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date); return dates; };
const confidenceRank = Object.freeze({ stable: 3, moderate: 2, exploratory: 1 });
const fingerprint = (value) => { let hash = 2166136261; for (const char of JSON.stringify(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); };
const round = (value) => Math.round(value * 1000) / 1000;

function combinations(values, size, start = 0, selected = [], output = []) {
  if (selected.length === size) { output.push([...selected]); return output; }
  for (let index = start; index <= values.length - (size - selected.length); index += 1) {
    selected.push(values[index]); combinations(values, size, index + 1, selected, output); selected.pop();
  }
  return output;
}

function stateMap(log) { return new Map(stateFeaturesForLog(log).map((feature) => [feature.key, feature])); }
function allKnown(map, parts) { return parts.every((part) => map.get(part.key)?.state !== null && map.get(part.key)?.state !== undefined); }
function allActive(map, parts) { return parts.every((part) => map.get(part.key)?.state === true); }
function sameDates(a, b) { return a.length === b.length && a.every((date, index) => date === b[index]); }
function jaccard(a, b) { const left = new Set(a), right = new Set(b), intersection = [...left].filter((value) => right.has(value)).length; return intersection / Math.max(1, new Set([...left, ...right]).size); }
function maturity(occurrences, cycles) {
  if (occurrences >= 5 && cycles >= 3) return { key: 'stable', confidence: 'stable' };
  if (occurrences >= 3 && cycles >= 2) return { key: 'emerging', confidence: 'moderate' };
  return { key: 'new', confidence: 'exploratory' };
}
function cycleStarts(periods, asOf) { return [...new Set((periods || []).filter((period) => period?.type === 'period' && period.status !== 'deleted' && period.start <= asOf).map((period) => period.start))].sort(); }
function cycleForDate(date, starts) { return [...starts].reverse().find((start) => start <= date) || null; }
function containsParts(candidate, smaller) { return smaller.every((part) => candidate.some((entry) => entry.key === part.key)); }

export function analyzeTemporalClusters({ logs = {}, periods = [], as_of, config = {} } = {}) {
  const settings = { lookback_days: 90, min_occurrences: 2, min_eligible_pairs: 8, max_today_size: 2, max_tomorrow_size: 2, effect_min: config.pattern?.binary_effect_min ?? 0.15, max_results: 4, ...(config.temporal_clusters || {}) };
  const first = addDays(as_of, -(settings.lookback_days - 1)), lastAnchor = addDays(as_of, -1), anchorDates = datesBetween(first, lastAnchor), starts = cycleStarts(periods, as_of);
  const pairMaps = new Map(), candidates = new Map();
  for (const date of anchorDates) {
    const tomorrow = addDays(date, 1);
    if (!logs[date] || !logs[tomorrow]) continue;
    const todayMap = stateMap(logs[date]), tomorrowMap = stateMap(logs[tomorrow]);
    pairMaps.set(date, { todayMap, tomorrowMap });
    const todayActive = [...todayMap.values()].filter((item) => item.state === true), tomorrowActive = [...tomorrowMap.values()].filter((item) => item.state === true);
    for (let todaySize = 1; todaySize <= Math.min(settings.max_today_size, todayActive.length); todaySize += 1) for (let tomorrowSize = 1; tomorrowSize <= Math.min(settings.max_tomorrow_size, tomorrowActive.length); tomorrowSize += 1) {
      for (const todayParts of combinations(todayActive, todaySize)) for (const tomorrowParts of combinations(tomorrowActive, tomorrowSize)) {
        const todaySorted = [...todayParts].sort((a, b) => a.key.localeCompare(b.key)), tomorrowSorted = [...tomorrowParts].sort((a, b) => a.key.localeCompare(b.key));
        const key = `${todaySorted.map((part) => part.key).join('|')}=>${tomorrowSorted.map((part) => part.key).join('|')}`;
        if (!candidates.has(key)) candidates.set(key, { key, todayParts: todaySorted, tomorrowParts: tomorrowSorted });
      }
    }
  }
  const evaluated = [];
  for (const candidate of candidates.values()) {
    const eligible = [], exposed = [], hits = [], unexposed = [], unexposedHits = [];
    for (const [date, maps] of pairMaps) {
      if (!allKnown(maps.todayMap, candidate.todayParts) || !allKnown(maps.tomorrowMap, candidate.tomorrowParts)) continue;
      eligible.push(date);
      const todayActive = allActive(maps.todayMap, candidate.todayParts), tomorrowActive = allActive(maps.tomorrowMap, candidate.tomorrowParts);
      if (todayActive) { exposed.push(date); if (tomorrowActive) hits.push(date); }
      else { unexposed.push(date); if (tomorrowActive) unexposedHits.push(date); }
    }
    if (eligible.length < settings.min_eligible_pairs || hits.length < settings.min_occurrences || !exposed.length || !unexposed.length) continue;
    const exposedRate = hits.length / exposed.length, unexposedRate = unexposedHits.length / unexposed.length, effect = exposedRate - unexposedRate;
    if (effect < settings.effect_min) continue;
    evaluated.push({ ...candidate, eligible, exposed, hits, exposedRate, unexposedRate, effect });
  }
  evaluated.sort((a, b) => b.todayParts.length + b.tomorrowParts.length - a.todayParts.length - a.tomorrowParts.length || b.hits.length - a.hits.length || b.effect - a.effect || a.key.localeCompare(b.key));
  const closed = evaluated.filter((candidate) => !evaluated.some((other) => other !== candidate && other.todayParts.length >= candidate.todayParts.length && other.tomorrowParts.length >= candidate.tomorrowParts.length && other.todayParts.length + other.tomorrowParts.length > candidate.todayParts.length + candidate.tomorrowParts.length && containsParts(other.todayParts, candidate.todayParts) && containsParts(other.tomorrowParts, candidate.tomorrowParts) && sameDates(other.hits, candidate.hits)));
  const generatedAt = new Date().toISOString();
  const ranked = closed.map((candidate) => {
    const cycles = new Set(candidate.hits.map((date) => cycleForDate(date, starts)).filter(Boolean)), stage = maturity(candidate.hits.length, cycles.size);
    const todayKeys = candidate.todayParts.map((part) => part.key), tomorrowKeys = candidate.tomorrowParts.map((part) => part.key);
    const timeline = anchorDates.slice(-28).map((date) => {
      const maps = pairMaps.get(date);
      if (!maps || !allKnown(maps.todayMap, candidate.todayParts) || !allKnown(maps.tomorrowMap, candidate.tomorrowParts)) return { date, tomorrow: addDays(date, 1), state: 'missing', todayActive: null, tomorrowActive: null };
      const todayActive = allActive(maps.todayMap, candidate.todayParts), tomorrowActive = allActive(maps.tomorrowMap, candidate.tomorrowParts);
      return { date, tomorrow: addDays(date, 1), state: todayActive && tomorrowActive ? 'hit' : todayActive ? 'exposed' : 'recorded', todayActive, tomorrowActive };
    });
    return Object.freeze({
      id: `insight:temporal_cluster:${fingerprint({ todayKeys, tomorrowKeys })}`, type: 'temporal_cluster', title: '这些状态后，次日更常记录到另一组状态',
      observation: { metric: tomorrowKeys.join(':'), sampleSize: candidate.eligible.length, validDays: candidate.eligible.length, cyclesCovered: cycles.size, exposedRate: round(candidate.exposedRate), unexposedRate: round(candidate.unexposedRate), effectSizeRaw: round(candidate.effect), effectSizeType: 'proportion_difference', supportingData: { relation: 'next_day_cluster', todayFeatures: candidate.todayParts.map(({ key, label, icon }) => ({ key, label, icon })), tomorrowFeatures: candidate.tomorrowParts.map(({ key, label, icon }) => ({ key, label, icon })), occurrenceCount: candidate.hits.length, exposedDays: candidate.exposed.length, eligiblePairs: candidate.eligible.length, occurrenceDates: [...candidate.hits], tomorrowDates: candidate.hits.map((date) => addDays(date, 1)), exposedRate: round(candidate.exposedRate), baselineRate: round(candidate.unexposedRate), timeline, maturity: stage.key, lastSupportedDate: candidate.hits.at(-1) || null } },
      confidenceLevel: stage.confidence, action: { type: 'observation', matchedInterventionIds: [], observationAction: null }, status: 'active', generatedAt, lastRecomputedAt: generatedAt
    });
  }).sort((a, b) => confidenceRank[b.confidenceLevel] - confidenceRank[a.confidenceLevel] || b.observation.supportingData.todayFeatures.length + b.observation.supportingData.tomorrowFeatures.length - a.observation.supportingData.todayFeatures.length - a.observation.supportingData.tomorrowFeatures.length || b.observation.effectSizeRaw - a.observation.effectSizeRaw || b.observation.supportingData.occurrenceCount - a.observation.supportingData.occurrenceCount || a.id.localeCompare(b.id));
  const selected = [];
  for (const item of ranked) {
    const features = [...item.observation.supportingData.todayFeatures.map((part) => `t:${part.key}`), ...item.observation.supportingData.tomorrowFeatures.map((part) => `n:${part.key}`)], dates = item.observation.supportingData.occurrenceDates;
    const redundant = selected.some((existing) => jaccard(features, [...existing.observation.supportingData.todayFeatures.map((part) => `t:${part.key}`), ...existing.observation.supportingData.tomorrowFeatures.map((part) => `n:${part.key}`)]) >= 0.60 && jaccard(dates, existing.observation.supportingData.occurrenceDates) >= 0.50);
    if (!redundant) selected.push(item);
    if (selected.length >= settings.max_results) break;
  }
  return Object.freeze(selected);
}

export const TemporalClusterEngine = Object.freeze({ analyze: analyzeTemporalClusters });
