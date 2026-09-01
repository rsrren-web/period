import {
  ACUPOINTS,
  CARE_PRACTICES,
  CONSTITUTION_OBSERVATIONS,
  FOOD_RECIPES,
  KNOWLEDGE_SOURCES,
  PHASE_THEORY,
  STATUS_SIGNAL_RULES
} from './knowledge/wellness-knowledge.js';
import { compatibilityTags } from './daily-record-model.js';
import { loadInterventionLibrary } from './analysis/intervention-engine.js';
import { runAnalysis } from './analysis/analysis-orchestrator.js';
import { selectDailyNourishment } from './analysis/daily-nourishment.js';
import { readTcmObservations } from './tcm-observation-model.js';
import { readInterventionUsage } from './intervention-feedback.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const addDays = (date, amount) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + amount); return next.toISOString().slice(0, 10); };
const todayIso = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const normalizePain = (value) => { const pain = Number(value); if (!Number.isFinite(pain)) return 0; return pain > 5 ? Math.round(pain / 2) : pain; };
const memoryStore = new Map();
const storageGet = (key) => { try { return globalThis.localStorage?.getItem(key) ?? memoryStore.get(key) ?? null; } catch { return memoryStore.get(key) ?? null; } };
const storageSet = (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { memoryStore.set(key, value); } };
let analysisResourcesPromise;
function loadAnalysisResources() {
  analysisResourcesPromise ||= Promise.all([
    loadInterventionLibrary(),
    fetch('./knowledge/insights_config.json').then((response) => response.json()),
    fetch('./knowledge/tcm_cluster_rules.json').then((response) => response.json()),
    fetch('./knowledge/observation_actions.json').then((response) => response.json())
  ]).then(([library, config, tcmRules, observationActions]) => ({ library, config, tcmRules, observationActions })).catch((error) => { analysisResourcesPromise = null; throw error; });
  return analysisResourcesPromise;
}
let recommendationRenderToken = 0;
let latestAnalysisSnapshot = null;

function tags(log = {}) {
  return compatibilityTags(log);
}

function recentContext(logs = {}, days = 7) {
  const today = todayIso(), start = addDays(today, -(days - 1));
  const entries = Object.entries(logs).filter(([date]) => date >= start && date <= today).sort(([a], [b]) => a.localeCompare(b));
  const counts = new Map();
  entries.forEach(([, log]) => tags(log).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  const averages = (key) => { const values = entries.map(([, log]) => log[key] === null || log[key] === undefined || log[key] === '' ? null : Number(log[key])).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
  const consecutive = (tag) => { let total = 0; for (let date = today; date >= start; date = addDays(date, -1)) { if (!tags(logs[date]).includes(tag)) break; total++; } return total; };
  return { entries, counts, averages: { sleep: averages('sleep'), energy: averages('energy'), activity: averages('activity'), stress: averages('stress'), pain: entries.length ? entries.reduce((sum, [, log]) => sum + normalizePain(log.pain), 0) / entries.length : null }, consecutive };
}

function signalsFor(log = {}, recent) {
  const set = new Set(tags(log));
  for (const [tag, count] of recent.counts) if (count >= 2) set.add(tag);
  STATUS_SIGNAL_RULES.forEach((rule) => { if (rule.tags.some((tag) => set.has(tag))) rule.signals.forEach((signal) => set.add(signal)); });
  if ((recent.averages.energy ?? 3) <= 2.4) set.add('low-energy');
  if ((recent.averages.activity ?? 3) <= 2.3) set.add('low-activity');
  if ((recent.averages.sleep ?? 3) <= 2.4) set.add('sleep-low');
  if ((recent.averages.stress ?? 3) >= 3.7) set.add('stress-high');
  if (log.energy !== null && log.energy !== undefined && Number(log.energy) <= 2) set.add('low-energy');
  if (log.activity !== null && log.activity !== undefined && Number(log.activity) <= 2) set.add('low-activity');
  if (log.sleep !== null && log.sleep !== undefined && Number(log.sleep) <= 2) set.add('sleep-low');
  if (log.stress !== null && log.stress !== undefined && Number(log.stress) >= 4) set.add('stress-high');
  const meaningfulSignals = new Set(
    [...FOOD_RECIPES, ...CARE_PRACTICES, ...ACUPOINTS]
      .flatMap((item) => item.signals)
      .filter((signal) => signal !== 'neutral' && signal !== 'none')
  );
  if (![...set].some((value) => meaningfulSignals.has(value))) set.add('neutral');
  return set;
}

function choose(items, phaseKey, signals, recentIdsKey) {
  const recentIds = JSON.parse(storageGet(recentIdsKey) || '[]');
  const ranked = items
    .filter((item) => item.phases.includes(phaseKey))
    .map((item) => { const matches = item.signals.filter((signal) => signals.has(signal)).length; return { item, score: matches ? (item.priority || 1) + matches * 4 : -(item.priority || 1) - (recentIds.includes(item.id) ? 3 : 0) }; })
    .sort((a, b) => b.score - a.score);
  const selected = ranked[0]?.item || items.find((item) => item.phases.includes(phaseKey));
  if (selected) storageSet(recentIdsKey, JSON.stringify([selected.id, ...recentIds.filter((id) => id !== selected.id)].slice(0, 4)));
  return selected;
}

function constitutionHint(recent) {
  const signalCount = (signal) => {
    const direct = recent.counts.get(signal) || 0;
    const mapped = STATUS_SIGNAL_RULES.filter((rule) => rule.signals.includes(signal)).map((rule) => Math.max(...rule.tags.map((tag) => recent.counts.get(tag) || 0), 0));
    return Math.max(direct, ...mapped, 0);
  };
  const score = (profile) => profile.signals.reduce((sum, signal) => sum + signalCount(signal), 0);
  const match = CONSTITUTION_OBSERVATIONS.map((profile) => ({ profile, total: score(profile) })).filter(({ profile, total }) => total >= profile.needs).sort((a, b) => b.total - a.total)[0];
  return match ? { ...match.profile, total: match.total } : null;
}

function sourceNames(ids = []) {
  return ids.map((id) => KNOWLEDGE_SOURCES.find((source) => source.id === id)?.title).filter(Boolean).join('、');
}

function foodCard(item) {
  return `<details class="traditional-card traditional-tea"><summary><div class="traditional-card-head"><span aria-hidden="true">食</span><div><small>今日食养</small><h3>${esc(item.title)}</h3></div></div><span class="traditional-expand">查看食谱</span></summary><div class="traditional-detail"><dl class="recipe-details"><div><dt>食材</dt><dd>${esc(item.ingredients)}</dd></div><div><dt>做法</dt><dd>${esc(item.steps)}</dd></div><div><dt>为什么今天推荐</dt><dd>${esc(item.why)}</dd></div><div><dt>先换一个</dt><dd>${esc(item.skip)}</dd></div><div><dt>知识来源</dt><dd>${esc(sourceNames(item.sources))}</dd></div></dl></div></details>`;
}

function practiceCard(kind, item) {
  const point = kind === 'point';
  const title = point ? (item.name.includes('轻按') ? item.name : `${item.name}轻按`) : item.title;
  return `<details class="traditional-card traditional-${kind}"><summary><div class="traditional-card-head"><span aria-hidden="true">${point ? '按' : '养'}</span><div><small>${point ? '今日穴位' : '今日调护'}</small><h3>${esc(title)}</h3></div></div><span class="traditional-expand">查看方法</span></summary><div class="traditional-detail">${point ? `<dl><div><dt>位置</dt><dd>${esc(item.location)}</dd></div><div><dt>方法</dt><dd>${esc(item.method)}</dd></div>` : `<dl><div><dt>方法</dt><dd>${esc(item.steps)}</dd></div>`}<div><dt>为什么推荐</dt><dd>${esc(item.why)}</dd></div><div><dt>先跳过</dt><dd>${esc(item.skip)}</dd></div></dl></div></details>`;
}

const CATEGORY_META = Object.freeze({
  tea: ['饮', '茶饮'], food: ['食', '食养'], acupressure: ['按', '穴位轻按'],
  acupressure_combo: ['按', '穴位组合'], meridian_massage: ['养', '经络按摩'], baduanjin: ['动', '八段锦']
});
const METRIC_NAMES = Object.freeze({
  stress: '压力', energy: '精力', sleep_quality: '睡眠', activity_level: '活动', social_intensity: '社交强度', pain_max: '疼痛',
  'pain.head': '头部疼痛', breast_tenderness: '乳房不适', 'pain.neck_shoulder': '肩颈不适', stomach_discomfort: '胃部不适',
  'pain.lower_abdomen': '小腹不适', 'pain.lower_back': '腰背不适', 'pain.legs': '腿部不适', 'pain.feet': '足部不适', body_stiffness: '身体僵硬',
  nausea: '恶心', diarrhea: '腹泻', cold_sensation: '明显怕冷', bloating: '腹胀', appetite_low: '食欲较差', poor_appetite: '食欲较差'
});

function recommendationReason(recommendation) {
  const metric = METRIC_NAMES[recommendation.reason.metric] || '当前不适';
  if (recommendation.reason.code === 'CURRENT_DISCOMFORT') return `你今天记录了${metric}，所以优先匹配这项调养。`;
  if (recommendation.reason.code === 'HEALTH_EVENT') return `${metric}最近持续出现，或比你平时更明显。`;
  if (recommendation.reason.code === 'PERSONAL_PATTERN') return `过去记录中，${metric}在类似情况下更常出现。`;
  if (recommendation.reason.code === 'CYCLE_PATTERN') return `过去记录中，${metric}在当前周期阶段更常出现。`;
  return '这项调养与今天记录的状态相符。';
}

function interventionMethod(item) {
  const execution = item.execution || {}, rows = [];
  if (execution.ingredients?.length) rows.push(`<div><dt>用料</dt><dd>${execution.ingredients.map((part) => `${esc(part.name)} ${esc(part.amount)}${esc(part.unit)}`).join('；')}</dd></div>`);
  if (item.point?.location) rows.push(`<div><dt>位置</dt><dd>${esc(item.point.location)}</dd></div>`);
  if (item.points?.length) rows.push(`<div><dt>位置</dt><dd>${item.points.map((point) => `${esc(point.name)}：${esc(point.location)}`).join('；')}</dd></div>`);
  if (item.route) rows.push(`<div><dt>路线</dt><dd>${esc(item.route)}</dd></div>`);
  if (execution.steps?.length) rows.push(`<div><dt>做法</dt><dd>${execution.steps.map((step, index) => `${index + 1}. ${esc(step)}`).join('<br>')}</dd></div>`);
  if (execution.instruction) rows.push(`<div><dt>方法</dt><dd>${esc(execution.instruction)}</dd></div>`);
  if (execution.pressure) rows.push(`<div><dt>力度</dt><dd>${esc(execution.pressure)}</dd></div>`);
  const duration = execution.estimated_minutes ? `约${execution.estimated_minutes}分钟` : execution.duration_minutes_each_side ? `每侧约${execution.duration_minutes_each_side}分钟` : execution.duration_seconds_per_side ? `每侧约${execution.duration_seconds_per_side}秒` : null;
  if (duration) rows.push(`<div><dt>时长</dt><dd>${duration}</dd></div>`);
  return rows.join('');
}

function interventionCard(recommendation) {
  const item = recommendation.intervention, [icon, label] = CATEGORY_META[item.category] || ['养', '今日建议'];
  const target = recommendation.reason?.metric || item.targets?.[0] || 'general';
  return `<details class="traditional-card traditional-${esc(item.category)}"><summary><div class="traditional-card-head"><span aria-hidden="true">${icon}</span><div><small>${label}</small><h3>${esc(item.name)}</h3></div></div><span class="traditional-expand">查看方法</span></summary><div class="traditional-detail"><dl><div><dt>为什么</dt><dd>${esc(recommendationReason(recommendation))}</dd></div>${interventionMethod(item)}</dl><button type="button" class="intervention-feedback-button soft" data-intervention-feedback="${esc(item.id)}" data-intervention-name="${esc(item.name)}" data-intervention-target="${esc(target)}" data-recommendation-id="${esc(recommendation.recommendation_id)}" data-source-event-id="${esc(recommendation.source_event_id || '')}" data-source-pattern-id="${esc(recommendation.source_pattern_id || '')}">记录这次效果</button></div></details>`;
}

async function renderEngineRecommendations({ root, token, phase, log, logs }) {
  try {
    const { library, config, tcmRules, observationActions } = await loadAnalysisResources();
    if (token !== recommendationRenderToken || !root.isConnected) return;
    const analysis = runAnalysis({ logs, periods: phase.ps || [], as_of: phase.date || todayIso(), next_start: phase.next, prediction_confidence: phase.confidence, config, tcm_rules: tcmRules, observation_actions: observationActions, intervention_usage: readInterventionUsage(), intervention_library: library, phase }, { previous_snapshot: latestAnalysisSnapshot });
    latestAnalysisSnapshot = analysis;
    const result = analysis.recommendations;
    if (token !== recommendationRenderToken) return;
    root.innerHTML = result.status === 'RECOMMENDATIONS'
      ? result.recommendations.map(interventionCard).join('')
      : `<div class="traditional-no-recommendation"><strong>今天没有需要额外匹配的调养项目</strong><p>当前没有达到门槛的偏离、连续状态、个人规律或明确不适，因此不为填满页面随机推荐。</p></div>`;
  } catch {
    if (token === recommendationRenderToken) root.innerHTML = `<div class="traditional-no-recommendation"><strong>暂时无法生成数据建议</strong><p>知识库或分析数据尚未载入；不会使用随机内容替代。</p></div>`;
  }
}

function recentEvidence(recent, signals) {
  const lines = [];
  const late = recent.counts.get('入睡：23:00后') || recent.counts.get('23点后入睡') || 0;
  const noBowel = recent.consecutive('排便：未排便') || recent.consecutive('未排便');
  if (late >= 2) lines.push(`近7天有${late}天记录23点后入睡`);
  if (noBowel >= 2) lines.push(`已连续${noBowel}天记录未排便`);
  if ((recent.averages.stress ?? 0) >= 3.7) lines.push(`近7天压力平均${recent.averages.stress.toFixed(1)}/5`);
  if ((recent.averages.activity ?? 5) <= 2.3) lines.push(`近7天活动平均${recent.averages.activity.toFixed(1)}/5`);
  const structuredPrefixes = ['情绪：', '入睡：', '排便：', '社交强度：', '社交影响：', '疼痛部位：', '运动：', '社交：'];
  const common = [...recent.counts.entries()].filter(([tag, count]) => count >= 3 && !structuredPrefixes.some((prefix) => tag.startsWith(prefix))).sort((a, b) => b[1] - a[1])[0];
  if (common) lines.push(`${common[0]}在近7天出现${common[1]}次`);
  return lines.slice(0, 3);
}

globalThis.renderTraditionalAdvice = (phase, log = {}, logs = {}) => {
  const root = document.querySelector('#tcmAdvice');
  if (!root) return;
  const recent = recentContext(logs), signals = signalsFor(log, recent), theory = PHASE_THEORY[phase.key] || PHASE_THEORY.follicular, bodySense = readTcmObservations(log.symptomTags);
  const nourishment = selectDailyNourishment({ recipes: FOOD_RECIPES, phase_key: phase.key, record_date: phase.date || todayIso(), signals });
  const constitution = constitutionHint(recent), evidence = recentEvidence(recent, signals);
  const practicalReason = {
    period: '正在经期，今天优先缓解不适、减少额外消耗。',
    follicular: '月经刚结束，今天以恢复精力、逐步增加活动为主。',
    ovulation: '处于排卵估算阶段，今天维持规律作息与正常活动即可。',
    pms: '接近经期，今天提前照顾睡眠、情绪和腹部舒适。'
  }[phase.key] || '今天按当前阶段和近7天记录安排调养。';
  const practicalEvidence = evidence.slice(0, 2);
  const bodySenseAction = bodySense.diarrhea === 'yes'
    ? '<section class="body-sense-care"><strong>今天记录了腹泻</strong><p>先少量多次补水，选择清淡、少量食物；今天暂停油腻辛辣和高强度运动。</p></section>'
    : bodySense.nausea === 'yes'
      ? '<section class="body-sense-care"><strong>今天记录了恶心</strong><p>少量分次进食，饭后保持坐直；今天先避开油腻、浓味和一次吃得过饱。</p></section>'
      : bodySense.bloating === 'yes'
        ? '<section class="body-sense-care"><strong>今天记录了腹胀</strong><p>把正餐分成较小份，放慢进食速度；餐后舒缓走动约10分钟。</p></section>'
        : bodySense.poor_appetite === 'yes'
          ? '<section class="body-sense-care"><strong>今天记录了食欲差</strong><p>优先选择少量、熟软且容易接受的食物，分次吃，不要求一次完成正常份量。</p></section>'
          : bodySense.body_heaviness === 'yes'
            ? '<section class="body-sense-care"><strong>今天记录了沉重困倦</strong><p>先做5–10分钟轻柔走动或伸展；若活动后更疲惫，就改为休息并优先保证今晚睡眠。</p></section>'
            : bodySense.cold_sensation === 'yes'
              ? `<section class="body-sense-care"><strong>今天记录了明显怕冷</strong><p>${bodySense.warmth_relief === 'yes' ? '既然温热后感觉缓解，可继续隔衣温热敷15–20分钟，并注意保暖。' : '先增加衣物和温热正餐；如尝试热敷，以隔衣、不烫、15–20分钟为限。'}</p></section>`
              : '';
  document.querySelector('#tcmPhaseTitle').textContent = theory.title;
  document.querySelector('#tcmPhaseDot').className = `phase-dot phase-${phase.key}`;
  const token = ++recommendationRenderToken;
  root.innerHTML = `
    <section class="tcm-reasoning"><p>${esc(practicalReason)}</p>${practicalEvidence.length ? `<ul>${practicalEvidence.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}</section>
    ${bodySenseAction}
    ${constitution ? `<details class="constitution-hint"><summary><span>体质观察线索</span><strong>${esc(constitution.name)} · ${constitution.total}次线索</strong></summary><div><p>${esc(constitution.explanation)}</p><p><strong>边界：</strong>${esc(constitution.avoid)}</p><small>这里只是近7天的感受倾向，不是体质诊断。</small></div></details>` : ''}
    <div class="traditional-plan">
      <section class="traditional-layer" aria-label="每日阶段食养">
        <header class="traditional-layer-heading"><strong>每日阶段食养</strong><span>固定1项 · 茶饮或食谱</span></header>
        ${nourishment ? foodCard(nourishment) : '<div class="traditional-no-recommendation"><strong>今天暂时没有阶段食谱</strong><p>不会用温水或随机内容占位。</p></div>'}
      </section>
      <section class="traditional-layer" aria-label="针对性调养">
        <header class="traditional-layer-heading"><strong>针对性调养</strong><span>有证据才显示 · 最多2项</span></header>
        <div data-recommendation-plan><div class="traditional-no-recommendation"><strong>正在核对今天的数据</strong><p>只有达到门槛并通过排除规则后才会显示建议。</p></div></div>
      </section>
    </div>`;
  const planRoot = typeof root.querySelector === 'function' ? root.querySelector('[data-recommendation-plan]') : null;
  if (planRoot) renderEngineRecommendations({ root: planRoot, token, phase, log, logs });
};

