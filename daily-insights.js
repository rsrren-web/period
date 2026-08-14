import { compatibilityTags } from './daily-record-model.js';

const DAILY_STORE_KEY = 'period-helper-state-v1';
const DAILY_LABELS = ['很低', '偏低', '一般', '较好', '很好'];
let dailyTrendRange = 'week';
let dailyTrendMetric = 'overview';
const overviewMetrics = new Set(['sleep', 'mood', 'energy', 'activity', 'stress', 'pain']);

const METRICS = {
  sleep: { label: '睡眠', min: 1, max: 5, unit: '/5' },
  mood: { label: '情绪', min: 1, max: 5, unit: '/5' },
  energy: { label: '精力', min: 1, max: 5, unit: '/5' },
  stress: { label: '压力', min: 1, max: 5, unit: '/5' },
  activity: { label: '活动', min: 1, max: 5, unit: '/5' },
  pain: { label: '疼痛', min: 0, max: 5, unit: '/5' },
  bedtime: { label: '入睡', min: 0, max: 1, unit: '', binary: ['23:00后', '23:00前'] },
  bowel: { label: '排便', min: 0, max: 1, unit: '', binary: ['未排便', '已排便'] }
};

function readDailyLogs() { try { const value = JSON.parse(localStorage.getItem(DAILY_STORE_KEY) || '{}'); return value.logs && typeof value.logs === 'object' ? value.logs : {}; } catch { return {}; } }
function localIso(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function dateAt(value) { return new Date(`${value}T12:00:00`); }
function addDate(value, amount) { const date = dateAt(value); date.setDate(date.getDate() + amount); return localIso(date); }
function dayDistance(a, b) { return Math.round((dateAt(b) - dateAt(a)) / 86400000); }
function escapeDaily(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function tagged(log, prefix) { return compatibilityTags(log).find((item) => item.startsWith(prefix))?.slice(prefix.length); }
function painParts(log = {}) { const symptoms = compatibilityTags(log); const parts = symptoms.filter((item) => item.startsWith('疼痛部位：')).map((item) => item.slice(5)); if (symptoms.includes('头痛') && !parts.includes('头部')) parts.push('头部'); if (symptoms.includes('腰腹不适')) { if (!parts.includes('小腹/盆腔')) parts.push('小腹/盆腔'); if (!parts.includes('腰背')) parts.push('腰背'); } return parts; }
function painFive(log = {}) { if (log.pain === null || log.pain === undefined || log.pain === '') return null; const value = Number(log.pain); if (!Number.isFinite(value)) return null; return value > 5 ? Math.round(value / 2) : value; }
function visibleSymptoms(log = {}) { return compatibilityTags(log).filter((item) => !item.startsWith('疼痛部位：') && !item.startsWith('入睡：') && !item.startsWith('排便：') && !['头痛', '腰腹不适'].includes(item)); }

function rangeDates() { const now = new Date(), end = localIso(now); if (dailyTrendRange === 'week') { const mondayOffset = (now.getDay() + 6) % 7; return { start: addDate(end, -mondayOffset), end, title: '本周' }; } if (dailyTrendRange === 'month') return { start: `${end.slice(0, 8)}01`, end, title: '本月' }; const firstMonth = Math.floor(now.getMonth() / 3) * 3; return { start: localIso(new Date(now.getFullYear(), firstMonth, 1)), end, title: '本季度' }; }

function markStatusDates(logs) { document.querySelectorAll('[data-date]').forEach((button) => { const hasStatus = Boolean(logs[button.dataset.date]); button.classList.toggle('has-status', hasStatus); button.querySelector('.status-star')?.remove(); if (hasStatus) button.insertAdjacentHTML('beforeend', '<span class="status-star emoji-icon" aria-hidden="true">🖤</span>'); }); }
function metricValue(log, key) { if (key === 'bedtime') { const value = tagged(log, '入睡：'); return value === '23:00前' ? 1 : value === '23:00后' ? 0 : null; } if (key === 'bowel') { const value = tagged(log, '排便：'); return value === '已排便' ? 1 : value === '未排便' ? 0 : null; } if (key === 'pain') return painFive(log); if (log?.[key] === null || log?.[key] === undefined || log?.[key] === '') return null; const value = Number(log[key]); return Number.isFinite(value) ? value : null; }
function metricLabel(value, config) { return config.binary ? config.binary[value] : `${value}${config.unit}`; }

function renderHomeStatus(logs) {
  document.querySelector('#todayStatusDetail')?.remove(); const grid = document.querySelector('#todaySnapshot'); if (!grid) return;
  const log = logs[localIso(new Date())], detail = document.createElement(log ? 'button' : 'div'); detail.id = 'todayStatusDetail'; detail.className = `today-status-detail${log ? ' compact-status' : ''}`;
  grid.hidden = Boolean(log);
  if (!log) detail.innerHTML = '<span class="muted">今天还没有记录身体状态。</span>';
  else {
    detail.type = 'button'; detail.dataset.openLog = '';
    const ratings = [['情绪', log.mood, 5], ['精力', log.energy, 5], ['睡眠', log.sleep, 5], ['压力', log.stress, 5], ['疼痛', painFive(log), 5]].filter(([, value]) => value !== '' && value !== undefined && value !== null), symptoms = [...visibleSymptoms(log), ...painParts(log).map((part) => `疼痛·${part}`)], bedtime = tagged(log, '入睡：'), bowel = tagged(log, '排便：'), menstrual = menstrualSummary(log);
    detail.innerHTML = `<div class="compact-status-head"><strong>今日状态</strong><span>点击编辑</span></div>${menstrual ? `<p class="compact-menstrual-status"><span aria-hidden="true">🩸</span>${escapeDaily(menstrual)}</p>` : ''}<div class="compact-ratings">${ratings.map(([label, value, max]) => `<span><small>${label}</small><strong>${escapeDaily(value)}/${max}</strong></span>`).join('')}</div>${symptoms.length ? `<p>${symptoms.map(escapeDaily).join(' · ')}</p>` : ''}${bedtime || bowel ? `<small>${bedtime ? `入睡 ${escapeDaily(bedtime)}` : ''}${bedtime && bowel ? ' · ' : ''}${bowel ? escapeDaily(bowel) : ''}</small>` : ''}`;
  }
  grid.insertAdjacentElement('afterend', detail);
}

const MENSTRUAL_LABELS = {
  menstrual_status: { on_period: '月经中', spotting_only: '仅点滴出血', not_on_period: '不在经期' },
  cycle_day_source: { auto_calculated: '系统计算', user_corrected: '用户修正', legacy_manual: '历史手填', not_recorded: '未记录' },
  flow_level: { spotting: '点滴', light: '少量', medium: '中等', heavy: '较多', very_heavy: '很多' },
  blood_color: { bright_red: '鲜红', dark_red: '暗红', brown: '棕色', pink: '粉色', other: '其他' },
  clot_presence: { yes: '有', no: '没有', not_recorded: '未记录' },
  clot_level: { small: '小', medium: '中', large: '大' },
  spotting_context: { period_start_transition: '本次月经开始过渡', period_end_transition: '本次月经结束过渡', intermenstrual: '周期中段点滴', uncertain: '暂不确定' }
};
function menstrualSummary(log = {}) {
  const status = MENSTRUAL_LABELS.menstrual_status[log.menstrual_status];
  if (!status) return '';
  const parts = [status];
  if (Number.isInteger(log.cycle_day)) parts.push(`第 ${log.cycle_day} 天`);
  if (log.menstrual_status === 'on_period' || log.menstrual_status === 'spotting_only') {
    const flow = MENSTRUAL_LABELS.flow_level[log.flow_level];
    if (flow) parts.push(`经量 ${flow}`);
  }
  return parts.join(' · ');
}
function menstrualRows(log) { const status=MENSTRUAL_LABELS.menstrual_status[log.menstrual_status]||'未记录',source=MENSTRUAL_LABELS.cycle_day_source[log.cycle_day_source]||'未记录',rows=[['月经状态',status],['周期日',log.cycle_day===null||log.cycle_day===undefined?source:`第 ${log.cycle_day} 天 · ${source}`]],bleeding=log.menstrual_status==='on_period'||log.menstrual_status==='spotting_only';if(bleeding){rows.push(['出血量',MENSTRUAL_LABELS.flow_level[log.flow_level]||'未记录'],['颜色',MENSTRUAL_LABELS.blood_color[log.blood_color]||'未记录'],['血块',log.clot_presence==='yes'?`有 · ${MENSTRUAL_LABELS.clot_level[log.clot_level]||'大小未记录'}`:(MENSTRUAL_LABELS.clot_presence[log.clot_presence]||'未记录')]);if(log.menstrual_status==='spotting_only')rows.push(['点滴类型',MENSTRUAL_LABELS.spotting_context[log.spotting_context]||'未记录'])}return rows}
function statusCard(date, log) { if (!log) return '<section class="day-status-card empty"><strong>身体状态</strong><p>这一天还没有记录身体状态。</p></section>'; const ratings = [['情绪', tagged(log, '情绪：') || DAILY_LABELS[Number(log.mood) - 1] || '—'], ['精力', `${log.energy || '—'}/5`], ['睡眠', `${log.sleep || '—'}/5`], ['活动', `${log.activity || '—'}/5`], ['压力', `${log.stress || '—'}/5`], ['疼痛', `${painFive(log) ?? '—'}/5`]], locations = painParts(log), symptoms = visibleSymptoms(log).filter((item) => !item.startsWith('情绪：') && !item.startsWith('运动：') && !item.startsWith('社交：') && !item.startsWith('社交强度：') && !item.startsWith('社交影响：')), bedtime = tagged(log, '入睡：'), bowel = tagged(log, '排便：'), menstrual=menstrualRows(log); return `<section class="day-status-card"><div class="day-status-heading"><strong>身体状态记录</strong><span>${escapeDaily(date)}</span></div><div class="day-status-ratings">${ratings.map(([label, value]) => `<div><small>${label}</small><strong>${escapeDaily(value)}</strong></div>`).join('')}</div>${menstrual.map(([label,value])=>`<div class="day-status-row"><strong>${escapeDaily(label)}</strong><span>${escapeDaily(value)}</span></div>`).join('')}${bedtime ? `<div class="day-status-row"><strong>入睡时间</strong><span>${escapeDaily(bedtime)}入睡</span></div>` : ''}${bowel ? `<div class="day-status-row"><strong>排便</strong><span>${escapeDaily(bowel)}</span></div>` : ''}${locations.length ? `<div class="day-status-row"><strong>疼痛部位</strong><span>${locations.map(escapeDaily).join('、')}</span></div>` : ''}${symptoms.length ? `<div class="day-status-row"><strong>其他感受</strong><span>${symptoms.map(escapeDaily).join('、')}</span></div>` : ''}</section>`; }

function enhanceDayDialog(date) { const dialog = document.querySelector('#dayDialog'), body = document.querySelector('#dayDialogBody'); if (!dialog?.open || !body) return; [...body.children].filter((element) => element.tagName === 'P' && !element.classList.contains('period-overlap-note')).forEach((element) => element.remove()); body.querySelector('.day-status-card')?.remove(); const log = readDailyLogs()[date]; body.insertAdjacentHTML('beforeend', statusCard(date, log)); const editButton = document.querySelector('#dayEditLog'); if (editButton) editButton.textContent = log ? '编辑身体状态' : '记录身体状态'; }

function pointSegments(range, values, totalDays, yFor) { const width = 720, left = 42, right = 18, xFor = (date) => left + (dayDistance(range.start, date) / Math.max(1, totalDays - 1)) * (width - left - right), segments = []; let current = []; values.forEach((item, index) => { if (index && dayDistance(values[index - 1].date, item.date) > 2) { if (current.length) segments.push(current); current = []; } current.push({ x: xFor(item.date), y: yFor(item.value) }); }); if (current.length) segments.push(current); return { xFor, segments }; }
function smoothPath(points) { if (points.length < 2) return ''; let result = `M ${points[0].x} ${points[0].y}`; for (let index = 1; index < points.length - 1; index++) { const current = points[index], next = points[index + 1], midX = (current.x + next.x) / 2, midY = (current.y + next.y) / 2; result += ` Q ${current.x} ${current.y} ${midX} ${midY}`; } const last = points.at(-1); return `${result} L ${last.x} ${last.y}`; }
function areaPath(points, baseline) { const line = smoothPath(points); return line ? `${line} L ${points.at(-1).x} ${baseline} L ${points[0].x} ${baseline} Z` : ''; }

function renderDailyTrend(logs) { const controls = document.querySelector('#dailyTrendControls'), chart = document.querySelector('#dailyTrendChart'), summary = document.querySelector('#dailyTrendSummary'); if (!controls || !chart || !summary) return; const ranges = [['week', '本周'], ['month', '本月'], ['quarter', '本季度']], metrics = Object.entries(METRICS).map(([key, value]) => [key, value.label]); controls.innerHTML = `<div class="trend-switch" aria-label="趋势时间范围">${ranges.map(([key, label]) => `<button type="button" data-trend-range="${key}" class="${dailyTrendRange === key ? 'active' : ''}">${label}</button>`).join('')}</div><div class="trend-switch metric-switch" aria-label="趋势指标">${metrics.map(([key, label]) => `<button type="button" data-trend-metric="${key}" class="${dailyTrendMetric === key ? 'active' : ''}">${label}</button>`).join('')}</div>`; const range = rangeDates(), config = METRICS[dailyTrendMetric], totalDays = dayDistance(range.start, range.end) + 1, values = Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).map(([date, log]) => ({ date, value: metricValue(log, dailyTrendMetric) })).filter((item) => item.value !== null).sort((a, b) => a.date.localeCompare(b.date)), width = 720, height = 260, top = 24, bottom = 38, baseline = height - bottom, yFor = (value) => top + ((config.max - value) / Math.max(1, config.max - config.min)) * (baseline - top), points = pointSegments(range, values, totalDays, yFor), gridValues = config.binary ? [0, 1] : config.max === 10 ? [0, 2, 4, 6, 8, 10] : [1, 2, 3, 4, 5], lines = points.segments.map((segment) => `<path class="trend-area" d="${areaPath(segment, baseline)}"/><path class="trend-line" d="${smoothPath(segment)}"/>`).join(''), dots = values.map((item) => `<circle cx="${points.xFor(item.date)}" cy="${yFor(item.value)}" r="5"><title>${item.date} · ${metricLabel(item.value, config)}</title></circle>`).join(''); chart.innerHTML = values.length ? `<div class="daily-chart-arch"><div class="daily-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${range.title}${config.label}趋势图"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#dceaf3" stop-opacity=".85"/><stop offset="1" stop-color="#dceaf3" stop-opacity=".18"/></linearGradient></defs>${gridValues.map((value) => `<line x1="42" y1="${yFor(value)}" x2="702" y2="${yFor(value)}"/><text x="7" y="${yFor(value) + 4}">${config.binary ? config.binary[value] : value}</text>`).join('')}${lines}${dots}<text x="42" y="250">${range.start.slice(5)}</text><text x="660" y="250">${range.end.slice(5)}</text></svg></div></div>` : `<div class="trend-empty">${range.title}还没有${config.label}记录。</div>`; if (!values.length) { summary.innerHTML = '<p class="muted">没有记录的日期会留空，不会按0分计算。</p>'; return; } const numbers = values.map((item) => item.value), latest = values.at(-1); if (config.binary) { const positive = numbers.filter((value) => value === 1).length; summary.innerHTML = `<div><strong>${positive}/${values.length}天</strong><span>${config.binary[1]}</span></div><div><strong>${values.length - positive}/${values.length}天</strong><span>${config.binary[0]}</span></div><div><strong>${metricLabel(latest.value, config)}</strong><span>最近一次 · ${latest.date.slice(5)}</span></div><p>只统计主动记录的日期；未记录不等同于没有发生。</p>`; return; } const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length; summary.innerHTML = `<div><strong>${average.toFixed(1)}${config.unit}</strong><span>平均值</span></div><div><strong>${Math.min(...numbers)}–${Math.max(...numbers)}</strong><span>记录范围</span></div><div><strong>${values.length}天</strong><span>有记录</span></div><div><strong>${metricLabel(latest.value, config)}</strong><span>最近一次 · ${latest.date.slice(5)}</span></div><p>图线只连接相邻或间隔不超过2天的记录；较长空档会断开，避免把未记录日误认为状态没有变化。</p>`; }

const OVERVIEW_SERIES = {
  sleep: { label: '睡眠', color: '#527FA7', favorable: true },
  mood: { label: '情绪', color: '#D9578F', favorable: true },
  energy: { label: '精力', color: '#7CDAC4', favorable: true },
  activity: { label: '活动', color: '#D58718', favorable: true },
  stress: { label: '压力', color: '#302C34', favorable: false },
  pain: { label: '疼痛', color: '#A7211D', favorable: false }
};

let comparisonMetrics = ['sleep', 'stress'];
let focusedSymptom = '';
let dailyContext = null;
const ACTION_FEEDBACK_KEY = 'period-action-feedback-v1';

function readActionFeedback() { try { return JSON.parse(localStorage.getItem(ACTION_FEEDBACK_KEY) || '{}'); } catch { return {}; } }
function writeActionFeedback(value) { localStorage.setItem(ACTION_FEEDBACK_KEY, JSON.stringify(value)); }

function overviewValue(log, key) { return metricValue(log, key); }
function medianDaily(values) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function quantileDaily(values, ratio) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * ratio, lower = Math.floor(position), rest = position - lower; return sorted[lower] + ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * rest; }
function averageDaily(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function dailyPeriods(context = dailyContext) { return [...(context?.periods || [])].filter((period) => period?.start && period?.end).sort((a, b) => a.start.localeCompare(b.start)); }
function cycleIndexFor(date, context = dailyContext) { const periods = dailyPeriods(context); let index = -1; periods.forEach((period, position) => { if (period.start <= date) index = position; }); return index; }
function phaseForDailyDate(date, context = dailyContext) {
  const periods = dailyPeriods(context);
  if (periods.some((period) => date >= period.start && date <= period.end)) return 'period';
  const nextStart = periods.find((period) => period.start > date)?.start || (date >= (periods.at(-1)?.start || '') ? context?.next : null);
  if (!nextStart) return 'unknown';
  if (date >= addDate(nextStart, -7) && date < nextStart) return 'pms';
  if (date >= addDate(nextStart, -16) && date <= addDate(nextStart, -12)) return 'ovulation';
  return 'follicular';
}
function phaseName(key) { return ({ period: '月经期', follicular: '卵泡期', ovulation: '排卵估算期', pms: '黄体期', unknown: '未确定阶段' })[key] || '未确定阶段'; }
function symptomLabels(log = {}) {
  const labels = [...visibleSymptoms(log), ...painParts(log).map((part) => `疼痛·${part}`)];
  if (tagged(log, '入睡：') === '23:00后') labels.push('23点后入睡');
  if (tagged(log, '排便：') === '未排便') labels.push('未排便');
  return [...new Set(labels)];
}
function symptomEvents(logs, range) { return Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).sort(([a], [b]) => a.localeCompare(b)).map(([date, log]) => ({ date, labels: symptomLabels(log) })).filter((item) => item.labels.length); }
function phaseBaseline(logs, key, phase, excludeDate = '') {
  const values = Object.entries(logs).filter(([date]) => date !== excludeDate && phaseForDailyDate(date) === phase).map(([, log]) => metricValue(log, key)).filter(Number.isFinite);
  return { count: values.length, median: medianDaily(values), low: quantileDaily(values, .25), high: quantileDaily(values, .75) };
}
function scoreForLog(log = {}) {
  const parts = [];
  ['sleep', 'mood', 'energy', 'activity'].forEach((key) => { const value = metricValue(log, key); if (value !== null) parts.push((value - 1) / 4); });
  const stress = metricValue(log, 'stress'), pain = metricValue(log, 'pain');
  if (stress !== null) parts.push((5 - stress) / 4);
  if (pain !== null) parts.push((5 - pain) / 5);
  return { score: parts.length ? Math.round(averageDaily(parts) * 100) : null, completeness: parts.length, total: 6 };
}
function statusLabel(score) { return score >= 78 ? '状态较稳' : score >= 58 ? '适合平稳安排' : score >= 38 ? '建议适当放缓' : '优先恢复与休息'; }
function statusMeaning(score) {
  if (score >= 78) return '今天记录的整体负担较低，可以按原计划安排。';
  if (score >= 58) return '今天有少量负担，适合维持日常节奏并留出休息。';
  if (score >= 38) return '今天的压力、疲劳或不适较明显，建议减少非必要消耗。';
  return '今天的综合负担较高，优先照顾睡眠、疼痛和基本恢复。';
}
function recommendedActions(factors) {
  return factors.map(({ key, value }) => {
    if (key === 'stress' && value >= 4) return { id: 'stress-break', severity: value, reason: `压力 ${value}/5，是今天最突出的负担`, text: '给自己留出10分钟不处理任务的休息时间' };
    if (key === 'sleep' && value <= 2) return { id: 'early-bed', severity: 6 - value, reason: `睡眠 ${value}/5，恢复可能不充分`, text: '今晚尽量在23点前上床，减少睡前屏幕刺激' };
    if (key === 'energy' && value <= 2) return { id: 'reduce-load', severity: 6 - value, reason: `精力 ${value}/5，今天不适合硬撑`, text: '把高消耗任务延后，只保留今天最重要的一件事' };
    if (key === 'activity' && value <= 2) return { id: 'gentle-move', severity: 5 - value, reason: `活动 ${value}/5，轻微活动可能更适合今天`, text: '身体允许时轻松走动或舒展10–20分钟' };
    if (key === 'mood' && value <= 2) return { id: 'mood-space', severity: 5 - value, reason: `情绪 ${value}/5，需要给自己更多空间`, text: '降低额外社交负担，安排一件能让自己放松的小事' };
    if (key === 'pain' && value >= 3) return { id: 'pain-care', severity: value, reason: `疼痛 ${value}/5，需要优先照顾不适`, text: '先休息或热敷不适部位，避免勉强完成高强度运动' };
    return null;
  }).filter(Boolean).sort((a, b) => b.severity - a.severity);
}
function statusActions(factors) {
  const actions = recommendedActions(factors).slice(0, 2);
  return actions.length ? actions.map((item) => item.text).join('；') + '。' : '目前没有特别突出的负担，继续按自己的舒适节奏安排即可。';
}

function scoreHistory(logs) { return Object.entries(logs).map(([date, log]) => ({ date, phase: phaseForDailyDate(date), ...scoreForLog(log) })).filter((item) => item.score !== null).sort((a, b) => a.date.localeCompare(b.date)); }
function scoreComparison(logs, date, score, phase) {
  const history = scoreHistory(logs), phaseScores = history.filter((item) => item.date !== date && item.phase === phase).map((item) => item.score), baseline = phaseScores.length >= 3 ? medianDaily(phaseScores) : null, recent = history.filter((item) => item.date <= date).slice(-7), change = recent.length >= 2 ? recent.at(-1).score - recent[0].score : null;
  const baselineText = baseline === null ? `同阶段还需${Math.max(0, 3 - phaseScores.length)}天记录形成个人基线` : `较个人${phaseName(phase)}基线${score >= baseline ? '高' : '低'} ${Math.abs(Math.round(score - baseline))}分`;
  const trendText = change === null ? '近7次记录不足，暂不判断方向' : Math.abs(change) < 4 ? '近7次记录基本平稳' : `近7次记录${change > 0 ? '上升' : '下降'} ${Math.abs(Math.round(change))}分`;
  return { baseline, change, baselineText, trendText };
}
function confidenceFor(count, cycles, dominant = 0) {
  if (count < 7) return { label: '数据不足', level: 'none' };
  if (count < 14 || cycles < 2) return { label: '观察中', level: 'watch' };
  if (count < 30 || cycles < 3 || dominant > .7) return { label: '初步发现', level: 'early' };
  return { label: '较稳定', level: 'stable' };
}
function ranks(values) { return values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value).reduce((result, item, position, sorted) => { let end = position; while (end + 1 < sorted.length && sorted[end + 1].value === item.value) end++; let start = position; while (start > 0 && sorted[start - 1].value === item.value) start--; result[item.index] = (start + end + 2) / 2; return result; }, []); }
function pearsonDaily(xs, ys) { if (xs.length < 3 || xs.length !== ys.length) return null; const xm = averageDaily(xs), ym = averageDaily(ys), top = xs.reduce((sum, x, index) => sum + (x - xm) * (ys[index] - ym), 0), left = Math.sqrt(xs.reduce((sum, x) => sum + (x - xm) ** 2, 0)), right = Math.sqrt(ys.reduce((sum, y) => sum + (y - ym) ** 2, 0)); return left && right ? top / (left * right) : null; }
function relationshipSamples(logs, leftKey, rightKey, lag = 0) {
  const dates = Object.keys(logs).sort(), samples = [];
  dates.forEach((date) => { const target = addDate(date, lag), left = metricValue(logs[date], leftKey), right = metricValue(logs[target], rightKey); if (left !== null && right !== null) samples.push({ date, target, left, right, phase: phaseForDailyDate(date), cycle: cycleIndexFor(date) }); });
  return samples;
}
function bestRelationship(logs) {
  const candidates = [
    { left: 'stress', right: 'sleep', lag: 0, label: '压力与睡眠', direction: -1, detail: '同日' },
    { left: 'sleep', right: 'mood', lag: 0, label: '睡眠与情绪', direction: 1, detail: '同日' },
    { left: 'bedtime', right: 'energy', lag: 1, label: '23点前入睡与次日精力', direction: 1, detail: '次日' },
    { left: 'activity', right: 'pain', lag: 0, label: '活动与疼痛', direction: -1, detail: '同日' }
  ].map((candidate) => {
    const samples = relationshipSamples(logs, candidate.left, candidate.right, candidate.lag), rho = pearsonDaily(ranks(samples.map((item) => item.left)), ranks(samples.map((item) => item.right))), cycles = new Set(samples.map((item) => item.cycle).filter((value) => value >= 0)).size, phaseCounts = samples.reduce((map, item) => map.set(item.phase, (map.get(item.phase) || 0) + 1), new Map()), dominant = samples.length ? Math.max(...phaseCounts.values()) / samples.length : 1;
    return { ...candidate, samples, rho, cycles, dominant, confidence: confidenceFor(samples.length, cycles, dominant) };
  }).filter((item) => item.samples.length >= 7 && Number.isFinite(item.rho)).sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
  return candidates[0] || null;
}
function renderTrendHighlights(logs) {
  const root = document.querySelector('#trendHighlights'); if (!root) return;
  const entries = Object.entries(logs).sort(([a], [b]) => a.localeCompare(b)), latest = entries.at(-1), insights = [];
  if (!latest) { root.innerHTML = '<article class="trend-highlight is-progress"><span>开始记录</span><h2>先积累7天每日状态</h2><p>现在只展示原始记录，不会用人群平均值替代你的个人基线。</p></article>'; return; }
  const [date, log] = latest, phase = phaseForDailyDate(date);
  Object.entries(OVERVIEW_SERIES).forEach(([key, config]) => { const value = metricValue(log, key), baseline = phaseBaseline(logs, key, phase, date); if (value === null || baseline.count < 3) return; const delta = value - baseline.median, adverseDelta = config.favorable ? delta : -delta; if (adverseDelta <= -.9) insights.push({ priority: Math.abs(delta) + .5, title: `${config.label}偏离你的${phaseName(phase)}常见水平`, text: `最近为 ${value}/5，同阶段历史中位数为 ${baseline.median.toFixed(1)}；基于${baseline.count}天记录。`, tone: 'attention' }); });
  const range = rangeDates(), events = symptomEvents(logs, range), counts = new Map(); events.forEach((item) => item.labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1))); const repeated = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (repeated?.[1] >= 3) insights.push({ priority: repeated[1], title: `${repeated[0]}反复出现`, text: `${range.title}已记录${repeated[1]}天；点击下方热力图可与睡眠、压力等日期对照。`, tone: 'pattern' });
  const relation = bestRelationship(logs); if (relation && Math.abs(relation.rho) >= .35) insights.push({ priority: 2.5, title: `${relation.label}曾${relation.rho * relation.direction > 0 ? '按预期方向' : '反向'}同时变化`, text: `${relation.detail}配对${relation.samples.length}组，覆盖${relation.cycles}个周期 · ${relation.confidence.label}；这只是相关，不代表因果。`, tone: 'relation' });
  if (!insights.length) insights.push({ priority: 1, title: '暂未发现明显偏离', text: `最近一次记录位于${phaseName(phase)}；继续记录会逐步形成同阶段个人范围。`, tone: 'steady' });
  root.innerHTML = insights.sort((a, b) => b.priority - a.priority).slice(0, 3).map((item, index) => `<article class="trend-highlight tone-${item.tone}"><span>${index === 0 ? '最值得注意' : '继续观察'}</span><h2>${escapeDaily(item.title)}</h2><p>${escapeDaily(item.text)}</p><button type="button" class="insight-info emoji-icon" aria-label="查看这条观察的计算说明" data-insight-info="${index}">ℹ️</button></article>`).join('');
}
function renderHomeDecision(logs) {
  const root = document.querySelector('#homeDecisionCard'); if (!root) return;
  const today = localIso(new Date()), log = logs[today], feedback = readActionFeedback(), yesterday = addDate(today, -1), yesterdayPlan = feedback[yesterday];
  if (!log) {
    root.innerHTML = '<span class="decision-kicker">今天只回答一个问题</span><h2>先记录今天的状态，再给你一个最值得做的行动</h2><p>不会根据周期阶段假定你一定疲倦、焦虑或疼痛。</p><button type="button" data-open-today-log>记录今天状态</button>';
    return;
  }
  const phase = phaseForDailyDate(today), state = scoreForLog(log), factors = Object.entries(OVERVIEW_SERIES).map(([key, config]) => { const value = metricValue(log, key); return value === null ? null : { key, config, value }; }).filter(Boolean), action = recommendedActions(factors)[0] || { id: 'keep-rhythm', reason: `${phaseName(phase)}的今日记录没有明显突出负担`, text: '保持当前节奏，并给晚间留出稳定的休息时间' }, comparison = scoreComparison(logs, today, state.score, phase);
  feedback[today] = { ...(feedback[today] || {}), actionId: action.id, action: action.text, score: state.score, phase, suggestedAt: feedback[today]?.suggestedAt || new Date().toISOString() }; writeActionFeedback(feedback);
  let followup = '';
  if (yesterdayPlan?.completed) { const delta = Number.isFinite(yesterdayPlan.score) ? state.score - yesterdayPlan.score : null; followup = `<div class="decision-followup"><strong>昨天的行动反馈</strong><p>你完成了“${escapeDaily(yesterdayPlan.action)}”。${delta === null ? '今天已有记录，继续积累后再判断是否反复有效。' : `今天观察分比昨天${delta >= 0 ? '高' : '低'} ${Math.abs(delta)}分；单日变化不能证明是行动造成的。`}</p></div>`; }
  root.innerHTML = `<div class="decision-head"><div><span class="decision-kicker">今天的一个重点</span><h2>${escapeDaily(statusLabel(state.score))}</h2></div><button type="button" class="decision-score" data-view-insights aria-label="查看状态分依据"><strong>${state.score}</strong><small>/100</small></button></div><p class="decision-reason">${escapeDaily(action.reason)}；${escapeDaily(comparison.trendText)}。</p><div class="decision-action"><small>今天只做</small><strong>${escapeDaily(action.text)}</strong></div><button type="button" data-complete-action="${escapeDaily(today)}" ${feedback[today]?.completed ? 'disabled' : ''}>${feedback[today]?.completed ? '今天已完成 ✓' : '完成后打勾'}</button><p class="decision-baseline">${escapeDaily(comparison.baselineText)}。观察分越高表示当天负担越低。</p>${followup}`;
}

function renderCyclePatternSummary(logs) {
  const root = document.querySelector('#cyclePatternSummary'); if (!root) return;
  const periods = dailyPeriods(), intervals = periods.slice(1).map((period, index) => dayDistance(periods[index].start, period.start)).filter((value) => value > 0 && value < 90), recent = intervals.slice(-6), phaseScores = scoreHistory(logs).reduce((map, item) => { if (!map[item.phase]) map[item.phase] = []; map[item.phase].push(item.score); return map; }, {}), phaseAverages = Object.entries(phaseScores).filter(([, values]) => values.length >= 3).map(([phase, values]) => ({ phase, value: averageDaily(values), count: values.length })).sort((a, b) => b.value - a.value), symptomsByPhase = new Map();
  Object.entries(logs).forEach(([date, log]) => symptomLabels(log).forEach((label) => { const key = `${phaseForDailyDate(date)}|${label}`; symptomsByPhase.set(key, (symptomsByPhase.get(key) || 0) + 1); }));
  const repeated = [...symptomsByPhase.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1])[0], lines = [];
  if (recent.length >= 3) lines.push(`最近${recent.length}个周期中位数为${Math.round(medianDaily(recent))}天，范围${Math.min(...recent)}–${Math.max(...recent)}天。`); else lines.push('完整周期还不够，暂时不总结周期长短规律。');
  if (phaseAverages.length >= 2) lines.push(`你的记录中，${phaseName(phaseAverages[0].phase)}状态分相对较高，${phaseName(phaseAverages.at(-1).phase)}相对较低。`);
  if (repeated) { const [phase, label] = repeated[0].split('|'); lines.push(`${label}在${phaseName(phase)}记录了${repeated[1]}次，值得继续观察是否重复。`); }
  root.innerHTML = `<div class="section-title"><div><p class="eyebrow">系统替你总结</p><h2>目前看见的周期规律</h2></div><span class="observation-badge">个人记录</span></div><ul>${lines.slice(0, 3).map((line) => `<li>${escapeDaily(line)}</li>`).join('')}</ul><p class="fineprint">只总结已有个人记录；样本不足时保持空白，不用人群平均替代。</p>`;
}
function renderStatusOverview(logs) {
  const entries = Object.entries(logs).sort(([a], [b]) => a.localeCompare(b)), latest = entries.at(-1); if (!latest) return '';
  const [date, log] = latest, phase = phaseForDailyDate(date), state = scoreForLog(log), factors = Object.entries(OVERVIEW_SERIES).map(([key, config]) => { const value = metricValue(log, key); if (value === null) return null; const baseline = phaseBaseline(logs, key, phase, date), delta = baseline.count >= 3 ? value - baseline.median : null, direction = delta === null || Math.abs(delta) < .75 ? '接近个人范围' : (config.favorable ? delta > 0 : delta < 0) ? '高于个人范围' : '需要留意'; return { key, config, value, baseline, direction }; }).filter(Boolean);
  const score = state.score, comparison = score === null ? null : scoreComparison(logs, date, score, phase);
  return `<section class="status-overview"><div class="status-score"><span>最近状态观察分</span><strong>${score ?? '—'}${score === null ? '' : '<small>/100</small>'}</strong><em>${score === null ? '等待记录' : statusLabel(score)}</em>${score === null ? '' : `<div class="status-scale" aria-label="状态观察分 ${score}/100"><i style="left:${score}%"></i></div><div class="status-scale-labels"><span>需要恢复</span><span>平稳</span><span>状态较稳</span></div><p>${statusMeaning(score)}</p><div class="score-comparison"><span>${escapeDaily(comparison.baselineText)}</span><span>${escapeDaily(comparison.trendText)}</span></div>`}<small>${date.slice(5)} · ${phaseName(phase)} · 完整度 ${state.completeness}/${state.total}</small></div><div class="status-detail"><div class="status-contributors">${factors.map(({ key, config, value, baseline, direction }) => `<div><span style="--factor:${config.color}">${config.label}</span><strong>${value}${key === 'pain' ? '/10' : '/5'}</strong><small>${baseline.count >= 3 ? `${direction} · 基线${baseline.median.toFixed(1)}` : `同阶段仅${baseline.count}天，继续记录`}</small></div>`).join('')}</div><div class="status-next"><strong>今天可以先做</strong><p>${statusActions(factors)}</p></div></div><p class="method-inline"><button type="button" class="emoji-icon" data-method-info>ℹ️</button>满分100分。分数越高，表示当天自填记录中的睡眠、情绪、精力、活动、压力和疼痛负担越低；它不是医学健康评分，也不与他人比较。</p></section>`;
}
function chartSeries(logs, range, selected, focusDates = new Set()) {
  const totalDays = dayDistance(range.start, range.end) + 1, width = 720, height = 260, top = 22, baseline = 216, yFor = (value) => top + ((5 - value) / 4) * (baseline - top);
  const content = selected.map((key) => { const config = OVERVIEW_SERIES[key], values = Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).map(([date, log]) => ({ date, value: overviewValue(log, key), raw: metricValue(log, key) })).filter((item) => item.value !== null).sort((a, b) => a.date.localeCompare(b)), points = pointSegments(range, values, totalDays, yFor), lines = points.segments.map((segment) => `<path class="overview-line" stroke="${config.color}" d="${smoothPath(segment)}"/>`).join(''), dots = values.map((item) => `<circle class="overview-dot${focusedSymptom && !focusDates.has(item.date) ? ' is-muted' : ''}${focusDates.has(item.date) ? ' is-focused' : ''}" style="fill:${config.color}" cx="${points.xFor(item.date)}" cy="${yFor(item.value)}" r="${focusDates.has(item.date) ? 5 : 3.5}"><title>${item.date} · ${config.label} ${key === 'pain' ? `${item.raw}/10` : `${item.raw}/5`}</title></circle>`).join(''); return lines + dots; }).join('');
  return `<div class="comparison-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${range.title}${selected.map((key) => OVERVIEW_SERIES[key].label).join('与')}对比图">${[1, 2, 3, 4, 5].map((value) => `<line x1="42" y1="${yFor(value)}" x2="702" y2="${yFor(value)}"/><text x="18" y="${yFor(value) + 4}">${value}</text>`).join('')}${content}<text x="42" y="248">${range.start.slice(5)}</text><text x="660" y="248">${range.end.slice(5)}</text></svg></div>`;
}
function renderHeatmap(logs, range) {
  const dates = [], count = dayDistance(range.start, range.end) + 1; for (let index = 0; index < count; index++) dates.push(addDate(range.start, index));
  const events = symptomEvents(logs, range), eventMap = new Map(events.map((item) => [item.date, new Set(item.labels)])), counts = new Map(); events.forEach((item) => item.labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1)));
  const symptoms = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!symptoms.length) return '<section class="symptom-heatmap"><div class="symptom-heatmap-head"><h3>症状热力图</h3><span>这个范围内还没有症状记录</span></div></section>';
  const columns = `112px repeat(${dates.length}, 22px)`, width = 112 + dates.length * 22;
  return `<section class="symptom-heatmap"><div class="symptom-heatmap-head"><div><h3>症状热力图</h3><span>点击症状，高亮上方同日期的数据点</span></div><button type="button" data-clear-symptom ${focusedSymptom ? '' : 'hidden'}>清除高亮</button></div><div class="heatmap-scroll"><div class="heatmap-grid" style="grid-template-columns:${columns};min-width:${width}px"><span class="heatmap-corner">症状 / 日期</span>${dates.map((date) => `<time>${date.slice(8)}</time>`).join('')}${symptoms.map(([label, total]) => `<button type="button" class="heatmap-label${focusedSymptom === label ? ' active' : ''}" data-heat-symptom="${escapeDaily(label)}">${escapeDaily(label)} <small>${total}</small></button>${dates.map((date) => { const present = eventMap.get(date)?.has(label); return `<span aria-hidden="true" class="heatmap-cell${present ? ' is-present' : ''}${focusedSymptom === label && present ? ' is-focused' : ''}"${present ? ` title="${date} · ${escapeDaily(label)}已记录"` : ''}></span>`; }).join('')}`).join('')}</div></div><p class="method-inline">单日色块只表示“出现/未出现”；疼痛强度统一按0–5分显示。</p></section>`;
}
function renderRelationshipSummary(logs) {
  const relation = bestRelationship(logs); if (!relation) return '<div class="relationship-card is-empty"><strong>关系分析仍在积累</strong><p>至少需要7组配对记录；14组以上且覆盖多个周期后，才会显示初步发现。</p></div>';
  const phaseCounts = relation.samples.reduce((map, sample) => map.set(sample.phase, (map.get(sample.phase) || 0) + 1), new Map()), dominant = [...phaseCounts.entries()].sort((a, b) => b[1] - a[1])[0], direction = relation.rho * relation.direction > 0 ? '按预期方向同时变化' : '呈反向变化';
  return `<div class="relationship-card"><div><span>个人关系观察</span><strong>${escapeDaily(relation.label)}</strong><p>${escapeDaily(direction)} · 相关程度 ${Math.abs(relation.rho) >= .6 ? '较明显' : Math.abs(relation.rho) >= .35 ? '中等' : '较弱'}</p></div><span class="confidence-badge level-${relation.confidence.level}">${relation.confidence.label}</span><dl><div><dt>配对记录</dt><dd>${relation.samples.length}组</dd></div><div><dt>周期覆盖</dt><dd>${relation.cycles}个</dd></div><div><dt>样本分布</dt><dd>${phaseName(dominant?.[0])}占${Math.round((dominant?.[1] || 0) / relation.samples.length * 100)}%</dd></div></dl><p class="method-inline"><button type="button" class="emoji-icon" data-method-info>ℹ️</button>${relation.detail}秩相关，只表示同时变化；没有排除周期阶段或未记录因素。</p></div>`;
}
function renderDailyOverview(logs) {
  const controls = document.querySelector('#dailyTrendControls'), chart = document.querySelector('#dailyTrendChart'), summary = document.querySelector('#dailyTrendSummary'); if (!controls || !chart || !summary) return;
  const ranges = [['week', '本周'], ['month', '本月'], ['quarter', '本季度']], range = rangeDates(), datedLogs = Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end), focusDates = new Set(datedLogs.filter(([, log]) => symptomLabels(log).includes(focusedSymptom)).map(([date]) => date));
  controls.innerHTML = `<div class="trend-switch" aria-label="趋势时间范围">${ranges.map(([key, label]) => `<button type="button" data-trend-range="${key}" class="${dailyTrendRange === key ? 'active' : ''}">${label}</button>`).join('')}</div><div class="comparison-picker"><span>选择两项进行对比</span><div>${Object.entries(OVERVIEW_SERIES).map(([key, config]) => `<button type="button" data-compare-metric="${key}" class="${comparisonMetrics.includes(key) ? 'active' : ''}" style="--series-color:${config.color}"><i></i>${config.label}</button>`).join('')}</div></div>`;
  chart.innerHTML = `${renderStatusOverview(logs)}<section class="comparison-section"><div class="comparison-heading"><div><span>${range.title}变化依据</span><h3>${comparisonMetrics.map((key) => OVERVIEW_SERIES[key].label).join(' × ')}</h3></div><small>最多同时显示两项</small></div>${datedLogs.length ? chartSeries(logs, range, comparisonMetrics, focusDates) : `<div class="trend-empty">${range.title}还没有每日状态记录。</div>`}</section>${renderHeatmap(logs, range)}`;
  const events = symptomEvents(logs, range), common = [...events.reduce((map, item) => { item.labels.forEach((label) => map.set(label, (map.get(label) || 0) + 1)); return map; }, new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  summary.innerHTML = `${renderRelationshipSummary(logs)}<div><strong>${datedLogs.length}天</strong><span>${range.title}有记录</span></div><div><strong>${events.length}天</strong><span>出现症状</span></div><div class="overview-summary-wide"><strong>${common.length ? common.map(([label, total]) => `${escapeDaily(label)} ${total}次`).join(' · ') : '暂无重复症状'}</strong><span>较常出现</span></div>`;
}
function renderDailyTrendView(logs) { renderTrendHighlights(logs); renderDailyOverview(logs); }

globalThis.renderDailyEnhancements = (context) => { dailyContext = context || dailyContext || { logs: readDailyLogs(), periods: [] }; const logs = context?.logs || readDailyLogs(); markStatusDates(logs); renderHomeStatus(logs); renderHomeDecision(logs); renderCyclePatternSummary(logs); renderDailyTrendView(logs); };
document.addEventListener('click', (event) => {
  const question = event.target.closest('[data-question-target]'); if (question) { const target = question.dataset.questionTarget; document.querySelectorAll('[data-question-panel]').forEach((panel) => { panel.hidden = panel.dataset.questionPanel !== target; }); document.querySelectorAll('[data-question-target]').forEach((button) => button.classList.toggle('active', button.dataset.questionTarget === target)); document.querySelector('#insights .page-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (event.target.closest('[data-view-insights]')) { document.querySelector('[data-view="insights"]')?.click(); return; }
  if (event.target.closest('[data-open-today-log]')) { document.querySelector('[data-open-log]')?.click(); return; }
  const completeAction = event.target.closest('[data-complete-action]'); if (completeAction) { const feedback = readActionFeedback(), date = completeAction.dataset.completeAction; feedback[date] = { ...(feedback[date] || {}), completed: true, completedAt: new Date().toISOString() }; writeActionFeedback(feedback); renderHomeDecision(dailyContext?.logs || readDailyLogs()); return; }
  const range = event.target.closest('[data-trend-range]'); if (range) { dailyTrendRange = range.dataset.trendRange; focusedSymptom = ''; renderDailyTrendView(dailyContext?.logs || readDailyLogs()); return; }
  const compare = event.target.closest('[data-compare-metric]'); if (compare) { const key = compare.dataset.compareMetric; if (comparisonMetrics.includes(key)) { if (comparisonMetrics.length > 1) comparisonMetrics = comparisonMetrics.filter((item) => item !== key); } else comparisonMetrics = [...comparisonMetrics, key].slice(-2); renderDailyOverview(dailyContext?.logs || readDailyLogs()); return; }
  const symptom = event.target.closest('[data-heat-symptom]'); if (symptom) { focusedSymptom = focusedSymptom === symptom.dataset.heatSymptom ? '' : symptom.dataset.heatSymptom; renderDailyOverview(dailyContext?.logs || readDailyLogs()); return; }
  if (event.target.closest('[data-clear-symptom]')) { focusedSymptom = ''; renderDailyOverview(dailyContext?.logs || readDailyLogs()); return; }
  const info = event.target.closest('[data-method-info],[data-insight-info]'); if (info) { alert('这些观察只使用你的自愿记录。个人范围采用同一周期阶段的历史中位数与四分位范围；关系分析使用秩相关，并同时检查配对数量、周期覆盖与阶段分布。结果不代表因果或诊断。'); return; }
  const day = event.target.closest('[data-date]'); if (day) queueMicrotask(() => enhanceDayDialog(day.dataset.date));
});
