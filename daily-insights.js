const DAILY_STORE_KEY = 'period-helper-state-v1';
const DAILY_LABELS = ['很低', '偏低', '一般', '较好', '很好'];
let dailyTrendRange = 'week';
let dailyTrendMetric = 'sleep';

function readDailyLogs() {
  try {
    const value = JSON.parse(localStorage.getItem(DAILY_STORE_KEY) || '{}');
    return value.logs && typeof value.logs === 'object' ? value.logs : {};
  } catch {
    return {};
  }
}

function localIso(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dateAt(value) {
  return new Date(`${value}T12:00:00`);
}

function addDate(value, amount) {
  const date = dateAt(value);
  date.setDate(date.getDate() + amount);
  return localIso(date);
}

function dayDistance(a, b) {
  return Math.round((dateAt(b) - dateAt(a)) / 86400000);
}

function escapeDaily(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function painParts(log = {}) {
  const symptoms = log.symptoms || [];
  const parts = symptoms.filter((item) => item.startsWith('疼痛部位：')).map((item) => item.slice(5));
  if (symptoms.includes('头痛') && !parts.includes('头部')) parts.push('头部');
  if (symptoms.includes('腰腹不适')) {
    if (!parts.includes('小腹/盆腔')) parts.push('小腹/盆腔');
    if (!parts.includes('腰背')) parts.push('腰背');
  }
  return parts;
}

function visibleSymptoms(log = {}) {
  return (log.symptoms || []).filter((item) => !item.startsWith('疼痛部位：') && !['头痛', '腰腹不适'].includes(item));
}

function rangeDates() {
  const now = new Date();
  const end = localIso(now);
  if (dailyTrendRange === 'week') {
    const mondayOffset = (now.getDay() + 6) % 7;
    return { start: addDate(end, -mondayOffset), end, title: '本周' };
  }
  if (dailyTrendRange === 'month') return { start: `${end.slice(0, 8)}01`, end, title: '本月' };
  const month = now.getMonth();
  const firstMonth = Math.floor(month / 3) * 3;
  return { start: localIso(new Date(now.getFullYear(), firstMonth, 1)), end, title: '本季度' };
}

function markStatusDates(logs) {
  document.querySelectorAll('[data-date]').forEach((button) => {
    const hasStatus = Boolean(logs[button.dataset.date]);
    button.classList.toggle('has-status', hasStatus);
    button.querySelector('.status-star')?.remove();
    if (hasStatus) button.insertAdjacentHTML('beforeend', '<span class="status-star" aria-hidden="true">★</span>');
  });
}

function metricValue(log, key) {
  const value = Number(log?.[key]);
  return Number.isFinite(value) ? value : null;
}

function renderHomeStatus(logs) {
  document.querySelector('#todayStatusDetail')?.remove();
  const grid = document.querySelector('#todaySnapshot');
  if (!grid) return;
  const log = logs[localIso(new Date())];
  const detail = document.createElement('div');
  detail.id = 'todayStatusDetail';
  detail.className = 'today-status-detail';
  if (!log) {
    detail.innerHTML = '<span class="muted">今天还没有记录身体状态。</span>';
  } else {
    const groups = [];
    const locations = painParts(log), symptoms = visibleSymptoms(log);
    if (locations.length) groups.push(`<span><strong>疼痛部位</strong>${locations.map(escapeDaily).join('、')}</span>`);
    if (symptoms.length) groups.push(`<span><strong>今日感受</strong>${symptoms.map(escapeDaily).join('、')}</span>`);
    if (log.temperature !== '' && log.temperature !== undefined) groups.push(`<span><strong>基础体温</strong>${escapeDaily(log.temperature)}℃</span>`);
    groups.push(`<span><strong>活动 / 压力</strong>${escapeDaily(log.activity || '—')} / ${escapeDaily(log.stress || '—')}</span>`);
    detail.innerHTML = groups.join('');
  }
  grid.insertAdjacentElement('afterend', detail);
}

function statusCard(date, log) {
  if (!log) return '<section class="day-status-card empty"><strong>身体状态</strong><p>这一天还没有记录身体状态。</p></section>';
  const ratings = [
    ['情绪', DAILY_LABELS[Number(log.mood) - 1] || '—'],
    ['精力', DAILY_LABELS[Number(log.energy) - 1] || '—'],
    ['睡眠', DAILY_LABELS[Number(log.sleep) - 1] || '—'],
    ['活动', `${log.activity || '—'}/5`],
    ['压力', `${log.stress || '—'}/5`],
    ['疼痛', `${log.pain ?? '—'}/10`]
  ];
  const locations = painParts(log), symptoms = visibleSymptoms(log);
  return `<section class="day-status-card"><div class="day-status-heading"><strong>身体状态记录</strong><span>${escapeDaily(date)}</span></div><div class="day-status-ratings">${ratings.map(([label, value]) => `<div><small>${label}</small><strong>${escapeDaily(value)}</strong></div>`).join('')}</div>${locations.length ? `<div class="day-status-row"><strong>疼痛部位</strong><span>${locations.map(escapeDaily).join('、')}</span></div>` : ''}${symptoms.length ? `<div class="day-status-row"><strong>今日感受</strong><span>${symptoms.map(escapeDaily).join('、')}</span></div>` : ''}${log.temperature !== '' && log.temperature !== undefined ? `<div class="day-status-row"><strong>基础体温</strong><span>${escapeDaily(log.temperature)}℃</span></div>` : ''}</section>`;
}

function enhanceDayDialog(date) {
  const dialog = document.querySelector('#dayDialog');
  const body = document.querySelector('#dayDialogBody');
  if (!dialog?.open || !body) return;
  [...body.children].filter((element) => element.tagName === 'P' && !element.classList.contains('period-overlap-note')).forEach((element) => element.remove());
  body.querySelector('.day-status-card')?.remove();
  const log = readDailyLogs()[date];
  body.insertAdjacentHTML('beforeend', statusCard(date, log));
  const editButton = document.querySelector('#dayEditLog');
  if (editButton) editButton.textContent = log ? '编辑身体状态' : '记录身体状态';
}

function trendPath(points, totalDays, yFor) {
  const width = 720, left = 42, right = 18;
  const xFor = (date) => left + (dayDistance(points.start, date) / Math.max(1, totalDays - 1)) * (width - left - right);
  const segments = [];
  let current = [];
  points.values.forEach((item, index) => {
    if (index && dayDistance(points.values[index - 1].date, item.date) > 2) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(`${xFor(item.date)},${yFor(item.value)}`);
  });
  if (current.length) segments.push(current);
  return { xFor, segments };
}

function renderDailyTrend(logs) {
  const controls = document.querySelector('#dailyTrendControls');
  const chart = document.querySelector('#dailyTrendChart');
  const summary = document.querySelector('#dailyTrendSummary');
  if (!controls || !chart || !summary) return;
  const ranges = [['week', '本周'], ['month', '本月'], ['quarter', '本季度']];
  const metrics = [['sleep', '睡眠'], ['mood', '情绪'], ['energy', '精力'], ['stress', '压力'], ['activity', '活动'], ['pain', '疼痛']];
  controls.innerHTML = `<div class="trend-switch" aria-label="趋势时间范围">${ranges.map(([key, label]) => `<button type="button" data-trend-range="${key}" class="${dailyTrendRange === key ? 'active' : ''}">${label}</button>`).join('')}</div><div class="trend-switch metric-switch" aria-label="趋势指标">${metrics.map(([key, label]) => `<button type="button" data-trend-metric="${key}" class="${dailyTrendMetric === key ? 'active' : ''}">${label}</button>`).join('')}</div>`;
  const range = rangeDates();
  const totalDays = dayDistance(range.start, range.end) + 1;
  const values = Object.entries(logs).filter(([date]) => date >= range.start && date <= range.end).map(([date, log]) => ({ date, value: metricValue(log, dailyTrendMetric) })).filter((item) => item.value !== null).sort((a, b) => a.date.localeCompare(b.date));
  const isPain = dailyTrendMetric === 'pain';
  const minScale = isPain ? 0 : 1, maxScale = isPain ? 10 : 5;
  const width = 720, height = 260, top = 22, bottom = 36;
  const yFor = (value) => top + ((maxScale - value) / (maxScale - minScale)) * (height - top - bottom);
  const points = trendPath({ start: range.start, values }, totalDays, yFor);
  const gridValues = isPain ? [0, 2, 4, 6, 8, 10] : [1, 2, 3, 4, 5];
  const paths = points.segments.map((segment) => segment.length > 1 ? `<polyline points="${segment.join(' ')}"/>` : '').join('');
  const dots = values.map((item) => `<circle cx="${points.xFor(item.date)}" cy="${yFor(item.value)}" r="5"><title>${item.date} · ${item.value}${isPain ? '/10' : '/5'}</title></circle>`).join('');
  chart.innerHTML = values.length ? `<div class="daily-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${range.title}${metrics.find(([key]) => key === dailyTrendMetric)[1]}趋势图">${gridValues.map((value) => `<line x1="42" y1="${yFor(value)}" x2="702" y2="${yFor(value)}"/><text x="12" y="${yFor(value) + 4}">${value}</text>`).join('')}${paths}${dots}<text x="42" y="250">${range.start.slice(5)}</text><text x="660" y="250">${range.end.slice(5)}</text></svg></div>` : `<div class="trend-empty">${range.title}还没有${metrics.find(([key]) => key === dailyTrendMetric)[1]}记录。</div>`;
  if (!values.length) {
    summary.innerHTML = '<p class="muted">没有记录的日期会留空，不会按0分计算。</p>';
    return;
  }
  const numbers = values.map((item) => item.value);
  const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const latest = values[values.length - 1];
  summary.innerHTML = `<div><strong>${average.toFixed(1)}${isPain ? '/10' : '/5'}</strong><span>平均值</span></div><div><strong>${Math.min(...numbers)}–${Math.max(...numbers)}</strong><span>记录范围</span></div><div><strong>${values.length}天</strong><span>有记录</span></div><div><strong>${latest.value}${isPain ? '/10' : '/5'}</strong><span>最近一次 · ${latest.date.slice(5)}</span></div><p>图线只连接相邻或间隔不超过2天的记录；较长空档会断开，避免把未记录日误认为状态没有变化。</p>`;
}

globalThis.renderDailyEnhancements = () => {
  const logs = readDailyLogs();
  markStatusDates(logs);
  renderHomeStatus(logs);
  renderDailyTrend(logs);
};

document.addEventListener('click', (event) => {
  const range = event.target.closest('[data-trend-range]');
  if (range) {
    dailyTrendRange = range.dataset.trendRange;
    renderDailyTrend(readDailyLogs());
    return;
  }
  const metric = event.target.closest('[data-trend-metric]');
  if (metric) {
    dailyTrendMetric = metric.dataset.trendMetric;
    renderDailyTrend(readDailyLogs());
    return;
  }
  const day = event.target.closest('[data-date]');
  if (day) queueMicrotask(() => enhanceDayDialog(day.dataset.date));
});
