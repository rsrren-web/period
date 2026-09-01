export const ANALYSIS_CONFIG = Object.freeze({
  quality_levels: Object.freeze({
    limited_completion_rate: 0.40,
    usable_completion_rate: 0.60,
    good_completion_rate: 0.80
  }),
  contexts: Object.freeze({
    rolling_30d: Object.freeze({ total_days: 30, min_valid_days: 14, min_completion_rate: 0 }),
    rolling_90d: Object.freeze({ total_days: 90, min_valid_days: 30, min_completion_rate: 0 }),
    cycle_phase: Object.freeze({ min_valid_days: 1, min_completion_rate: 0.60, min_complete_cycles: 2 }),
    recent_cycles: Object.freeze({ min_valid_days: 14, min_completion_rate: 0, min_complete_cycles: 2, cycle_count: 3 }),
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
    deviation_robust_z_threshold: 1.5,
    deviation_cooldown_days: 3,
    persistence_min_days: 3,
    recently_first_recorded_lookback_days: 30,
    metric_rules: Object.freeze({
      energy: Object.freeze({ concerning_direction: 'lower', minimum_difference: 1 }),
      stress: Object.freeze({ concerning_direction: 'higher', minimum_difference: 1 }),
      activity_level: Object.freeze({ concerning_direction: 'lower', minimum_difference: 1 }),
      social_intensity: Object.freeze({ concerning_direction: 'either', minimum_difference: 1 }),
      sleep_quality: Object.freeze({ concerning_direction: 'lower', minimum_difference: 1 }),
      pain_max: Object.freeze({ concerning_direction: 'higher', minimum_difference: 1 })
    }),
    states: Object.freeze({
      sleep_quality: Object.freeze({ operator: 'lte', value: 2 }),
      stress: Object.freeze({ operator: 'gte', value: 4 }),
      pain_max: Object.freeze({ operator: 'gt', value: 0 }),
      bowel: Object.freeze({ operator: 'eq', value: false }),
      bloating: Object.freeze({ operator: 'eq', value: true }),
      body_heaviness: Object.freeze({ operator: 'eq', value: true }),
      cold_sensation: Object.freeze({ operator: 'eq', value: true }),
      appetite_low: Object.freeze({ operator: 'eq', value: true }),
      stool_hard: Object.freeze({ operator: 'eq', value: true }),
      stool_loose: Object.freeze({ operator: 'eq', value: true }),
      stool_sticky: Object.freeze({ operator: 'eq', value: true }),
      no_bowel_movement: Object.freeze({ operator: 'eq', value: true }),
      sleep_onset_difficulty: Object.freeze({ operator: 'eq', value: true }),
      sleep_fragmentation: Object.freeze({ operator: 'eq', value: true }),
      early_waking: Object.freeze({ operator: 'eq', value: true }),
      unrefreshed_sleep: Object.freeze({ operator: 'eq', value: true })
    })
  }),
  patterns: Object.freeze({
    cycle_pattern_min_complete_cycles: 2,
    association_min_pairs: 14,
    detected_effect_size: 0.20,
    minimum_exposed_days: 5,
    minimum_unexposed_days: 5,
    phase_stratum_min_pairs: 4
  }),
  tcm: Object.freeze({ observed_min_cycles: 2, stable_min_cycles: 3, stable_support_rate: 0.60 }),
  feedback: Object.freeze({ minimum_uses: 3, stable_uses: 5, helpful_rate_preference: 0.60 }),
  incremental: Object.freeze({ schema_version: 2, max_event_history: 120 }),
  recommendations: Object.freeze({
    max_items: 2,
    supported_confidence: Object.freeze(['medium', 'high']),
    stable_confidence: 'high',
    stable_min_cycles: 3,
    source_priority: Object.freeze({ current_discomfort: 3, health_event: 3, personal_pattern: 2, cycle_pattern: 1 }),
    cycle_windows: Object.freeze({
      period: Object.freeze({ start_day: 1, end_offset: -22 }),
      follicular: Object.freeze({ start_day: 8, end_offset: -12 }),
      ovulation: Object.freeze({ start_offset: -11, end_offset: -7 }),
      pms: Object.freeze({ start_offset: -6, end_offset: 0 })
    })
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
  pain_max: Object.freeze({ field: 'pain', status_field: 'pain', type: 'number' }),
  bloating: Object.freeze({ source: 'tcm', field: 'bloating', type: 'presence' }),
  body_heaviness: Object.freeze({ source: 'tcm', field: 'body_heaviness', type: 'presence' }),
  cold_sensation: Object.freeze({ source: 'tcm', field: 'cold_sensation', type: 'presence' }),
  appetite_low: Object.freeze({ source: 'tcm', field: 'poor_appetite', type: 'presence' }),
  stool_hard: Object.freeze({ source: 'detail_single', field: 'bowel', value: 'hard', type: 'boolean' }),
  stool_loose: Object.freeze({ source: 'detail_single', field: 'bowel', value: 'loose', type: 'boolean' }),
  stool_sticky: Object.freeze({ source: 'detail_single', field: 'bowel', value: 'sticky', type: 'boolean' }),
  no_bowel_movement: Object.freeze({ source: 'detail_single', field: 'bowel', value: 'not_passed', type: 'boolean' }),
  sleep_onset_difficulty: Object.freeze({ source: 'detail_multi', field: 'sleep_issue', value: 'sleep_onset', type: 'boolean' }),
  sleep_fragmentation: Object.freeze({ source: 'detail_multi', field: 'sleep_issue', value: 'waking', type: 'boolean' }),
  early_waking: Object.freeze({ source: 'detail_multi', field: 'sleep_issue', value: 'early_waking', type: 'boolean' }),
  unrefreshed_sleep: Object.freeze({ source: 'detail_multi', field: 'sleep_issue', value: 'unrefreshed', type: 'boolean' })
});

export const BASELINE_METRICS = Object.freeze([
  'energy', 'stress', 'activity_level', 'social_intensity', 'sleep_quality', 'pain_max'
]);
