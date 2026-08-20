import { analysisFingerprint } from './analysis-orchestrator.js';

const CACHE_KEY = 'period-insights-cache-v2';

function signature(input, configVersion) {
  return analysisFingerprint({ configVersion, logs: input.logs || {}, periods: input.periods || [], asOf: input.as_of, nextStart: input.next_start || null, predictionConfidence: input.prediction_confidence || null, interventionUsage: input.intervention_usage || [] });
}

export function readInsightsSnapshot(input, configVersion, storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(CACHE_KEY) || 'null'); return value?.signature === signature(input, configVersion) ? value.data : null; } catch { return null; }
}

export function writeInsightsSnapshot(input, configVersion, data, storage = globalThis.localStorage) {
  storage.setItem(CACHE_KEY, JSON.stringify({ signature: signature(input, configVersion), data, cachedAt: new Date().toISOString() }));
  return data;
}

export function readLatestInsightsSnapshot(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(CACHE_KEY) || 'null'); return value?.data || null; } catch { return null; }
}

export const InsightsRepository = Object.freeze({ read: readInsightsSnapshot, readLatest: readLatestInsightsSnapshot, write: writeInsightsSnapshot });
