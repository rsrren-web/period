# Data quality and baseline engines v1

## Processing order

`Daily records → DataQualityEngine → BaselineEngine`

The baseline engine does not create health advice, diagnoses, pattern statements, comparisons, or deviation events. A baseline is returned as `unavailable` when its metric-specific quality result is `insufficient`.

## Missing values

- `null`, an absent field, or `fieldStatus = not_recorded` means not recorded and is excluded from denominators of valid observations.
- Numeric `0` is a valid explicit observation.
- Boolean `false` is a valid explicit observation; for example, explicitly recording no bowel movement is distinct from not recording bowel status.
- Completion is calculated independently for mood, energy, sleep, bowel, pain, activity, and any requested supported metric.

## Central configuration

All v1 thresholds are in `analysis/analysis-config.js`. No engine duplicates threshold literals.

- 30-day baseline: at least 14 valid days.
- Cycle-phase analysis: at least 60% completion for the target metric.
- Cross-cycle baseline: at least three complete cycles.
- Two-period comparison: each period independently needs at least seven valid days and 60% completion.
- Quality labels: `insufficient`, `limited`, `usable`, and `good`.

Every quality result includes `valid_days`, `total_days`, `completion_rate`, `quality_level`, and `reasons`.

## Baseline snapshots

Six metrics are supported: energy, stress, activity level, social intensity, sleep quality, and maximum pain. Each snapshot contains rolling 30-day, rolling 90-day, recent-cycle, and current-phase baselines. Available and unavailable baseline records both preserve the required metadata.

Snapshots are append-only in `period-baseline-snapshots-v1`. A deterministic input fingerprint prevents duplicate snapshots from the same input while changed data creates a new version. JSON backup export/import includes the complete snapshot history.

## Structured health events

`HealthEventEngine` creates only `deviation`, `persistence`, and `recently_first_recorded` objects. Deviation requires an available `usable` or `good` baseline. Persistence requires consecutive explicitly recorded values; a missing day breaks the sequence. Recently-first-recorded requires the configured 30-day lookback coverage before it may return an event. No event contains advice, medical interpretation, or causal wording.

## Structured patterns

`PatternEngine` supports cycle-window comparisons, co-occurrence, and same-day/next-day/previous-day temporal associations. Cycle patterns require at least two complete cycles and compare the target window with the remaining cycle days. Association outputs preserve both conditional probabilities and their difference. Every result contains sample size, covered cycles, effect size, confidence, status, and its metric-specific data-quality evidence. Co-occurrence and temporal ordering are not treated as causation.
