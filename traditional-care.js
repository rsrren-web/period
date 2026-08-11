import {
  ACUPOINTS,
  CARE_PRACTICES,
  CONSTITUTION_OBSERVATIONS,
  FOOD_RECIPES,
  KNOWLEDGE_SOURCES,
  PHASE_THEORY,
  STATUS_SIGNAL_RULES
} from './knowledge/wellness-knowledge.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const addDays = (date, amount) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + amount); return next.toISOString().slice(0, 10); };
const todayIso = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const normalizePain = (value) => { const pain = Number(value); if (!Number.isFinite(pain)) return 0; return pain > 5 ? Math.round(pain / 2) : pain; };
const memoryStore = new Map();
const storageGet = (key) => { try { return globalThis.localStorage?.getItem(key) ?? memoryStore.get(key) ?? null; } catch { return memoryStore.get(key) ?? null; } };
const storageSet = (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { memoryStore.set(key, value); } };

function tags(log = {}) {
  return Array.isArray(log.symptoms) ? log.symptoms : [];
}

function recentContext(logs = {}, days = 7) {
  const today = todayIso(), start = addDays(today, -(days - 1));
  const entries = Object.entries(logs).filter(([date]) => date >= start && date <= today).sort(([a], [b]) => a.localeCompare(b));
  const counts = new Map();
  entries.forEach(([, log]) => tags(log).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  const averages = (key) => { const values = entries.map(([, log]) => Number(log[key])).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
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
  if (Number(log.energy) <= 2) set.add('low-energy');
  if (Number(log.activity) <= 2) set.add('low-activity');
  if (Number(log.sleep) <= 2) set.add('sleep-low');
  if (Number(log.stress) >= 4) set.add('stress-high');
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
  const recent = recentContext(logs), signals = signalsFor(log, recent), theory = PHASE_THEORY[phase.key] || PHASE_THEORY.follicular;
  const food = choose(FOOD_RECIPES, phase.key, signals, 'period-recent-food-v1');
  const care = choose(CARE_PRACTICES, phase.key, signals, 'period-recent-care-v1');
  const point = choose(ACUPOINTS.filter((item) => !item.signals.includes('none')), phase.key, signals, 'period-recent-point-v1');
  const constitution = constitutionHint(recent), evidence = recentEvidence(recent, signals);
  document.querySelector('#tcmPhaseTitle').textContent = theory.title;
  document.querySelector('#tcmPhaseDot').className = `phase-dot phase-${phase.key}`;
  root.innerHTML = `
    <section class="tcm-reasoning"><span>今天为什么这样建议</span><p class="phase-rhythm">${esc(theory.rhythm || '')}</p><p>${esc(theory.theory)}</p>${evidence.length ? `<ul>${evidence.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : '<p class="muted">近7天记录仍少，今天主要按周期阶段提供低风险建议。</p>'}</section>
    ${constitution ? `<details class="constitution-hint"><summary><span>体质观察线索</span><strong>${esc(constitution.name)} · ${constitution.total}次线索</strong></summary><div><p>${esc(constitution.explanation)}</p><p><strong>边界：</strong>${esc(constitution.avoid)}</p><small>这里只是近7天的感受倾向，不是体质诊断。</small></div></details>` : ''}
    <div class="traditional-plan">${foodCard(food)}${practiceCard('care', care)}${practiceCard('point', point)}</div>`;
};

