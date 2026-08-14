import { createInsightsPageData } from './analysis/insights-page-data.js';
import { readInsightsSnapshot, writeInsightsSnapshot } from './analysis/insights-repository.js';

const USAGE_KEY = 'period-intervention-usage-v1';
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const dateText = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '';
const pct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const labels = { mood: '情绪', energy: '精力', sleep: '睡眠', bowel: '排便', pain: '疼痛', activity: '活动', stress: '压力', sleep_quality: '睡眠', pain_max: '疼痛', activity_level: '活动', social_intensity: '社交强度', bloating_level: '腹胀' };
const confidence = { exploratory: '初步观察', moderate: '值得注意', stable: '较明确规律' };
let resourcePromise;
let renderToken = 0;
let lastContext = null;

function loadResources() {
  resourcePromise ||= Promise.all([
    fetch('./knowledge/insights_config.json').then((r) => r.json()),
    fetch('./knowledge/tcm_cluster_rules.json').then((r) => r.json()),
    fetch('./knowledge/observation_actions.json').then((r) => r.json())
  ]).then(([config, tcmRules, observationActions]) => ({ config, tcmRules, observationActions }));
  return resourcePromise;
}

function readUsage() { try { const data = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; } }
function writeUsage(data) { localStorage.setItem(USAGE_KEY, JSON.stringify(data)); }
function empty(title, detail) { return `<div class="insights-empty"><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`; }
function level(item) { return confidence[item.confidenceLevel] || '观察中'; }
function fixed(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—'; }

function evidence(item) {
  const o = item.observation;
  if (['cycle_pattern', 'phase_profile'].includes(item.type)) return `${fixed(o.windowMean)}/5，对照 ${fixed(o.outsideMean)}/5，差值 ${o.effectSizeRaw > 0 ? '+' : ''}${o.effectSizeRaw}`;
  if (['co_occurrence', 'temporal_association'].includes(item.type)) return `${pct(o.exposedRate)} 对比 ${pct(o.unexposedRate)}，差 ${o.effectSizeRaw > 0 ? '+' : ''}${Math.round(o.effectSizeRaw * 100)} 个百分点`;
  if (item.type === 'tcm_cluster') return `最近 ${o.cyclesCovered} 个有体感记录的周期中，${o.supportingData.cyclesSupported} 个出现这组组合`;
  return `有效记录 ${o.validDays} 天`;
}

function action(item, actions) {
  const id = item.action?.observationAction?.instructionId;
  return actions.find((entry) => entry.id === id)?.instruction || '';
}

function card(item, actions, showNext = true) {
  const next = item.timing?.nextExpectedWindow;
  const instruction = action(item, actions);
  const parts = item.observation.supportingData?.constituentFeatures;
  return `<article class="insight-v1-card"><div class="insight-v1-head"><span>${level(item)}</span><small>${item.observation.cyclesCovered} 个周期 · ${item.observation.sampleSize} 条有效记录</small></div><h3>${esc(item.title)}</h3><div class="insight-evidence"><small>数据依据</small><p>${esc(evidence(item))}</p></div>${parts?.length ? `<div class="insight-constituents"><small>主要组成</small><p>${parts.slice(0, 4).map((part) => esc(part.label)).join(' · ')}</p></div>` : ''}${showNext && next ? `<div class="insight-next"><small>下一次值得观察</small><strong>${dateText(next.startDate)}–${dateText(next.endDate)}</strong>${next.confidence === 'low' ? '<p>日期仅供参考，以实际月经开始时间为准。</p>' : ''}</div>` : ''}${instruction ? `<div class="insight-action"><small>下一步</small><p>${esc(instruction)}</p></div>` : ''}<details><summary>查看计算信息</summary><p>规律价值 ${Math.round(item.ranking.insightValue * 100)}/100 · 效应 ${Math.round(item.ranking.effectScore * 100)}/100 · 可信度 ${Math.round(item.ranking.confidenceScore * 100)}/100。它是产品排序，不是医学风险评分。</p></details></article>`;
}

function renderTop(data, actions) {
  const root = document.querySelector('#insightsTop');
  if (root) root.innerHTML = data.topInsights.length ? data.topInsights.map((item) => card(item, actions)).join('') : empty('目前没有达到门槛的个人规律', '继续记录即可；系统不会为了填满页面而生成建议。');
}
function renderNext(data, actions) {
  const root = document.querySelector('#insightsNextCycle');
  if (root) root.innerHTML = data.nextCycleWindows.length ? data.nextCycleWindows.slice(0, 3).map((item) => card(item, actions)).join('') : empty('暂时没有需要提前观察的周期窗口', '至少三个完整周期重复且达到效应门槛后才会出现。');
}
function renderProfiles(data) {
  const root = document.querySelector('#insightsPhaseProfiles');
  if (!root) return;
  const phases = { menstrual: '月经期', follicular: '卵泡期', ovulatory_window: '排卵估算窗口', luteal: '黄体期' };
  const groups = new Map();
  data.phaseProfiles.forEach((item) => { const key = item.observation.supportingData.phase; groups.set(key, [...(groups.get(key) || []), item]); });
  root.innerHTML = Object.entries(phases).map(([key, name]) => {
    const items = (groups.get(key) || []).sort((a, b) => Math.abs(b.observation.effectSizeRaw) - Math.abs(a.observation.effectSizeRaw)).slice(0, 4);
    return `<article class="phase-profile-card"><h3>${name}</h3>${items.length ? items.map((item) => `<div><span>${esc(labels[item.observation.metric] || item.observation.metric)}</span><strong>${fixed(item.observation.windowMean)}/5</strong><small>个人周期平均 ${fixed(item.observation.outsideMean)} · ${item.observation.effectSizeRaw > 0 ? '+' : ''}${item.observation.effectSizeRaw}</small></div>`).join('') : '<p>暂未发现达到门槛的稳定差异。</p>'}</article>`;
  }).join('');
}
function renderAssociations(data, actions) {
  const root = document.querySelector('#insightsAssociations');
  if (!root) return;
  const groups = [['sameDay', '同日共现'], ['previousToToday', '前一天 → 今天'], ['todayToNextDay', '今天 → 第二天']];
  root.innerHTML = groups.map(([key, title]) => `<section class="association-group"><h3>${title}</h3>${data.associations[key].length ? data.associations[key].map((item) => card(item, actions, false)).join('') : '<p class="muted">目前没有足够数据支持稳定关系。</p>'}</section>`).join('');
}
function renderInterventions(data) {
  const root = document.querySelector('#insightsInterventions');
  if (root) root.innerHTML = data.interventionResponses.length ? data.interventionResponses.map((item) => `<article class="intervention-response-card"><div><strong>${esc(item.interventionName)}</strong><span>${esc(item.dataLabel)}</span></div><p>使用 ${item.uses} 次 · 记录有帮助 ${item.improvementCount} 次 · 有帮助 ${pct(item.helpfulRate)}</p>${item.meanDelta === null ? '' : `<p>不适评分平均下降 ${item.meanDelta > 0 ? '+' : ''}${item.meanDelta}</p>`}</article>`).join('') : empty('还没有足够的调养反馈', '在首页调养建议中记录效果；同一方案至少3次后才开始汇总。');
}
function renderTcm(data, actions) {
  const section = document.querySelector('#insightsTcmSection');
  const root = document.querySelector('#insightsTcmClusters');
  if (!section || !root) return;
  section.hidden = !data.tcmClusters.length;
  if (data.tcmClusters.length) root.innerHTML = data.tcmClusters.map((item) => card(item, actions, false)).join('');
}
function renderQuality(data) {
  const root = document.querySelector('#insightsDataQuality');
  if (root) root.innerHTML = Object.values(data.dataQualitySummary.metrics).map((item) => `<div class="quality-row"><span>${esc(labels[item.metric] || item.metric)}</span><strong>${item.valid_days}/${item.total_days} 天</strong><small>${pct(item.completion_rate)} · ${esc(item.quality_level)}</small></div>`).join('');
}
function renderPage(data, actions) {
  renderTop(data, actions); renderNext(data, actions); renderProfiles(data); renderAssociations(data, actions); renderInterventions(data); renderTcm(data, actions); renderQuality(data);
  const stamp = document.querySelector('#insightsGeneratedAt');
  if (stamp) stamp.textContent = `更新于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt))}`;
}

globalThis.renderInsightsV1 = async (context) => {
  lastContext = context;
  const token = ++renderToken;
  const now = new Date();
  const asOf = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const input = { logs: context?.logs || {}, periods: context?.periods || [], as_of: asOf, next_start: context?.next, prediction_confidence: context?.predictionConfidence };
  try {
    const { config, tcmRules, observationActions } = await loadResources();
    if (token !== renderToken) return;
    const cached = readInsightsSnapshot(input, config.version);
    if (cached) renderPage(cached, observationActions);
    const data = createInsightsPageData({ ...input, config, tcm_rules: tcmRules, observation_actions: observationActions, intervention_usage: readUsage() });
    if (token !== renderToken) return;
    writeInsightsSnapshot(input, config.version, data);
    renderPage(data, observationActions);
  } catch (error) {
    const root = document.querySelector('#insightsTop');
    if (root) root.innerHTML = empty('趋势暂时无法计算', '原始记录没有受到影响；刷新页面后可以重试。');
    console.warn('insights_render_failed', error?.name || 'Error');
  }
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-intervention-feedback]');
  if (!button) return;
  const dialog = document.querySelector('#interventionFeedbackDialog');
  const form = document.querySelector('#interventionFeedbackForm');
  form.reset();
  form.elements.interventionId.value = button.dataset.interventionFeedback;
  form.elements.interventionName.value = button.dataset.interventionName;
  form.elements.target.value = button.dataset.interventionTarget;
  document.querySelector('#interventionFeedbackName').textContent = button.dataset.interventionName;
  dialog.showModal();
});

document.querySelector('#interventionFeedbackForm')?.addEventListener('submit', (event) => {
  const form = event.currentTarget;
  const data = new FormData(form);
  const score = (name) => data.get(name) === '' ? null : Number(data.get(name));
  const records = readUsage();
  records.push({ intervention_id: data.get('interventionId'), intervention_name: data.get('interventionName'), target: data.get('target'), helpful: data.get('helpful') === 'yes', before: score('before'), after: score('after'), used_at: new Date().toISOString() });
  writeUsage(records.slice(-300));
  if (lastContext) globalThis.renderInsightsV1(lastContext);
});
