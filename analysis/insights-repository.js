const CACHE_KEY = 'period-insights-cache-v1';

function signature(input, configVersion) {
  const logEntries = Object.entries(input.logs || {}), lastLog = logEntries.sort(([a], [b]) => a.localeCompare(b)).at(-1);
  const periods = input.periods || [], lastPeriod = periods.at(-1);
  return JSON.stringify({ configVersion, logCount: logEntries.length, lastLog: lastLog ? [lastLog[0], lastLog[1]?.updatedAt] : null, periodCount: periods.length, lastPeriod: lastPeriod ? [lastPeriod.start, lastPeriod.end, lastPeriod.updatedAt] : null, asOf: input.as_of });
}

export function readInsightsSnapshot(input, configVersion, storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(CACHE_KEY) || 'null'); return value?.signature === signature(input, configVersion) ? value.data : null; } catch { return null; }
}

export function writeInsightsSnapshot(input, configVersion, data, storage = globalThis.localStorage) {
  storage.setItem(CACHE_KEY, JSON.stringify({ signature: signature(input, configVersion), data, cachedAt: new Date().toISOString() }));
  return data;
}

export const InsightsRepository = Object.freeze({ read: readInsightsSnapshot, write: writeInsightsSnapshot });
