export const ANALYSIS_CONFIG = Object.freeze({
  quality_levels: Object.freeze({
    limited_completion_rate: 0.40,
    usable_completion_rate: 0.60,
    good_completion_rate: 0.80
  }),
  contexts: Object.freeze({
    rolling_30d: Object.freeze({ total_days: 30, min_valid_days: 14, min_completion_rate: 0 }),
    rolling_90d: Object.freeze({ total_days: 90, min_valid_days: 30, min_completion_rate: 0 }),
    cycle_phase: Object.freeze({ min_valid_days: 1, min_completion_rate: 0.60, min_complete_cycles: 3 }),
    recent_cycles: Object.freeze({ min_valid_days: 14, min_completion_rate: 0, min_complete_cycles: 3, cycle_count: 3 }),
    comparison_segment: Object.freeze({ min_valid_days: 7, min_completion_rate: 0.60 }),
    event_current: Object.freeze({ min_valid_days: 1, min_completion_rate: 1 }),
    event_persistence: Object.freeze({ min_valid_days: 3, min_completion_rate: 1 }),
    event_recent_30d: Object.freeze({ min_valid_days: 14, min_completion_rate: 0 }),
    pattern_window: Object.freeze({ min_valid_days: 4, min_completion_rate: 0.60, min_complete_cycles: 2 }),
    association: Object.freeze({ min_valid_days: 14, min_completion_rate: 0.60 })
  }),
  baseline: Object.freeze({ aggregation: 'median' }),
  events: Object.freeze({
    deviation_min_absolute_difference: 1,
    persistence_min_days: 3,
    recently_first_recorded_lookback_days: 30,
    states: Object.freeze({
      sleep_quality: Object.freeze({ operator: 'lte', value: 2 }),
      stress: Object.freeze({ operator: 'gte', value: 4 }),
      pain_max: Object.freeze({ operator: 'gt', value: 0 }),
      bowel: Object.freeze({ operator: 'eq', value: false })
    })
  }),
  patterns: Object.freeze({
    cycle_pattern_min_complete_cycles: 2,
    association_min_pairs: 14,
    detected_effect_size: 0.20
  })
});

export const METRIC_DEFINITIONS = Object.freeze({
  mood: Object.freeze({ field: 'mood', status_field: 'mood', type: 'number' }),
  energy: Object.freeze({ field: 'energy', status_field: 'energy', type: 'number' }),
  sleep: Object.freeze({ field: 'sleep', status_field: 'sleep', type: 'number' }),
  bowel: Object.freeze({ field: 'bowelMovement', status_field: 'bowelMovement', type: 'boolean' }),
  pain: Object.freeze({ field: 'pain', status_field: 'pain', type: 'number' }),
  activity: Object.freeze({ field: 'activity', status_field: 'activity', type: 'number' }),
  stress: Object.freeze({ field: 'stress', status_field: 'stress', type: 'number' }),
  social_intensity: Object.freeze({ field: 'socialIntensity', status_field: 'socialIntensity', type: 'number' }),
  activity_level: Object.freeze({ field: 'activity', status_field: 'activity', type: 'number' }),
  sleep_quality: Object.freeze({ field: 'sleep', status_field: 'sleep', type: 'number' }),
  pain_max: Object.freeze({ field: 'pain', status_field: 'pain', type: 'number' })
});

export const BASELINE_METRICS = Object.freeze([
  'energy', 'stress', 'activity_level', 'social_intensity', 'sleep_quality', 'pain_max'
]);
