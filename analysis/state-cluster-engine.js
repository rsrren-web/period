import { buildCareContext } from './care-context.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const datesBetween = (start, end) => { const dates = []; for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date); return dates; };
const fingerprint = (value) => { let hash = 2166136261; for (const char of JSON.stringify(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); };
const confidenceRank = Object.freeze({ stable: 3, moderate: 2, exploratory: 1 });

const FEATURES = Object.freeze([
  { key: 'bedtime_late', label: '23点后入睡', icon: '🌙', context: 'late_sleep' },
  { key: 'mood_low', label: '情绪较低', icon: '🌧️', test: (log) => log.mood == null ? null : Number(log.mood) <= 2 },
  { key: 'energy_low', label: '精力较低', icon: '🔋', test: (log) => log.energy == null ? null : Number(log.energy) <= 2 },
  { key: 'stress_high', label: '压力较高', icon: '😣', test: (log) => log.stress == null ? null : Number(log.stress) >= 4 },
  { key: 'sleep_low', label: '睡眠较差', icon: '😴', test: (log) => log.sleep == null ? null : Number(log.sleep) <= 2 },
  { key: 'pain_present', label: '身体疼痛', icon: '🩹', test: (log) => log.pain == null ? null : Number(log.pain) > 0 },
  { key: 'activity_low', label: '活动较少', icon: '🛋️', test: (log) => log.activity == null ? null : Number(log.activity) <= 2 },
  { key: 'bowel_no', label: '没有排便', icon: '🚽', context: 'no_bowel_movement' },
  { key: 'bloating_high', label: '腹胀', icon: '🫧', context: 'bloating' },
  { key: 'nausea_present', label: '恶心', icon: '🤢', context: 'nausea' },
  { key: 'diarrhea_present', label: '腹泻', icon: '🚻', context: 'diarrhea' },
  { key: 'appetite_low', label: '食欲较差', icon: '🍚', context: 'appetite_low' },
  { key: 'body_heaviness', label: '身体沉重', icon: '🪨', context: 'body_heaviness' },
  { key: 'cold_sensation', label: '明显怕冷', icon: '🥶', context: 'cold_sensation' },
  { key: 'cold_hands_feet', label: '手脚冷', icon: '🧊', context: 'cold_hands_feet' },
  { key: 'sleep_fragmentation', label: '夜间易醒', icon: '🌘', context: 'sleep_fragmentation' },
  { key: 'unrefreshed_sleep', label: '睡够仍累', icon: '🥱', context: 'unrefreshed_sleep' },
  { key: 'stool_hard', label: '排便干硬', icon: '🚽', context: 'stool_hard' },
  { key: 'stool_loose', label: '排便稀软', icon: '🚽', context: 'stool_loose' },
  { key: 'pain_cold', label: '冷痛', icon: '❄️', context: 'pain_quality.cold' },
  { key: 'pain_distending', label: '胀痛', icon: '🫧', context: 'pain_quality.distending' }
]);

function combinations(values, size, start = 0, selected = [], output = []) {
  if (selected.length === size) { output.push([...selected]); return output; }
  for (let index = start; index <= values.length - (size - selected.length); index += 1) {
    selected.push(values[index]); combinations(values, size, index + 1, selected, output); selected.pop();
  }
  return output;
}

const contextValue = (context, path) => path.split('.').reduce((value, part) => value?.[part], context);

export function stateFeaturesForLog(log, recordDate) {
  if (!log) return FEATURES.map(({ key, label, icon }) => ({ key, label, icon, state: null }));
  const care = buildCareContext({ log, record_date: recordDate }), evidence = care.evidence;
  return FEATURES.map((feature) => {
    if (!feature.context) return { key: feature.key, label: feature.label, icon: feature.icon, state: feature.test(log) };
    const value = contextValue(care.context, feature.context), isKnown = Array.isArray(evidence[feature.context]) && evidence[feature.context].length > 0;
    return { key: feature.key, label: feature.label, icon: feature.icon, state: isKnown ? value === true : null };
  });
}

function activeFeatures(log, date) { return stateFeaturesForLog(log, date).filter((feature) => feature.state === true); }

function cycleStarts(periods, asOf) {
  return [...new Set((periods || []).filter((period) => period?.type === 'period' && period.status !== 'deleted' && period.start <= asOf).map((period) => period.start))].sort();
}

function cycleForDate(date, starts) {
  return [...starts].reverse().find((start) => start <= date) || null;
}

function phaseForDate(date, periods, starts) {
  if ((periods || []).some((period) => period?.type === 'period' && period.status !== 'deleted' && date >= period.start && date <= period.end)) return 'menstrual';
  const next = starts.find((start) => start > date);
  if (!next) return 'follicular';
  if (date >= addDays(next, -16) && date <= addDays(next, -12)) return 'ovulatory_window';
  if (date >= addDays(next, -11)) return 'luteal';
  return 'follicular';
}

function sameDates(a, b) {
  return a.length === b.length && a.every((date, index) => date === b[index]);
}

function jaccard(a, b) {
  const left = new Set(a), right = new Set(b), intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
}

function maturity(occurrences, cycles) {
  if (occurrences >= 5 && cycles >= 3) return { key: 'stable', confidence: 'stable' };
  if (occurrences >= 3 && cycles >= 2) return { key: 'emerging', confidence: 'moderate' };
  return { key: 'new', confidence: 'exploratory' };
}

export function analyzeStateClusters({ logs = {}, periods = [], as_of, config = {} } = {}) {
  const settings = { lookback_days: 90, min_occurrences: 2, max_size: 4, max_results: 4, ...(config.state_clusters || {}) };
  const start = addDays(as_of, -(settings.lookback_days - 1)), dates = datesBetween(start, as_of), starts = cycleStarts(periods, as_of);
  const activeByDate = new Map(), eligibleDates = [];
  for (const date of dates) {
    if (!logs[date]) continue;
    eligibleDates.push(date);
    activeByDate.set(date, activeFeatures(logs[date], date));
  }
  const candidates = new Map();
  for (const date of eligibleDates) {
    const features = activeByDate.get(date);
    for (let size = 2; size <= Math.min(settings.max_size, features.length); size += 1) {
      for (const parts of combinations(features, size)) {
        const key = parts.map((part) => part.key).sort().join('|');
        const candidate = candidates.get(key) || { key, parts: [...parts].sort((a, b) => a.key.localeCompare(b.key)), dates: [] };
        candidate.dates.push(date); candidates.set(key, candidate);
      }
    }
  }
  const supported = [...candidates.values()].filter((item) => item.dates.length >= settings.min_occurrences)
    .sort((a, b) => b.parts.length - a.parts.length || b.dates.length - a.dates.length || a.key.localeCompare(b.key));
  const closed = supported.filter((candidate) => !supported.some((other) => other.parts.length > candidate.parts.length && candidate.parts.every((part) => other.parts.some((entry) => entry.key === part.key)) && sameDates(candidate.dates, other.dates)));
  const seenDateSets = new Set(), distinct = closed.filter((candidate) => { const key = candidate.dates.join('|'); if (seenDateSets.has(key)) return false; seenDateSets.add(key); return true; });
  const ranked = distinct.map((candidate) => {
    const cycles = new Set(candidate.dates.map((date) => cycleForDate(date, starts)).filter(Boolean));
    const phaseCounts = { menstrual: 0, follicular: 0, ovulatory_window: 0, luteal: 0 };
    candidate.dates.forEach((date) => { phaseCounts[phaseForDate(date, periods, starts)] += 1; });
    const dominantPhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0];
    const stage = maturity(candidate.dates.length, cycles.size), featureKeys = candidate.parts.map((part) => part.key);
    const timeline = dates.slice(-28).map((date) => ({ date, state: candidate.dates.includes(date) ? 'hit' : logs[date] ? 'recorded' : 'missing' }));
    const supportRate = eligibleDates.length ? candidate.dates.length / eligibleDates.length : 0;
    return Object.freeze({
      id: `insight:state_cluster:${fingerprint(featureKeys)}`, type: 'state_cluster', title: '这些状态常在同一天出现',
      observation: { metric: featureKeys.join(':'), sampleSize: candidate.dates.length, validDays: eligibleDates.length, cyclesCovered: cycles.size, exposedRate: supportRate, unexposedRate: 0, effectSizeRaw: supportRate, effectSizeType: 'support_rate', supportingData: { constituentFeatures: candidate.parts.map(({ key, label, icon }) => ({ key, label, icon })), occurrenceCount: candidate.dates.length, occurrenceDates: [...candidate.dates], eligibleDays: eligibleDates.length, supportRate, phaseCounts, dominantPhase: dominantPhase[1] ? dominantPhase[0] : null, dominantPhaseCount: dominantPhase[1], timeline, maturity: stage.key, lastSupportedDate: candidate.dates.at(-1) || null } },
      confidenceLevel: stage.confidence, action: { type: 'observation', matchedInterventionIds: [], observationAction: null }, status: 'active', generatedAt: new Date().toISOString(), lastRecomputedAt: new Date().toISOString()
    });
  }).sort((a, b) => confidenceRank[b.confidenceLevel] - confidenceRank[a.confidenceLevel] || b.observation.supportingData.constituentFeatures.length - a.observation.supportingData.constituentFeatures.length || b.observation.supportingData.occurrenceCount - a.observation.supportingData.occurrenceCount || a.id.localeCompare(b.id));
  const selected = [];
  for (const item of ranked) {
    const features = item.observation.supportingData.constituentFeatures.map((part) => part.key), occurrenceDates = item.observation.supportingData.occurrenceDates;
    const redundant = selected.some((existing) => jaccard(features, existing.observation.supportingData.constituentFeatures.map((part) => part.key)) >= 0.60 && jaccard(occurrenceDates, existing.observation.supportingData.occurrenceDates) >= 0.50);
    if (!redundant) selected.push(item);
    if (selected.length >= settings.max_results) break;
  }
  return Object.freeze(selected);
}

export const StateClusterEngine = Object.freeze({ analyze: analyzeStateClusters, features: FEATURES, statesForLog: stateFeaturesForLog });
