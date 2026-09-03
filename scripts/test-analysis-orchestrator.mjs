import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runAnalysis } from '../analysis/analysis-orchestrator.js';
import { detectDeviation } from '../analysis/health-event-engine.js';
import { analyzeTemporalAssociation } from '../analysis/pattern-engine.js';
import { analyzeTcmClusters } from '../analysis/tcm-cluster-engine.js';
import { writeTcmObservations } from '../tcm-observation-model.js';

const config = JSON.parse(fs.readFileSync(new URL('../knowledge/insights_config.json', import.meta.url), 'utf8'));
const tcmRules = JSON.parse(fs.readFileSync(new URL('../knowledge/tcm_cluster_rules.json', import.meta.url), 'utf8'));
const actions = JSON.parse(fs.readFileSync(new URL('../knowledge/observation_actions.json', import.meta.url), 'utf8'));
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const starts = ['2026-01-01', '2026-01-31', '2026-03-02', '2026-04-01', '2026-05-01'];
const periods = starts.map((start) => ({ type: 'period', start, end: addDays(start, 4), status: 'confirmed' }));
const logs = {};
for (let index = 0; index < 120; index += 1) {
  const date = addDays('2026-01-01', index), stress = index % 2 ? 2 : 5, priorStress = index > 0 && (index - 1) % 2 === 0;
  logs[date] = { mood: 3, energy: priorStress ? 2 : 4, stress, sleep: priorStress ? 2 : 4, activity: 3, pain: 0, bowelMovement: true, socialIntensity: 3, symptomTags: writeTcmObservations([], { cold_sensation: 'no', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no' }), fieldStatus: Object.fromEntries(['mood', 'energy', 'stress', 'sleep', 'activity', 'pain', 'bowelMovement', 'socialIntensity', 'symptomTags'].map((field) => [field, 'reported'])), updatedAt: `${date}T12:00:00Z` };
}
for (const date of ['2026-01-10', '2026-02-09', '2026-03-11']) logs[date].symptomTags = writeTcmObservations([], { cold_sensation: 'no', warmth_relief: 'no', nausea: 'yes', diarrhea: 'no', bloating: 'yes', poor_appetite: 'yes', body_heaviness: 'yes' });

const input = { logs, periods, as_of: '2026-04-30', next_start: '2026-05-01', prediction_confidence: '较高', config, tcm_rules: tcmRules, observation_actions: actions, intervention_usage: [] };
const started = performance.now(), first = runAnalysis(input, { calculated_at: '2026-04-30T12:00:00Z' }), elapsed = performance.now() - started;
assert.equal(first.schema_version, 2);
assert.equal(first.performance.mode, 'full');
assert.ok(first.core.baselines.id.startsWith('baseline:'));
assert.equal(first.core.tcm_states.length, 7, '统一分析快照必须包含7类近期中医状态');
assert.ok(first.explanations.some((item) => item.kind === 'tcm.recent_state'), '近期状态必须进入可解释性链路');
assert.ok(first.explanations.length > 0 && first.explanations.every((item) => item.schema_version === 1));
assert.ok(elapsed < 1500, `120日分析应快速完成，实际 ${elapsed.toFixed(0)}ms`);

const same = runAnalysis(input, { previous_snapshot: first, calculated_at: '2026-04-30T12:01:00Z' });
assert.ok(same.performance.reused_sections.includes('core'));
assert.strictEqual(same.core, first.core, '输入未变时必须复用核心分析对象');

const feedbackOnly = runAnalysis({ ...input, intervention_usage: [{ intervention_id: 'x', target: 'pain_max', used_at: '2026-04-30T12:00:00Z', helpful: true }] }, { previous_snapshot: first, calculated_at: '2026-04-30T12:02:00Z' });
assert.strictEqual(feedbackOnly.core, first.core, '仅反馈变化不得重算基线、规律与TCM');
assert.ok(!feedbackOnly.performance.reused_sections.includes('feedback'));

const editedLogs = structuredClone(logs);
editedLogs['2026-02-15'].energy = 1;
const edited = runAnalysis({ ...input, logs: editedLogs }, { previous_snapshot: first, calculated_at: '2026-04-30T12:03:00Z' });
assert.notStrictEqual(edited.core, first.core, '修改中间日期也必须使缓存失效');

const baseline = { status: 'available', value: 4, sample_size: 30, quality_level: 'good', date_range: { start: '2026-03-01', end: '2026-03-30' }, distribution: { mad: 0.5, q1: 3.5, q3: 4.5 } };
const lowEnergy = { '2026-04-01': { energy: 1, fieldStatus: { energy: 'reported' } } };
const deviation = detectDeviation({ logs: lowEnergy, metric: 'energy', date: '2026-04-01', baseline, created_at: '2026-04-01T12:00:00Z' });
assert.equal(deviation.supporting_data.direction, 'lower');
assert.equal(deviation.supporting_data.attention, true);
assert.equal(deviation.supporting_data.severity, 'high');
assert.equal(detectDeviation({ logs: { '2026-04-02': lowEnergy['2026-04-01'] }, metric: 'energy', date: '2026-04-02', baseline, prior_events: [deviation] }), null, '冷却期内不得重复生成同级异常');

const temporal = analyzeTemporalAssociation({ logs, periods, metric_a: 'stress', metric_b: 'sleep_quality', start: '2026-01-01', end: '2026-04-30', relation: 'next_day', condition_a: { operator: 'gte', value: 4 }, condition_b: { operator: 'lte', value: 2 } });
assert.equal(temporal.direction, 'a_precedes_b');
assert.equal(temporal.lag_days, 1);
assert.equal(temporal.causal_interpretation_allowed, false);
assert.ok('relative_risk' in temporal && 'phase_strata' in temporal && 'missing_or_excluded_pairs' in temporal);

const clusters = analyzeTcmClusters({ logs, periods, as_of: '2026-04-30', rules_config: tcmRules });
assert.equal(clusters.length, 9, '统一分析必须产出9类跨周期TCM模式候选');
const digestive = clusters.find((item) => item.cluster_id === 'digestive_heaviness_pattern');
assert.equal(digestive.status, 'detected');
assert.equal(digestive.maturity, 'stable_cluster');
assert.ok(digestive.cycle_evidence.length >= 3);
const digestiveExplanation = first.explanations.find((item) => item.explanation_id === 'explanation:tcm:digestive_heaviness_pattern');
assert.ok(digestiveExplanation?.scope.phase_specificity, '模式解释必须携带周期特异性');
assert.ok(digestiveExplanation.evidence.every((item) => ['supporting', 'contradicting'].includes(item.direction)), '模式解释必须区分支持与反向证据');

console.log(`Analysis orchestrator, anomaly, temporal, TCM and incremental tests passed in ${elapsed.toFixed(1)}ms.`);
