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

## Intervention matching and ranking

The versioned intervention library is stored at `knowledge/interventions.v1.json`. `InterventionEngine` validates the library and supports every declared condition operator. A missing value never becomes `false`, `0`, or a negative match; only the explicit `not_exists` operator matches absence.

Evaluation order is fixed: active/ready and safety override, explicit exclusions, all hard requirements, weighted scoring and minimum score, current-state/personal-pattern requirements, cooldown and daily-use limits. Eligible candidates are then sorted deterministically by matching score, adjusted recommendation priority, personal helpful rate, cooldown age, and intervention ID. Repeated unhelpful outcomes lower effective priority but do not rewrite the library score. The result retains every condition check and exclusion reason for auditing.

## Evidence-gated recommendations

`RecommendationGate` permits matching only when at least one traceable source exists: a valid deviation/persistence event, an active supported cycle window, a supported/stable temporal association, or an explicitly recorded discomfort that the library can address. Pattern objects now have deterministic `pattern_id` values. `medium` and `high` confidence are supported; `high` confidence across at least three cycles is stable.

`RecommendationContextAdapter` maps only explicitly recorded daily fields to intervention fields. Missing values remain missing. `RecommendationEngine` links every candidate back to its primary and supporting evidence, applies the intervention matcher and exclusions, returns at most two non-duplicate targets, and never backfills. A no-evidence or no-safe-match result is a structured `NO_RECOMMENDATION`. The homepage traditional-care plan now renders this result instead of selecting a random phase item.

## Unified orchestration and incremental snapshots

`AnalysisOrchestrator` is the single execution order for the homepage and trends page: metric quality, personal baselines, health events, patterns, TCM observation clusters, recommendations, and feedback summaries. The baseline cutoff is the day before the current observation, so today's value is never included in its own comparison baseline. Each section has a deterministic content fingerprint; unchanged core data is reused, feedback-only changes recompute only feedback and recommendations, and editing any historical record invalidates the relevant core snapshot.

Every event, pattern, TCM cluster, insight, and recommendation can be traced through a versioned `ExplanationObject`. It stores the calculation scope, evidence, quality, confidence, reasons, and source IDs without embedding medical conclusions.

Deviation events now preserve direction, absolute difference, robust deviation from the personal distribution, severity, and whether the direction needs attention. A configurable cooldown suppresses repeated same-level deviation alerts, while escalation is still allowed. Persistence uses a stable episode ID from its first day.

Temporal associations preserve lag direction, exposed and comparison counts, missing or excluded pairs, relative risk, absolute rate difference, cycle coverage, and phase-stratified results. Cross-cycle next/previous-day pairs are excluded by default. `causal_interpretation_allowed` is always false.

TCM clusters keep the two-cycle observation threshold and add maturity states: `collecting`, `observed_cluster`, and `stable_cluster`. Stable requires at least three supporting cycles and the configured support rate. These are observation combinations, not fixed constitution diagnoses.

Intervention feedback remains append-only. At least three uses are required before it affects ranking; five uses produce a stable comparison label. Explicit helpfulness and optional before/after discomfort scores are retained together with recommendation, event, and pattern source IDs.
