import { ANALYSIS_CONFIG, BASELINE_METRICS } from './analysis-config.js';
import { calculateMetricBaselines } from './baseline-engine.js';
import { detectDeviation, detectPersistence, detectRecentlyFirstRecorded } from './health-event-engine.js';
import { analyzeCyclePattern, analyzeTemporalAssociation, createCyclePatternContext } from './pattern-engine.js';

const DAY = 86_400_000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);

function currentWindow(phase = {}) {
  const center = Math.max(24, Number(phase.center) || 29), config = ANALYSIS_CONFIG.recommendations.cycle_windows[phase.key];
  if (!config) return null;
  const start = config.start_day ?? center + config.start_offset;
  const end = config.end_day ?? center + config.end_offset;
  return { start_day: Math.max(1, start), end_day: Math.max(Math.max(1, start), end) };
}

export function buildRecommendationEvidence({ logs = {}, periods = [], phase = {}, record_date, baseline_snapshot, prior_events = [], phase_for_date } = {}) {
  const previous = addDays(record_date, -1), healthEvents = [];
  for (const metric of BASELINE_METRICS) {
    try {
      const baseline = baseline_snapshot?.baselines?.[metric]?.rolling_30d || calculateMetricBaselines({ logs, periods, metric, as_of: previous }).rolling_30d;
      const event = detectDeviation({ logs, metric, date: record_date, baseline, prior_events });
      if (event) healthEvents.push(event);
    } catch { /* An unavailable metric must not block the remaining evidence. */ }
  }
  for (const metric of ['sleep_quality', 'stress', 'pain_max', 'bowel', 'bloating', 'body_heaviness', 'cold_sensation', 'appetite_low', 'stool_hard', 'stool_loose', 'stool_sticky', 'no_bowel_movement', 'sleep_onset_difficulty', 'sleep_fragmentation', 'early_waking', 'unrefreshed_sleep']) {
    try { const event = detectPersistence({ logs, metric, date: record_date }); if (event) healthEvents.push(event); } catch { /* no configured/recorded evidence */ }
    try { const event = detectRecentlyFirstRecorded({ logs, metric, date: record_date }); if (event) healthEvents.push(event); } catch { /* no configured/recorded evidence */ }
  }

  const patterns = [], window = currentWindow(phase);
  const cycleContext=window?createCyclePatternContext({periods,as_of:record_date,target_window:window}):null;
  if (window) for (const metric of BASELINE_METRICS) {
    try { patterns.push(analyzeCyclePattern({ logs, periods, metric, as_of: record_date, target_window: window, cycle_context:cycleContext })); } catch { /* insufficient/invalid source */ }
  }
  const start = addDays(record_date, -89);
  const specs = [
    ['stress', 'sleep_quality', 'next_day', { operator: 'gte', value: 4 }, { operator: 'lte', value: 2 }],
    ['sleep_quality', 'energy', 'next_day', { operator: 'lte', value: 2 }, { operator: 'lte', value: 2 }],
    ['activity_level', 'energy', 'next_day', { operator: 'lte', value: 2 }, { operator: 'lte', value: 2 }],
    ['pain_max', 'sleep_quality', 'same_day', { operator: 'gt', value: 0 }, { operator: 'lte', value: 2 }]
  ];
  for (const [metric_a, metric_b, relation, condition_a, condition_b] of specs) {
    try { patterns.push(analyzeTemporalAssociation({ logs, periods, metric_a, metric_b, start, end: record_date, relation, condition_a, condition_b, phase_for_date })); } catch { /* insufficient/invalid source */ }
  }
  return { health_events: healthEvents, patterns, target_window: window };
}

export const RecommendationPipeline = Object.freeze({ buildRecommendationEvidence });
