import { buildCareContext } from './care-context.js';
import { analyzeStateClusters } from './state-cluster-engine.js';
import { analyzeTemporalClusters } from './temporal-cluster-engine.js';

const DAY = 86400000;
const addDays = (date, amount) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const datesBetween = (start, end) => { const dates = [],endTime=Date.parse(`${end}T12:00:00Z`); for(let time=Date.parse(`${start}T12:00:00Z`);time<=endTime;time+=DAY)dates.push(new Date(time).toISOString().slice(0,10)); return dates; };
const mean = (values) => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
const round = (value) => value === null ? null : Math.round(value * 1000) / 1000;
const metricLabels = Object.freeze({ energy: '精力', stress: '压力', sleep_quality: '睡眠', pain_max: '疼痛', activity_level: '活动', social_intensity: '社交强度', mood: '情绪', bloating: '腹胀' });
const profiled = (name, operation) => { const report=globalThis.__PERIOD_ANALYSIS_PROFILE__; if(typeof report!=='function')return operation(); const started=performance.now(); try{return operation()}finally{report(name,performance.now()-started)} };

function fingerprint(value) { let hash = 2166136261; for (const character of JSON.stringify(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
function structuredBoolean(log, field, careCache) { if (!log) return null; let care=careCache?.get(log);if(!care){care=buildCareContext({ log });careCache?.set(log,care)}const evidence = care.evidence[field]; return Array.isArray(evidence) && evidence.length ? field.split('.').reduce((value, part) => value?.[part], care.context) === true : null; }
function completedCycles(periods, asOf) {
  const starts = [...new Set((periods || []).filter((period) => period?.type === 'period' && period.status !== 'deleted' && period.start <= asOf).map((period) => period.start))].sort();
  return starts.slice(0, -1).map((start, index) => ({ start, next_start: starts[index + 1], end: addDays(starts[index + 1], -1) })).filter((cycle) => cycle.end <= asOf);
}

function valueFor(log, metric, careCache) {
  if (!log) return null;
  if (metric === 'energy') return Number.isFinite(Number(log.energy)) && log.energy !== null ? Number(log.energy) : null;
  if (metric === 'stress') return Number.isFinite(Number(log.stress)) && log.stress !== null ? Number(log.stress) : null;
  if (metric === 'sleep_quality') return Number.isFinite(Number(log.sleep)) && log.sleep !== null ? Number(log.sleep) : null;
  if (metric === 'pain_max') return Number.isFinite(Number(log.pain)) && log.pain !== null ? Math.min(5, Number(log.pain) > 5 ? Math.round(Number(log.pain) / 2) : Number(log.pain)) : null;
  if (metric === 'activity_level') return Number.isFinite(Number(log.activity)) && log.activity !== null ? Number(log.activity) : null;
  if (metric === 'social_intensity') return Number.isFinite(Number(log.socialIntensity)) && log.socialIntensity !== null ? Number(log.socialIntensity) : null;
  if (metric === 'mood') return Number.isFinite(Number(log.mood)) && log.mood !== null ? Number(log.mood) : null;
  if (metric === 'bloating') { const value = structuredBoolean(log, 'bloating',careCache); return value === null ? null : value ? 1 : 0; }
  return null;
}

function binaryFor(log, metric, careCache) {
  if (!log) return null;
  if (metric === 'bedtime_late') return log.bedtime === null || log.bedtime === undefined ? null : log.bedtime === 'after_23';
  if (metric === 'energy_low') return log.energy === null || log.energy === undefined ? null : Number(log.energy) <= 2;
  if (metric === 'stress_high') return log.stress === null || log.stress === undefined ? null : Number(log.stress) >= 4;
  if (metric === 'sleep_low') return log.sleep === null || log.sleep === undefined ? null : Number(log.sleep) <= 2;
  if (metric === 'pain_present') return log.pain === null || log.pain === undefined ? null : Number(log.pain) > 0;
  if (metric === 'activity_low') return log.activity === null || log.activity === undefined ? null : Number(log.activity) <= 2;
  if (metric === 'bowel_no') return typeof log.bowelMovement === 'boolean' ? !log.bowelMovement : null;
  if (metric === 'bloating_high') return structuredBoolean(log, 'bloating',careCache);
  if (metric === 'nausea_present') return structuredBoolean(log, 'nausea',careCache);
  if (metric === 'diarrhea_present') return structuredBoolean(log, 'diarrhea',careCache);
  return null;
}

function confidence(cycles, repeatRate, config) {
  if (cycles >= config.confidence.stable_min_cycles && repeatRate >= config.confidence.stable_repeat_rate) return 'stable';
  if (cycles >= config.confidence.moderate_min_cycles && repeatRate >= config.confidence.moderate_repeat_rate) return 'moderate';
  return 'exploratory';
}

function observationAction(metric, actions, window) {
  const match = actions.find((item) => item.metrics.includes(metric));
  return match ? { type: 'observation', observationAction: { metric, instructionId: match.id, targetWindow: window }, matchedInterventionIds: [] } : { type: 'none', matchedInterventionIds: [] };
}

function candidateDates(cycle, kind, start, end) {
  if (kind === 'premenstrual') return datesBetween(addDays(cycle.next_start, start), addDays(cycle.next_start, end));
  return datesBetween(addDays(cycle.start, start), addDays(cycle.start, end));
}

function buildWindowPlans(kind,limits,cycleDateLists,targetDateCache){const plans=[];for(let length=limits.min_window_length;length<=limits.max_window_length;length++)for(let start=limits.start;start+length-1<=limits.end;start++){const end=start+length-1,cycleTargetDates=targetDateCache.map(cache=>Array.from({length},(_,index)=>cache.get(start+index))),targetDates=cycleTargetDates.flat(),targetSet=new Set(targetDates),comparisonCount=cycleDateLists.reduce((count,dates)=>count+dates.length-dates.filter(date=>targetSet.has(date)).length,0);plans.push({start,end,cycleTargetDates,targetDates,targetSet,comparisonCount})}return plans}

function scanMetricWindow({ metric, kind, config, cycleDateLists, metricValues, plans }) {
  const candidates = [],cycleValueEntries=cycleDateLists.map(dates=>dates.map(date=>[date,metricValues.get(date)]).filter(([,value])=>value!==undefined));
  for(const {start,end,cycleTargetDates,targetDates,targetSet,comparisonCount} of plans){
      const target = targetDates.map((date) => metricValues.get(date)).filter((value) => value !== undefined), outside = cycleValueEntries.flatMap(entries=>entries.filter(([date])=>!targetSet.has(date)).map(([,value])=>value));
      const targetCompletion = targetDates.length ? target.length / targetDates.length : 0, outsideCompletion = comparisonCount ? outside.length / comparisonCount : 0;
      if (targetCompletion < config.pattern.phase_completion_min || outsideCompletion < config.pattern.phase_completion_min || !target.length || !outside.length) continue;
      const targetMean = mean(target), outsideMean = mean(outside), effect = targetMean - outsideMean;
      const threshold = config.pattern.scale_mean_diff_min;
      const perCycle = cycleDateLists.map((_,index) => {
        const cycleTargets=cycleTargetDates[index],cycleTargetSet=new Set(cycleTargets),within = cycleTargets.map((date) => metricValues.get(date)).filter((value) => value !== undefined);
        const other = cycleValueEntries[index].filter(([date])=>!cycleTargetSet.has(date)).map(([,value])=>value);
        return within.length && other.length ? mean(within) - mean(other) : null;
      }).filter((value) => value !== null);
      const repeated = perCycle.filter((value) => Math.sign(value) === Math.sign(effect) && Math.abs(value) >= threshold).length, repeatRate = perCycle.length ? repeated / perCycle.length : 0;
      const normalizedEffect = Math.min(Math.abs(effect) / 1.5, 1), sampleSupport = Math.min((target.length + outside.length) / 60, 1), windowScore = normalizedEffect * 0.55 + repeatRate * 0.30 + sampleSupport * 0.15;
      candidates.push({ kind, start, end, targetMean, outsideMean, effect, targetCount: target.length, outsideCount: outside.length, cyclesTested: perCycle.length, cyclesRepeated: repeated, repeatRate, windowScore, lastSupportedDate: targetDates.filter((date) => metricValues.has(date)).sort().at(-1) || null });
  }
  return candidates.sort((a, b) => b.windowScore - a.windowScore || (a.end - a.start) - (b.end - b.start) || b.targetCount - a.targetCount)[0] || null;
}

function windowLabel(window) {
  if (window.kind === 'premenstrual') return `经前${Math.abs(window.end)}–${Math.abs(window.start)}天`;
  return `月经第${window.start + 1}–${window.end + 1}天`;
}

function nextWindow(window, nextStart, prediction) {
  const startDate = window.kind === 'premenstrual' ? addDays(nextStart, window.start) : addDays(nextStart, window.start);
  const endDate = window.kind === 'premenstrual' ? addDays(nextStart, window.end) : addDays(nextStart, window.end);
  return { startDate, endDate, confidence: prediction === '较高' ? 'high' : prediction === '中等' ? 'moderate' : 'low' };
}

function buildCycleInsights({ logs, periods, asOf, nextStart, predictionConfidence, config, actions, careCache }) {
  const cycles = completedCycles(periods, asOf); if (cycles.length < config.pattern.min_complete_cycles) return [];
  const insights = [],cycleDateLists=cycles.map(cycle=>datesBetween(cycle.start,cycle.end)),allCycleDates=cycleDateLists.flat(),valuesByMetric=new Map(config.metrics.map(metric=>[metric,new Map(allCycleDates.map(date=>[date,valueFor(logs[date],metric,careCache)]).filter(([,value])=>value!==null))])),plansByKind=new Map(['premenstrual','menstrual'].map(kind=>{const limits=config.window_search[kind],targetDateCache=cycles.map(cycle=>new Map(Array.from({length:limits.end-limits.start+1},(_,index)=>{const offset=limits.start+index,base=kind==='premenstrual'?cycle.next_start:cycle.start;return [offset,addDays(base,offset)]})));return [kind,buildWindowPlans(kind,limits,cycleDateLists,targetDateCache)]}));
  for (const metric of config.metrics) for (const kind of ['premenstrual', 'menstrual']) {
    const window = scanMetricWindow({ metric, kind, config, cycleDateLists, metricValues:valuesByMetric.get(metric), plans:plansByKind.get(kind) });
    if (!window || Math.abs(window.effect) < config.pattern.scale_mean_diff_min || window.cyclesTested < config.pattern.min_complete_cycles) continue;
    const relativeWindow = { relativeStart: window.start, relativeEnd: window.end, label: windowLabel(window) }, level = confidence(window.cyclesTested, window.repeatRate, config);
    insights.push({
      id: `insight:cycle_pattern:${fingerprint({ metric, kind, start: window.start, end: window.end, version: config.version })}`,
      type: 'cycle_pattern', title: `${relativeWindow.label}${metricLabels[metric]}${window.effect > 0 ? '偏高' : '偏低'}`,
      observation: { metric, sampleSize: window.targetCount + window.outsideCount, validDays: window.targetCount + window.outsideCount, cyclesCovered: window.cyclesTested, window: relativeWindow, windowMean: round(window.targetMean), outsideMean: round(window.outsideMean), effectSizeRaw: round(window.effect), effectSizeType: 'mean_difference', supportingData: { cyclesRepeated: window.cyclesRepeated, repeatRate: round(window.repeatRate), lastSupportedDate: window.lastSupportedDate } },
      confidenceLevel: level, timing: { onsetWindow: relativeWindow, peakWindow: relativeWindow, recoveryWindow: undefined, nextExpectedWindow: nextWindow(window, nextStart, predictionConfidence) }, action: observationAction(metric, actions, relativeWindow), status: 'active', generatedAt: new Date().toISOString(), lastRecomputedAt: new Date().toISOString()
    });
  }
  return insights;
}

function buildAssociationInsights({ logs, periods, asOf, config, actions, careCache }) {
  const start = addDays(asOf, -89), dates = datesBetween(start, asOf), cycles = completedCycles(periods, asOf).filter((cycle) => cycle.end >= start).length, offset = { same_day: 0, next_day: 1, previous_day: -1 }, labels = { bedtime_late: '23点后入睡', energy_low: '低精力', stress_high: '高压力', sleep_low: '低睡眠', pain_present: '疼痛', activity_low: '低活动', bowel_no: '没有排便', bloating_high: '腹胀明显', nausea_present: '恶心', diarrhea_present: '腹泻' };
  return config.associations.flatMap((candidate) => {
    const pairs = dates.map((date) => [binaryFor(logs[date], candidate.metric_a,careCache), binaryFor(logs[addDays(date, offset[candidate.relation])], candidate.metric_b,careCache), date]).filter(([a, b]) => a !== null && b !== null);
    if (pairs.length < config.pattern.association_min_pairs) return [];
    const exposed = pairs.filter(([a]) => a), unexposed = pairs.filter(([a]) => !a); if (!exposed.length || !unexposed.length) return [];
    const pExposed = exposed.filter(([, b]) => b).length / exposed.length, pUnexposed = unexposed.filter(([, b]) => b).length / unexposed.length, effect = pExposed - pUnexposed;
    if (Math.abs(effect) < config.pattern.binary_effect_min) return [];
    const relationText = candidate.relation === 'same_day' ? '同日更常同时出现' : candidate.relation === 'next_day' ? '之后一天更常出现' : '前一天更常出现';
    const level = confidence(cycles, Math.min(1, pairs.length / 30), config);
    return [{ id: `insight:temporal_association:${fingerprint(candidate)}`, type: candidate.relation === 'same_day' ? 'co_occurrence' : 'temporal_association', title: `${labels[candidate.metric_a]}与${labels[candidate.metric_b]}${relationText}`, observation: { metric: candidate.metric_b, sampleSize: pairs.length, validDays: pairs.length, cyclesCovered: cycles, exposedRate: round(pExposed), unexposedRate: round(pUnexposed), effectSizeRaw: round(effect), effectSizeType: 'proportion_difference', supportingData: { relation: candidate.relation, metricA: candidate.metric_a, metricB: candidate.metric_b, metricALabel: labels[candidate.metric_a], metricBLabel: labels[candidate.metric_b], exposedDays: exposed.length, unexposedDays: unexposed.length, lastSupportedDate: pairs.filter(([a, b]) => a && b).map((pair) => pair[2]).at(-1) || null } }, confidenceLevel: level, action: observationAction(candidate.metric_b, actions), status: 'active', generatedAt: new Date().toISOString(), lastRecomputedAt: new Date().toISOString() }];
  });
}

function phaseFor(date, periods, cycles=completedCycles(periods, '9999-12-31'), periodDates=null) {
  const cycle = cycles.find((item) => date >= item.start && date <= item.end); if (!cycle) return null;
  if (periodDates?periodDates.has(date):(periods || []).some((period) => period?.type === 'period' && period.status !== 'deleted' && date >= period.start && date <= period.end)) return 'menstrual';
  if (date >= addDays(cycle.next_start, -16) && date <= addDays(cycle.next_start, -12)) return 'ovulatory_window';
  if (date >= addDays(cycle.next_start, -11)) return 'luteal';
  return 'follicular';
}

function buildPhaseProfiles({ logs, periods, asOf, config, actions, careCache }) {
  const cycles = completedCycles(periods, asOf); if (cycles.length < config.pattern.min_complete_cycles) return [];
  const phases = ['menstrual', 'follicular', 'ovulatory_window', 'luteal'], insights = [],periodDates=new Set((periods||[]).filter(period=>period?.type==='period'&&period.status!=='deleted').flatMap(period=>datesBetween(period.start,period.end))),datesByPhase=new Map(phases.map(phase=>[phase,[]]));
  for(const cycle of cycles){const ovulationStart=addDays(cycle.next_start,-16),ovulationEnd=addDays(cycle.next_start,-12),lutealStart=addDays(cycle.next_start,-11);for(const date of datesBetween(cycle.start,cycle.end)){const phase=periodDates.has(date)?'menstrual':date>=ovulationStart&&date<=ovulationEnd?'ovulatory_window':date>=lutealStart?'luteal':'follicular';datesByPhase.get(phase).push(date)}}
  const dates=phases.flatMap(phase=>datesByPhase.get(phase));
  for (const metric of config.metrics) {
    const all = dates.map((date) => valueFor(logs[date], metric,careCache)).filter((value) => value !== null), overall = mean(all); if (overall === null) continue;
    for (const phase of phases) {
      const phaseDates = datesByPhase.get(phase), values = phaseDates.map((date) => valueFor(logs[date], metric,careCache)).filter((value) => value !== null), completion = phaseDates.length ? values.length / phaseDates.length : 0;
      if (!values.length || completion < config.pattern.phase_completion_min) continue;
      const difference = mean(values) - overall; if (Math.abs(difference) < config.pattern.scale_mean_diff_min) continue;
      const phaseLabel = { menstrual: '月经期', follicular: '卵泡期', ovulatory_window: '排卵估算窗口', luteal: '黄体期' }[phase];
      insights.push({ id: `insight:phase_profile:${fingerprint({ metric, phase })}`, type: 'phase_profile', title: `${phaseLabel}${metricLabels[metric]}${difference > 0 ? '高于' : '低于'}个人周期平均`, observation: { metric, sampleSize: values.length, validDays: values.length, cyclesCovered: cycles.length, windowMean: round(mean(values)), outsideMean: round(overall), effectSizeRaw: round(difference), effectSizeType: 'mean_difference', supportingData: { phase, completionRate: round(completion), lastSupportedDate: phaseDates.filter((date) => valueFor(logs[date], metric,careCache) !== null).at(-1) || null } }, confidenceLevel: confidence(cycles.length, Math.min(1, values.length / Math.max(1, phaseDates.length)), config), action: observationAction(metric, actions), status: 'active', generatedAt: new Date().toISOString(), lastRecomputedAt: new Date().toISOString() });
    }
  }
  return insights;
}

export function buildInsights({ logs = {}, periods = [], as_of, next_start, prediction_confidence, config, observation_actions = [], tcm_clusters = [] } = {}) {
  const careCache=new WeakMap(),standard = [...profiled('insights:state-clusters',()=>analyzeStateClusters({ logs, periods, as_of, config })), ...profiled('insights:temporal-clusters',()=>analyzeTemporalClusters({ logs, periods, as_of, config })), ...profiled('insights:cycle-windows',()=>buildCycleInsights({ logs, periods, asOf: as_of, nextStart: next_start, predictionConfidence: prediction_confidence, config, actions: observation_actions,careCache })), ...profiled('insights:associations',()=>buildAssociationInsights({ logs, periods, asOf: as_of, config, actions: observation_actions,careCache })), ...profiled('insights:phase-profiles',()=>buildPhaseProfiles({ logs, periods, asOf: as_of, config, actions: observation_actions,careCache }))];
  const tcm = tcm_clusters.filter((cluster) => cluster.status === 'detected').map((cluster) => ({ id: `insight:tcm_cluster:${cluster.cluster_id}`, type: 'tcm_cluster', title: cluster.display_name, observation: { symptom: cluster.cluster_id, sampleSize: cluster.evidence.length, validDays: cluster.data_quality.valid_days, cyclesCovered: cluster.cycles_covered, windowRate: cluster.support_rate, outsideRate: 0, effectSizeRaw: cluster.support_rate, effectSizeType: 'proportion_difference', supportingData: { cyclesSupported: cluster.cycles_supported, constituentFeatures: cluster.constituent_features, lastSupportedDate: cluster.evidence.at(-1)?.date || null, dataQuality: cluster.data_quality } }, confidenceLevel: cluster.confidence_level, action: { type: 'observation', matchedInterventionIds: [], observationAction: null }, tcmClusterId: cluster.cluster_id, status: 'active', generatedAt: cluster.generated_at, lastRecomputedAt: cluster.generated_at }));
  return Object.freeze([...standard, ...tcm]);
}

export const InsightBuilder = Object.freeze({ build: buildInsights });
