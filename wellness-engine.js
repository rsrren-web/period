import { compatibilityTags } from './daily-record-model.js';

const escapeWellness = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const isoToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const shiftDate = (date, amount) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + amount); return next.toISOString().slice(0, 10); };
const dayDiff = (start, end) => Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000);
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const tags = (log = {}) => compatibilityTags(log);
const tagged = (log, prefix) => tags(log).find((tag) => tag.startsWith(prefix))?.slice(prefix.length) || '';
const normalizedPain = (log = {}) => { if (log.pain === null || log.pain === undefined || log.pain === '') return null; const pain = Number(log.pain); if (!Number.isFinite(pain)) return null; return pain > 5 ? Math.round(pain / 2) : pain; };
const metric = (log, key) => key === 'pain' ? normalizedPain(log) : log?.[key] === null || log?.[key] === undefined || log?.[key] === '' ? null : Number.isFinite(Number(log[key])) ? Number(log[key]) : null;
const painParts = (log) => tags(log).filter((tag) => tag.startsWith('疼痛部位：')).map((tag) => tag.slice(5));

const EMOTIONS = {
  开心: { icon: '😄', className: 'happy', score: 5 }, 平静: { icon: '😌', className: 'calm', score: 4 }, 满足: { icon: '🥰', className: 'content', score: 5 },
  普通: { icon: '😐', className: 'neutral', score: 3 }, 疲倦: { icon: '🥱', className: 'tired', score: 2 }, 低落: { icon: '😔', className: 'sad', score: 1 },
  焦虑: { icon: '😰', className: 'anxious', score: 2 }, 生气: { icon: '😠', className: 'angry', score: 1 }, 害怕: { icon: '😨', className: 'afraid', score: 1 }
};

function phaseFor(date, context) {
  const periods = [...(context.periods || [])].filter((period) => period.start).sort((a, b) => a.start.localeCompare(b.start));
  const actual = periods.find((period) => date >= period.start && date <= period.end);
  if (actual) return 'period';
  let previous = null, next = null;
  for (const period of periods) { if (period.start < date) previous = period; if (period.start > date) { next = period; break; } }
  const nextStart = next?.start || (date >= (periods.at(-1)?.start || '') ? context.next : null);
  if (!previous || !nextStart) return 'unknown';
  const cycleLength = dayDiff(previous.start, nextStart), cycleDay = dayDiff(previous.start, date) + 1, ovulation = Math.max(8, cycleLength - 14);
  if (cycleDay >= ovulation - 2 && cycleDay <= ovulation + 2) return 'ovulation';
  if (dayDiff(date, nextStart) <= 7) return 'pms';
  return 'follicular';
}

const PHASE_NAMES = { period: '月经期', follicular: '卵泡期', ovulation: '排卵估算期', pms: '黄体期', unknown: '阶段未定' };

function rangeEntries(logs, days = 7, end = isoToday()) {
  const start = shiftDate(end, -(days - 1));
  return Object.entries(logs).filter(([date]) => date >= start && date <= end).sort(([a], [b]) => a.localeCompare(b));
}

function tagCount(entries, tag) {
  return entries.filter(([, log]) => tags(log).includes(tag)).length;
}

function consecutiveTag(logs, variants) {
  let count = 0;
  for (let date = isoToday(), stop = shiftDate(isoToday(), -14); date >= stop; date = shiftDate(date, -1)) {
    const logTags = tags(logs[date]);
    if (!variants.some((tag) => logTags.includes(tag))) break;
    count++;
  }
  return count;
}

function phaseBaseline(logs, context, key, phase, excluding = isoToday()) {
  const values = Object.entries(logs).filter(([date]) => date !== excluding && phaseFor(date, context) === phase).map(([, log]) => metric(log, key)).filter(Number.isFinite);
  return { count: values.length, median: median(values) };
}

function statusIcon(label, value, detail, icon, tone = '') {
  return `<div class="status-icon-item ${tone}"><span class="status-icon" aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${escapeWellness(value)}</strong>${detail ? `<em>${escapeWellness(detail)}</em>` : ''}</div></div>`;
}

function renderReadableToday(logs) {
  const root = document.querySelector('#todaySnapshot');
  if (!root) return;
  // The legacy summary hides this container after a log is saved. This
  // renderer replaces that summary, so restore the interactive card.
  root.hidden = false;
  document.querySelector('#todayStatusDetail')?.remove();
  const log = logs[isoToday()];
  if (!log) {
    root.innerHTML = `<button class="empty-today-state" type="button" data-open-log><span class="emoji-icon">➕</span><div><strong>记录今天的状态</strong><small>情绪、运动、社交、睡眠、排便和疼痛</small></div></button>`;
    return;
  }
  const emotion = tagged(log, '情绪：') || Object.keys(EMOTIONS).find((name) => tags(log).includes(name)) || '';
  const emotionInfo = EMOTIONS[emotion] || { icon: '🙂', className: 'neutral' }, bedtime = tagged(log, '入睡：'), bowel = tagged(log, '排便：'), exercise = tags(log).filter((tag) => tag.startsWith('运动：')).map((tag) => tag.slice(3)), social = tags(log).filter((tag) => tag.startsWith('社交：')).map((tag) => tag.slice(3)), socialEffect = tagged(log, '社交影响：'), pain = normalizedPain(log), parts = painParts(log), menstrualNames = { on_period: '月经中', spotting_only: '点滴出血', not_on_period: '不在经期' }, flowNames = { spotting: '点滴', light: '少', medium: '中', heavy: '多', very_heavy: '很多' },colorNames={pink:'淡',bright_red:'鲜红',dark_red:'暗红',brown:'棕色',other:'其他'},menstrualStatus = menstrualNames[log.menstrual_status] || '未记录', menstrualDetail = [Number.isInteger(log.cycle_day) ? `第${log.cycle_day}天` : '', flowNames[log.flow_level] ? `经量${flowNames[log.flow_level]}` : '',colorNames[log.blood_color]||'',log.clot_presence==='no'?'无血块':log.clot_presence==='yes'?`血块${log.clot_level==='large'?'多':'少'}`:''].filter(Boolean).join(' · ');
  root.innerHTML = `<button class="readable-today-card" type="button" data-open-log aria-label="编辑今日状态">
    <div class="today-status-icons">
      ${statusIcon('情绪', emotion || '未记录', '', emotionInfo.icon)}
      ${statusIcon('月经', menstrualStatus, menstrualDetail, '🩸')}
      ${statusIcon('精力', `${log.energy || '—'}/5`, Number(log.energy) <= 2 ? '偏低' : '', '⚡️', Number(log.energy) <= 2 ? 'attention' : '')}
      ${statusIcon('睡眠', `${log.sleep || '—'}/5`, bedtime || '', '🌙')}
      ${statusIcon('运动', `${log.activity || '—'}/5`, exercise.slice(0, 2).join('、'), '🏃‍♀️')}
      ${statusIcon('社交', tagged(log, '社交强度：') ? `${tagged(log, '社交强度：')}/5` : '—', socialEffect || social.slice(0, 2).join('、'), '💬')}
      ${statusIcon('排便', bowel || '未记录', '', bowel === '未排便' ? '➖' : '✅', bowel === '未排便' ? 'attention' : '')}
      ${statusIcon('疼痛', pain === null ? '未记录' : `${pain}/5`, parts.slice(0, 2).join('、'), '🩹', pain >= 3 ? 'attention' : '')}
    </div>
  </button>`;
}

function todayComparison(logs, context, log) {
  const phase = phaseFor(isoToday(), context), comparisons = [];
  const configs = [
    ['sleep', '睡眠', true], ['energy', '精力', true], ['activity', '运动', true], ['stress', '压力', false], ['pain', '疼痛', false]
  ];
  for (const [key, label, favorable] of configs) {
    const value = metric(log, key), baseline = phaseBaseline(logs, context, key, phase);
    if (value === null || baseline.count < 3) continue;
    const delta = value - baseline.median;
    if (Math.abs(delta) < .45) comparisons.push(`${label}接近平均`);
    else comparisons.push(`${label}${delta > 0 ? '高' : '低'}${Math.abs(delta).toFixed(1)}分${favorable ? '' : delta > 0 ? '（负担增加）' : '（负担减少）'}`);
  }
  return comparisons.slice(0, 3).join('，') || `同阶段记录不足，继续记录${Math.max(0, 3 - Math.min(...configs.map(([key]) => phaseBaseline(logs, context, key, phase).count)))}天可形成比较`;
}

function adviceCandidates(logs, context, log) {
  const recent = rangeEntries(logs), pain = normalizedPain(log) ?? 0, candidates = [];
  const noBowel = consecutiveTag(logs, ['排便：未排便', '未排便']);
  const late = tagCount(recent, '入睡：23:00后');
  const avgActivity = average(recent.map(([, item]) => metric(item, 'activity')).filter(Number.isFinite));
  const avgMood = average(recent.map(([, item]) => metric(item, 'mood')).filter(Number.isFinite));
  const stress = metric(log, 'stress') ?? 3;
  if (noBowel >= 2) candidates.push({ id: 'bowel', priority: 10 + noBowel, title: `已连续${noBowel}天记录未排便`, reason: '这是近一周最连续的变化', action: '今天分次补水，正餐加入蔬菜或全谷物，餐后舒适步行10分钟' });
  if (pain >= 3) candidates.push({ id: 'pain', priority: 10 + pain, title: '今天先照顾疼痛', reason: `${pain}/5的疼痛是今天最明显的身体负担`, action: '暂停高强度运动；若温热后舒服，可隔布热敷15分钟' });
  if (late >= 3) candidates.push({ id: 'sleep', priority: 8 + late, title: '今晚把收尾时间提前一点', reason: `近7天有${late}天在23点后入睡`, action: '今晚提前20分钟停止新任务，并把屏幕调暗' });
  if (avgActivity !== null && avgActivity <= 2.3) candidates.push({ id: 'activity', priority: 7, title: '今天补一点轻活动', reason: `近7天运动量平均${avgActivity.toFixed(1)}/5，低于中间水平`, action: '选择散步、拉伸或八段锦中的一项，做10分钟即可' });
  if (stress >= 4) candidates.push({ id: 'stress', priority: 9, title: '今天减少一次额外消耗', reason: `压力${stress}/5，是今天较突出的负担`, action: '取消一项非必要任务，留10分钟不处理消息' });
  if (avgMood !== null && avgMood <= 2.2) candidates.push({ id: 'mood', priority: 8, title: '情绪连续偏低，先降低要求', reason: `近7天情绪平均${avgMood.toFixed(1)}/5`, action: '今天只保留一项必须完成的任务，并联系一个让你安心的人' });
  const phase = phaseFor(isoToday(), context), fallback = {
    period: { id: 'period', title: '经期把体力留给必要的事', reason: '今天没有记录到更突出的连续变化', action: '规律吃饭、分次喝水，运动以舒适为度' },
    follicular: { id: 'follicular', title: '恢复阶段，逐步增加活动', reason: '今天没有记录到明显偏离个人状态', action: '在原计划上增加10分钟轻活动，明天观察是否疲劳' },
    ovulation: { id: 'ovulation', title: '维持现在的稳定节奏', reason: '这是排卵估算期，今天没有明显偏离', action: '按平常节奏吃饭、工作和运动，不额外进补' },
    pms: { id: 'pms', title: '为经前变化留出缓冲', reason: '今天没有更突出的异常，但处于经前阶段', action: '今晚减少过晚安排，并提前准备经期用品' },
    unknown: { id: 'steady', title: '今天保持基本节律', reason: '目前记录不足以形成明确结论', action: '规律进食、适量活动，并完成今天的状态记录' }
  }[phase];
  candidates.push({ ...fallback, priority: 1 });
  const recentIds = JSON.parse(localStorage.getItem('period-recent-actions-v2') || '[]');
  candidates.forEach((candidate) => { if (recentIds.includes(candidate.id)) candidate.priority -= 2; });
  return candidates.sort((a, b) => b.priority - a.priority);
}

function renderUsefulDecision(logs, context) {
  const root = document.querySelector('#homeDecisionCard');
  if (!root) return;
  const log = logs[isoToday()];
  if (!log) {
    root.innerHTML = `<span class="decision-kicker">今天的一个重点</span><h2>记录后再给结论</h2><p>不会只根据周期阶段猜测你的状态。</p>`;
    return;
  }
  const choice = adviceCandidates(logs, context, log)[0], recentIds = JSON.parse(localStorage.getItem('period-recent-actions-v2') || '[]');
  localStorage.setItem('period-recent-actions-v2', JSON.stringify([choice.id, ...recentIds.filter((id) => id !== choice.id)].slice(0, 7)));
  root.innerHTML = `<div class="decision-simple-head"><h2>${escapeWellness(choice.title)}</h2></div><p class="decision-reason">${escapeWellness(choice.reason)}</p><div class="decision-action"><small>今日行动</small><strong>${escapeWellness(choice.action)}</strong></div><p class="decision-comparison"><span>相较个人${escapeWellness(PHASE_NAMES[phaseFor(isoToday(), context)])}平均</span>${escapeWellness(todayComparison(logs, context, log))}</p>`;
}

function recentSignals(logs) {
  const entries = rangeEntries(logs), signals = [];
  const noBowel = consecutiveTag(logs, ['排便：未排便', '未排便']);
  if (noBowel >= 2) signals.push({ level: 'attention', title: `连续${noBowel}天未排便`, detail: '未记录日不会算作未排便；若伴持续腹痛、呕吐、发热或无法排气，应及时求助。' });
  const locations = new Map(); entries.forEach(([, log]) => painParts(log).forEach((part) => locations.set(part, (locations.get(part) || 0) + 1)));
  for (const [part, count] of [...locations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) if (count >= 3) signals.push({ level: 'attention', title: `${part}疼痛出现${count}天`, detail: '查看是否集中在同一周期阶段，以及强度是否在上升。' });
  const named = ['疲倦', '焦虑', '生气', '低落', '腹胀', '恶心'];
  for (const tag of named) { const count = tagCount(entries, tag) + (tag === '低落' ? tagCount(entries, '情绪：低落') : 0); if (count >= 3) signals.push({ level: 'pattern', title: `${tag}出现${count}天`, detail: `近7天重复出现，继续观察是否随周期阶段变化。` }); }
  const avgActivity = average(entries.map(([, log]) => metric(log, 'activity')).filter(Number.isFinite));
  if (avgActivity !== null && avgActivity <= 2.3) signals.push({ level: 'pattern', title: `运动量平均${avgActivity.toFixed(1)}/5`, detail: '活动持续偏少；从每天10分钟轻活动开始比一次补足更容易坚持。' });
  return { entries, signals: signals.slice(0, 4) };
}

function renderWeeklyPatterns(logs) {
  const root = document.querySelector('#weeklyPatternPanel'); if (!root) return;
  const { entries, signals } = recentSignals(logs);
  root.innerHTML = `<div class="section-title"><div><p class="eyebrow">近7天</p><h2>持续出现与值得注意</h2></div><span class="observation-badge">${entries.length}天有记录</span></div>${signals.length ? `<div class="signal-list">${signals.map((item) => `<article class="signal-${item.level}"><span></span><div><strong>${escapeWellness(item.title)}</strong><p>${escapeWellness(item.detail)}</p></div></article>`).join('')}</div>` : `<div class="light-empty"><strong>暂未发现持续变化</strong><p>至少连续记录3天后，才提示重复症状；未记录不会当作没有发生。</p></div>`}`;
}

function renderPhasePatterns(logs, context) {
  const root = document.querySelector('#phasePatternPanel'); if (!root) return;
  const phases = ['follicular', 'ovulation', 'pms', 'period'];
  const cards = phases.map((phase) => {
    const entries = Object.entries(logs).filter(([date]) => phaseFor(date, context) === phase); const rows = [];
    if (entries.length >= 3) {
      const configs = [['mood', '情绪'], ['sleep', '睡眠'], ['energy', '精力'], ['activity', '运动'], ['stress', '压力']];
      const phaseAverages = configs.map(([key, label]) => ({ key, label, value: average(entries.map(([, log]) => metric(log, key)).filter(Number.isFinite)) })).filter((item) => item.value !== null);
      const favorable = phaseAverages.filter((item) => item.key !== 'stress').sort((a, b) => b.value - a.value)[0];
      const burden = phaseAverages.filter((item) => item.key === 'stress' || item.value <= 2.5).sort((a, b) => (b.key === 'stress' ? b.value : 5 - b.value) - (a.key === 'stress' ? a.value : 5 - a.value))[0];
      if (favorable) rows.push({ label: `较好 · ${favorable.label}`, value: `${favorable.value.toFixed(1)}/5` });
      if (burden) rows.push({ label: `留意 · ${burden.label}`, value: `${burden.value.toFixed(1)}/5` });
      const symptomCounts = new Map(); entries.forEach(([, log]) => tags(log).filter((tag) => !tag.includes('：')).forEach((tag) => symptomCounts.set(tag, (symptomCounts.get(tag) || 0) + 1)));
      const common = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1])[0]; if (common?.[1] >= 2) rows.push({ label: `常见 · ${common[0]}`, value: `${common[1]}次` });
    }
    return `<article class="phase-pattern phase-${phase}"><header><span class="phase-pattern-dot" aria-hidden="true"></span><div><strong>${escapeWellness(PHASE_NAMES[phase])}</strong><small>${entries.length}天记录</small></div></header>${entries.length >= 3 ? `<dl>${rows.slice(0, 3).map((row) => `<div><dt>${escapeWellness(row.label)}</dt><dd>${escapeWellness(row.value)}</dd></div>`).join('')}</dl>` : '<p class="phase-pattern-empty">同阶段至少记录3天后生成数据</p>'}</article>`;
  });
  root.innerHTML = `<div class="section-title"><div><p class="eyebrow">个人模式</p><h2>阶段特征</h2></div></div><div class="phase-pattern-grid">${cards.join('')}</div><p class="fineprint">仅显示你的个人记录数据；排卵期为日历估算。</p>`;
}

function pearson(pairs) {
  if (pairs.length < 2) return 0; const xs = pairs.map((pair) => pair[0]), ys = pairs.map((pair) => pair[1]), mx = average(xs), my = average(ys); let top = 0, dx = 0, dy = 0;
  pairs.forEach(([x, y]) => { top += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }); return dx && dy ? top / Math.sqrt(dx * dy) : 0;
}

function renderFactors(logs) {
  const root = document.querySelector('#personalFactorInsight'); if (!root) return;
  const entries = Object.entries(logs).sort(([a], [b]) => a.localeCompare(b)), byDate = new Map(entries), definitions = [
    ['sleep', 'mood', 0, '睡眠与同日情绪'], ['sleep', 'energy', 1, '睡眠与次日精力'], ['stress', 'sleep', 0, '压力与同日睡眠'], ['activity', 'mood', 0, '运动与同日情绪'], ['activity', 'pain', 0, '运动与同日疼痛'], ['social', 'mood', 0, '社交强度与同日情绪']
  ];
  const relationships = definitions.map(([left, right, lag, label]) => {
    const pairs = [];
    for (const [date, log] of entries) {
      const target = byDate.get(lag ? shiftDate(date, lag) : date); let x = left === 'social' ? Number(tagged(log, '社交强度：')) : metric(log, left), y = metric(target, right);
      if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
    }
    return { label, pairs, correlation: pearson(pairs), lag };
  }).filter((item) => item.pairs.length >= 7).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 3);
  root.innerHTML = relationships.length ? `<div class="relationship-list">${relationships.map((item) => `<article><div><strong>${escapeWellness(item.label)}</strong><span>${item.pairs.length}组配对 · ${item.pairs.length >= 30 ? '相对稳定' : item.pairs.length >= 14 ? '初步发现' : '观察中'}</span></div><em>${Math.abs(item.correlation) >= .6 ? '变化较明显' : Math.abs(item.correlation) >= .35 ? '有一些同向变化' : '关系较弱'}</em><p>${item.lag ? '跨日比较' : '同日比较'}，相关系数${item.correlation.toFixed(2)}；没有排除周期阶段和其他因素。</p></article>`).join('')}</div>` : `<div class="light-empty"><strong>关系分析仍在积累</strong><p>每一种关系至少需要7组配对记录；14组以上才称为初步发现。</p></div>`;
}

function renderPms(logs, context) {
  const root = document.querySelector('#pmsInsight'), badge = document.querySelector('#pmsBurden'); if (!root || !badge) return;
  const periods = [...(context.periods || [])].filter((period) => period.start).sort((a, b) => a.start.localeCompare(b.start)), windows = periods.slice(-7).map((period) => ({ start: shiftDate(period.start, -7), end: shiftDate(period.start, -1), period: period.start })), counts = new Map(), covered = new Set();
  windows.forEach((window) => Object.entries(logs).filter(([date]) => date >= window.start && date <= window.end).forEach(([date, log]) => { covered.add(window.period); tags(log).filter((tag) => !tag.startsWith('入睡：') && !tag.startsWith('运动：') && !tag.startsWith('社交：')).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)); if ((metric(log, 'sleep') ?? 3) <= 2) counts.set('睡眠偏低', (counts.get('睡眠偏低') || 0) + 1); if ((metric(log, 'mood') ?? 3) <= 2) counts.set('情绪偏低', (counts.get('情绪偏低') || 0) + 1); }));
  const repeated = [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
  badge.textContent = covered.size >= 2 ? `${covered.size}个周期` : '继续记录';
  root.innerHTML = covered.size >= 2 && repeated.length ? `<div class="pms-pattern-list">${repeated.map(([label, count]) => `<article><strong>${escapeWellness(label)}</strong><span>经前窗口记录${count}次</span></article>`).join('')}</div><p class="insight-guidance"><strong>下一步：</strong>在预计月经前7天继续每日记录，观察这些表现是否在月经开始后4天内缓解。重复模式不等于PMS诊断。</p>` : `<div class="light-empty"><strong>至少覆盖2个周期的经前一周</strong><p>目前不使用通用经前症状代替你的个人数据。</p></div>`;
}

function renderCycleObservation(logs, context) {
  const root = document.querySelector('#cycleObservationCard'); if (!root) return;
  const periods = [...(context.periods || [])].filter((period) => period.start && period.end && period.status !== 'ongoing').sort((a, b) => a.start.localeCompare(b.start)), period = periods.at(-1);
  if (!period) { root.innerHTML = '<div class="light-empty"><strong>还没有完整周期可评分</strong><p>周期结束后生成观察分；缺失记录不会被当作身体问题扣分。</p></div>'; return; }
  const index = periods.length - 1, priorStarts = periods.slice(Math.max(0, index - 7), index).map((item) => item.start), priorLengths = priorStarts.slice(1).map((start, position) => dayDiff(priorStarts[position], start)).filter(Number.isFinite), currentLength = index ? dayDiff(periods[index - 1].start, period.start) : null, baseline = median(priorLengths), cycleLogs = Object.entries(logs).filter(([date]) => date >= period.start && date <= period.end), painValues = cycleLogs.map(([, log]) => normalizedPain(log)).filter(Number.isFinite), sleepValues = cycleLogs.map(([, log]) => metric(log, 'sleep')).filter(Number.isFinite), energyValues = cycleLogs.map(([, log]) => metric(log, 'energy')).filter(Number.isFinite), duration = dayDiff(period.start, period.end) + 1, historicalDuration = median(periods.slice(-7, -1).map((item) => dayDiff(item.start, item.end) + 1).filter(Number.isFinite));
  const deductions = [];
  let score = 100, available = 0;
  if (baseline !== null && currentLength !== null) { available += 30; const difference = Math.abs(currentLength - baseline), deduction = Math.min(30, Math.round(difference * 4)); score -= deduction; if (deduction) deductions.push({ text: `本周期${currentLength}天，个人近期中位数${baseline.toFixed(0)}天，相差${difference.toFixed(0)}天`, points: deduction, action: '继续准确确认月经开始日；下次按个人预测范围提前准备，不用靠饮食或运动强行改变周期长度。' }); }
  if (historicalDuration !== null) { available += 15; const durationDifference = Math.abs(duration - historicalDuration), durationDeduction = Math.min(15, Math.round(durationDifference * 4)); score -= durationDeduction; if (durationDeduction) deductions.push({ text: `本次经期${duration}天，近6次个人中位数${historicalDuration.toFixed(0)}天，相差${durationDifference.toFixed(0)}天`, points: durationDeduction, action: '下次逐日确认出血开始和结束；若明显变化连续出现，再把日期记录带给医生评估。' }); }
  if (painValues.length) { available += 20; const painAverage = average(painValues), painDeduction = Math.round((painAverage / 5) * 20); score -= painDeduction; if (painDeduction) deductions.push({ text: `有${painValues.length}天疼痛记录，平均${painAverage.toFixed(1)}/5`, points: painDeduction, action: '下周期记录疼痛部位、强度和开始时间；当天先减少高强度运动，选择舒适热敷或轻走。' }); }
  if (sleepValues.length || energyValues.length) { available += 20; const recovery = average([...sleepValues, ...energyValues]), recoveryDeduction = Math.round(((5 - recovery) / 4) * 20); score -= recoveryDeduction; if (recoveryDeduction) deductions.push({ text: `睡眠与精力合计${sleepValues.length + energyValues.length}条，平均${recovery.toFixed(1)}/5`, points: recoveryDeduction, action: '经前一周优先选择23点前入睡，并连续记录次日精力，比较是否改善。' }); }
  const finalScore = Math.max(0, Math.min(100, Math.round(score))), confidence = available >= 70 ? '较高' : available >= 45 ? '中等' : '较低';
  root.innerHTML = `<div class="cycle-score-head"><div><p class="eyebrow">最近完整周期</p><h2>本周期观察分</h2></div><strong>${finalScore}<small>/100</small></strong></div><div class="cycle-score-meta"><span>${period.start}–${period.end}</span><span>数据可信度：${confidence}</span></div>${deductions.length ? `<div class="deduction-list"><strong>主要扣分与数据</strong>${deductions.slice(0, 3).map((item) => `<div><p>${escapeWellness(item.text)}</p><b>−${item.points}分</b></div>`).join('')}</div>` : '<p class="score-steady">现有数据未发现明显扣分项。</p>'}<p class="fineprint">这是个人记录观察分，不是医学健康评分；数据完整度只影响可信度，不直接扣分。</p>`;
}

export function renderWellnessEnhancements(context, view = 'today') {
  const logs = context?.logs || {};
  if (view === 'calendar') { renderCycleObservation(logs, context || {}); return; }
  if (view !== 'today') return;
  renderReadableToday(logs);
  renderUsefulDecision(logs, context || {});
}
