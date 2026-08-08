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
  pain: { label: '疼痛', min: 0, max: 10, unit: '/10' },
  bedtime: { label: '入睡', min: 0, max: 1, unit: '', binary: ['23:00后', '23:00前'] },
  bowel: { label: '排便', min: 0, max: 1, unit: '', binary: ['未排便', '已排便'] }
};

function readDailyLogs() { try { const value = JSON.parse(localStorage.getItem(DAILY_STORE_KEY) || '{}'); return value.logs && typeof value.logs === 'object' ? value.logs : {}; } catch { return {}; } }
function localIso(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function dateAt(value) { return new Date(`${value}T12:00:00`); }
function addDate(value, amount) { const date = dateAt(value); date.setDate(date.getDate() + amount); return localIso(date); }
function dayDistance(a, b) { return Math.round((dateAt(b) - dateAt(a)) / 86400000); }
function escapeDaily(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function tagged(log, prefix) { return (log?.symptoms || []).find((item) => item.startsWith(prefix))?.slice(prefix.length); }
function painParts(log = {}) { const symptoms = log.symptoms || []; const parts = symptoms.filter((item) => item.startsWith('疼痛部位：')).map((item) => item.slice(5)); if (symptoms.includes('头痛') && !parts.includes('头部')) parts.push('头部'); if (symptoms.includes('腰腹不适')) { if (!parts.includes('小腹/盆腔')) parts.push('小腹/盆腔'); if (!parts.includes('腰背')) parts.push('腰背'); } return parts; }
function visibleSymptoms(log = {}) { return (log.symptoms || []).filter((item) => !item.startsWith('疼痛部位：') && !item.startsWith('入睡：') && !item.startsWith('排便：') && !['头痛', '腰腹不适'].includes(item)); }

function rangeDates() { const now = new Date(), end = localIso(now); if (dailyTrendRange === 'week') { const mondayOffset = (now.getDay() + 6) % 7; return { start: addDate(end, -mondayOffset), end, title: '本周' }; } if (dailyTrendRange === 'month') return { start: `${end.slice(0, 8)}01`, end, title: '本月' }; const firstMonth = Math.floor(now.getMonth() / 3) * 3; return { start: localIso(new Date(now.getFullYear(), firstMonth, 1)), end, title: '本季度' }; }

function markStatusDates(logs) { document.querySelectorAll('[data-date]').forEach((button) => { const hasStatus = Boolean(logs[button.dataset.date]); button.classList.toggle('has-status', hasStatus); button.querySelector('.status-star')?.remove(); if (hasStatus) button.insertAdjacentHTML('beforeend', '<span class="status-star" aria-hidden="true">♥</span>'); }); }
function metricValue(log, key) { if (key === 'bedtime') { const value = tagged(log, '入睡：'); return value === '23:00前' ? 1 : value === '23:00后' ? 0 : null; } if (key === 'bowel') { const value = tagged(log, '排便：'); return value === '已排便' ? 1 : value === '未排便' ? 0 : null; } const value = Number(log?.[key]); return Number.isFinite(value) ? value : null; }
function metricLabel(value, config) { return config.binary ? config.binary[value] : `${value}${config.unit}`; }

function renderHomeStatus(logs) { document.querySelector('#todayStatusDetail')?.remove(); const grid = document.querySelector('#todaySnapshot'); if (!grid) return; const log = logs[localIso(new Date())], detail = document.createElement('div'); detail.id = 'todayStatusDetail'; detail.className = 'today-status-detail'; if (!log) detail.innerHTML = '<span class="muted">今天还没有记录身体状态。</span>'; else { const groups = [], locations = painParts(log), symptoms = visibleSymptoms(log), bedtime = tagged(log, '入睡：'), bowel = tagged(log, '排便：'); if (bedtime) groups.push(`<span><strong>入睡时间</strong>${escapeDaily(bedtime)}入睡</span>`); if (bowel) groups.push(`<span><strong>排便</strong>${escapeDaily(bowel)}</span>`); if (locations.length) groups.push(`<span><strong>疼痛部位</strong>${locations.map(escapeDaily).join('、')}</span>`); if (symptoms.length) groups.push(`<span><strong>今日感受</strong>${symptoms.map(escapeDaily).join('、')}</span>`); if (log.temperature !== '' && log.temperature !== undefined) groups.push(`<span><strong>基础体温</strong>${escapeDaily(log.temperature)}℃</span>`); groups.push(`<span><strong>活动 / 压力</strong>${escapeDaily(log.activity || '—')} / ${escapeDaily(log.stress || '—')}</span>`); detail.innerHTML = groups.join(''); } grid.insertAdjacentElement('afterend', detail); }

function statusCard(date, log) { if (!log) return '<section class="day-status-card empty"><strong>身体状态</strong><p>这一天还没有记录身体状态。</p></section>'; const ratings = [['情绪', DAILY_LABELS[Number(log.mood) - 1] || '—'], ['精力', DAILY_LABELS[Number(log.energy) - 1] || '—'], ['睡眠', DAILY_LABELS[Number(log.sleep) - 1] || '—'], ['活动', `${log.activity || '—'}/5`], ['压力', `${log.stress || '—'}/5`], ['疼痛', `${log.pain ?? '—'}/10`]], locations = painParts(log), symptoms = visibleSymptoms(log), bedtime = tagged(log, '入睡：'), bowel = tagged(log, '排便：'); return `<section class="day-status-card"><div class="day-status-heading"><strong>身体状态记录</strong><span>${escapeDaily(date)}</span></div><div class="day-status-ratings">${ratings.map(([label, value]) => `<div><small>${label}</small><strong>${escapeDaily(value)}</strong></div>`).join('')}</div>${bedtime ? `<div class="day-status-row"><strong>入睡时间</strong><span>${escapeDaily(bedtime)}入睡</span></div>` : ''}${bowel ? `<div class="day-status-row"><strong>排便</strong><span>${escapeDaily(bowel)}</span></div>` : ''}${locations.length ? `<div class="day-status-row"><strong>疼痛部位</strong><span>${locations.map(escapeDaily).join('、')}</span></div>` : ''}${symptoms.length ? `<div class="day-status-row"><strong>今日感受</strong><span>${symptoms.map(escapeDaily).join('、')}</span></div>` : ''}${log.temperature !== '' && log.temperature !== undefined ? `<div class="day-status-row"><strong>基础体温</strong><span>${escapeDaily(log.temperature)}℃</span></div>` : ''}</section>`; }

function enhanceDayDialog(date) { const dialog = document.querySelector('#dayDialog'), body = document.querySelector('#dayDialogBody'); if (!dialog?.open || !body) return; [...body.children].filter((element) => element.tagName === 'P' && !element.classList.contains('period-overlap-note')).forEach((element) => element.remove()); body.querySelector('.day-status-card')?.remove(); const log = readDailyLogs()[date]; body.insertAdjacentHTML('beforeend', statusCard(date, log)); const editButton = document.querySelector('#dayEditLog'); if (editButton) editButton.textContent = log ? '编辑身体状态' : '记录身体状态'; }

function pointSegments(range, values, totalDays, yFor) { const width = 720, left = 42, right = 18, xFor = (date) => left + (dayDistance(range.start, date) / Math.max(1, totalDays - 1)) * (width - left - right), segments = []; let current = []; values.forEach((item, index) => { if (index && dayDistance(values[index - 1].date, item.date) > 2) { if (current.length) segments.push(current); current = []; } current.push({ x: xFor(item.date), y: yFor(item.value) }); }); if (current.length) segments.push(current); return { xFor, segments }; }
function smoothPath(points) { if (points.length < 2) return ''; let result = `M ${points[0].x} ${points[0].y}`; for (let index = 1; index < points.length - 1; index++) { const current = points[index], next = points[index + 1], midX = (current.x + next.x) / 2, midY = (current.y + next.y) / 2; result += ` Q ${current.x} ${current.y} ${midX} ${midY}`; } const last = points.at(-1); return `${result} L ${last.x} ${last.y}`; }
function areaPath(points, baseline) { const line = smoothPath(points); return line ? `${line} L ${points.at(-1).x} ${baseline} L ${points[0].x} ${baseline} Z` : ''; }

function renderDailyTrend(logs) { const controls = document.querySelector('#dailyTrendControls'), chart = document.querySelector('#dailyTrendChart'), summary = document.querySelector('#dailyTrendSummary'); if (!controls || !chart || !summary) return; const ranges = [['week', '本周'], ['month', '本月'], ['quarter', '本季度']], metrics = Object.entries(METRICS).map(([key, value]) => [key, value.label]); controls.innerHTML = `<div class="trend-switch" aria-label="趋势时间范围">${ranges.map(([key, label]) => `<button type="button" data-trend-range="${key}" class="${dailyTrendRange === key ? 'active' : ''}">${label}</button>`).join('')}</div><div class="trend-switch metric-switch" aria-label="趋势指标">${metrics.map(([key, label]) => `<button type="button" data-trend-metric="${key}" class="${dailyTrendMetric === key ? 'active' : ''}">${label}</button>`).join('')}</div>`; const range = rangeDates(), config = METRICS[dailyTrendMetric], totalDays = dayDistance(range.start, range.end) + 1, values = Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).map(([date, log]) => ({ date, value: metricValue(log, dailyTrendMetric) })).filter((item) => item.value !== null).sort((a, b) => a.date.localeCompare(b.date)), width = 720, height = 260, top = 24, bottom = 38, baseline = height - bottom, yFor = (value) => top + ((config.max - value) / Math.max(1, config.max - config.min)) * (baseline - top), points = pointSegments(range, values, totalDays, yFor), gridValues = config.binary ? [0, 1] : config.max === 10 ? [0, 2, 4, 6, 8, 10] : [1, 2, 3, 4, 5], lines = points.segments.map((segment) => `<path class="trend-area" d="${areaPath(segment, baseline)}"/><path class="trend-line" d="${smoothPath(segment)}"/>`).join(''), dots = values.map((item) => `<circle cx="${points.xFor(item.date)}" cy="${yFor(item.value)}" r="5"><title>${item.date} · ${metricLabel(item.value, config)}</title></circle>`).join(''); chart.innerHTML = values.length ? `<div class="daily-chart-arch"><div class="daily-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${range.title}${config.label}趋势图"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#dceaf3" stop-opacity=".85"/><stop offset="1" stop-color="#dceaf3" stop-opacity=".18"/></linearGradient></defs>${gridValues.map((value) => `<line x1="42" y1="${yFor(value)}" x2="702" y2="${yFor(value)}"/><text x="7" y="${yFor(value) + 4}">${config.binary ? config.binary[value] : value}</text>`).join('')}${lines}${dots}<text x="42" y="250">${range.start.slice(5)}</text><text x="660" y="250">${range.end.slice(5)}</text></svg></div></div>` : `<div class="trend-empty">${range.title}还没有${config.label}记录。</div>`; if (!values.length) { summary.innerHTML = '<p class="muted">没有记录的日期会留空，不会按0分计算。</p>'; return; } const numbers = values.map((item) => item.value), latest = values.at(-1); if (config.binary) { const positive = numbers.filter((value) => value === 1).length; summary.innerHTML = `<div><strong>${positive}/${values.length}天</strong><span>${config.binary[1]}</span></div><div><strong>${values.length - positive}/${values.length}天</strong><span>${config.binary[0]}</span></div><div><strong>${metricLabel(latest.value, config)}</strong><span>最近一次 · ${latest.date.slice(5)}</span></div><p>只统计主动记录的日期；未记录不等同于没有发生。</p>`; return; } const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length; summary.innerHTML = `<div><strong>${average.toFixed(1)}${config.unit}</strong><span>平均值</span></div><div><strong>${Math.min(...numbers)}–${Math.max(...numbers)}</strong><span>记录范围</span></div><div><strong>${values.length}天</strong><span>有记录</span></div><div><strong>${metricLabel(latest.value, config)}</strong><span>最近一次 · ${latest.date.slice(5)}</span></div><p>图线只连接相邻或间隔不超过2天的记录；较长空档会断开，避免把未记录日误认为状态没有变化。</p>`; }

const OVERVIEW_SERIES = {
  sleep: { label: '睡眠', color: '#527FA7' },
  mood: { label: '情绪', color: '#D9578F' },
  energy: { label: '精力', color: '#70AD9F' },
  activity: { label: '活动', color: '#D58718' },
  stress: { label: '压力', color: '#302C34', adverse: true },
  pain: { label: '疼痛', color: '#A7211D', adverse: true }
};

function overviewValue(log, key) {
  const value = metricValue(log, key);
  if (value === null) return null;
  return key === 'pain' ? value / 2 : value;
}

function symptomEvents(logs, range) {
  return Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).sort(([a], [b]) => a.localeCompare(b)).map(([date, log]) => {
    const labels = [...visibleSymptoms(log), ...painParts(log).map((part) => `疼痛·${part}`)];
    if (tagged(log, '入睡：') === '23:00后') labels.push('23点后入睡');
    if (tagged(log, '排便：') === '未排便') labels.push('未排便');
    return { date, labels: [...new Set(labels)] };
  }).filter((item) => item.labels.length);
}

function renderDailyOverview(logs) {
  const controls = document.querySelector('#dailyTrendControls'), chart = document.querySelector('#dailyTrendChart'), summary = document.querySelector('#dailyTrendSummary');
  if (!controls || !chart || !summary) return;
  const ranges = [['week', '本周'], ['month', '本月'], ['quarter', '本季度']], metrics = [['overview', '总览'], ...Object.entries(METRICS).map(([key, value]) => [key, value.label])];
  controls.innerHTML = `<div class="trend-switch" aria-label="趋势时间范围">${ranges.map(([key, label]) => `<button type="button" data-trend-range="${key}" class="${dailyTrendRange === key ? 'active' : ''}">${label}</button>`).join('')}</div><div class="trend-switch metric-switch" aria-label="趋势指标">${metrics.map(([key, label]) => `<button type="button" data-trend-metric="${key}" class="${dailyTrendMetric === key ? 'active' : ''}">${label}</button>`).join('')}</div>`;
  const range = rangeDates(), totalDays = dayDistance(range.start, range.end) + 1, width = 720, height = 286, top = 22, bottom = 48, baseline = height - bottom, yFor = (value) => top + ((5 - value) / 5) * (baseline - top), datedLogs = Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).sort(([a], [b]) => a.localeCompare(b));
  const series = Object.entries(OVERVIEW_SERIES).map(([key, config]) => {
    const values = datedLogs.map(([date, log]) => ({ date, value: overviewValue(log, key), raw: metricValue(log, key) })).filter((item) => item.value !== null);
    const points = pointSegments(range, values, totalDays, yFor);
    const lines = overviewMetrics.has(key) ? points.segments.map((segment) => `<path class="overview-line ${config.adverse ? 'adverse' : ''}" stroke="${config.color}" d="${smoothPath(segment)}"/>`).join('') : '';
    const dots = overviewMetrics.has(key) ? values.map((item) => `<circle class="overview-dot" style="fill:${config.color}" cx="${points.xFor(item.date)}" cy="${yFor(item.value)}" r="3.5"><title>${item.date} · ${config.label} ${key === 'pain' ? `${item.raw}/10` : `${item.raw}/5`}</title></circle>`).join('') : '';
    return lines + dots;
  }).join('');
  const events = symptomEvents(logs, range);
  const legend = `<div class="overview-legend" aria-label="总览曲线图例">${Object.entries(OVERVIEW_SERIES).map(([key, config]) => `<button type="button" data-overview-series="${key}" class="${overviewMetrics.has(key) ? 'active' : ''}" style="--series-color:${config.color}"><span></span>${config.label}</button>`).join('')}</div>`;
  const eventList = events.length ? `<section class="symptom-timeline"><div class="symptom-timeline-head"><h3>症状时间轴</h3><span>与上方曲线按日期对照</span></div><div class="symptom-event-list">${events.map((item) => `<div class="symptom-event"><time>${item.date.slice(5)}</time><div>${item.labels.map((label) => `<span>${escapeDaily(label)}</span>`).join('')}</div></div>`).join('')}</div></section>` : '<div class="trend-empty">这个时间范围内还没有记录症状事件。</div>';
  chart.innerHTML = datedLogs.length ? `${legend}<div class="daily-chart-arch overview-chart"><div class="daily-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${range.title}每日状态总览曲线图">${[1, 2, 3, 4, 5].map((value) => `<line x1="42" y1="${yFor(value)}" x2="702" y2="${yFor(value)}"/><text x="18" y="${yFor(value) + 4}">${value}</text>`).join('')}${series}<text x="42" y="276">${range.start.slice(5)}</text><text x="660" y="276">${range.end.slice(5)}</text></svg></div></div>${eventList}` : `<div class="trend-empty">${range.title}还没有每日状态记录。</div>`;
  const counts = new Map(); events.forEach((item) => item.labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1)));
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  summary.innerHTML = datedLogs.length ? `<div><strong>${datedLogs.length}天</strong><span>有记录</span></div><div><strong>${events.length}天</strong><span>出现症状</span></div><div class="overview-summary-wide"><strong>${common.length ? common.map(([label, count]) => `${escapeDaily(label)} ${count}次`).join(' · ') : '暂无重复症状'}</strong><span>较常出现</span></div><p>所有曲线按同一天对齐；疼痛由10分制折算到5分刻度显示，悬停圆点仍可查看原始分数。同步变化只能提示关联，不能直接证明因果。</p>` : '<p class="muted">没有记录的日期会留空，不会按0分计算。</p>';
}

function renderDailyTrendView(logs) {
  if (dailyTrendMetric === 'overview') { renderDailyOverview(logs); return; }
  renderDailyTrend(logs);
  document.querySelector('.metric-switch')?.insertAdjacentHTML('afterbegin', '<button type="button" data-trend-metric="overview">总览</button>');
}

globalThis.renderDailyEnhancements = () => { const logs = readDailyLogs(); markStatusDates(logs); renderHomeStatus(logs); renderDailyTrendView(logs); };
document.addEventListener('click', (event) => { const range = event.target.closest('[data-trend-range]'); if (range) { dailyTrendRange = range.dataset.trendRange; renderDailyTrendView(readDailyLogs()); return; } const metric = event.target.closest('[data-trend-metric]'); if (metric) { dailyTrendMetric = metric.dataset.trendMetric; renderDailyTrendView(readDailyLogs()); return; } const overview = event.target.closest('[data-overview-series]'); if (overview) { const key = overview.dataset.overviewSeries; if (overviewMetrics.has(key) && overviewMetrics.size > 1) overviewMetrics.delete(key); else overviewMetrics.add(key); renderDailyOverview(readDailyLogs()); return; } const day = event.target.closest('[data-date]'); if (day) queueMicrotask(() => enhanceDayDialog(day.dataset.date)); });
