const DAY_MS = 86400000;

function at(date) { return new Date(`${date}T12:00:00Z`); }
function add(date, amount) { const value = at(date); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function escape(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

function correlation(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const xMean = mean(xs), yMean = mean(ys);
  const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0);
  const xSpread = Math.sqrt(xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0));
  const ySpread = Math.sqrt(ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0));
  return xSpread && ySpread ? numerator / (xSpread * ySpread) : null;
}

function cycleSamples(context) {
  return context.intervals.slice(-12).map((cycle) => {
    const end = add(cycle.start, cycle.length - 1);
    const entries = Object.entries(context.logs).filter(([date]) => date >= cycle.start && date <= end).map(([, log]) => log);
    if (entries.length < 3) return null;
    const average = (key) => mean(entries.map((log) => Number(log[key])).filter(Number.isFinite));
    const bedtime = mean(entries.map((log) => {
      const value = (log.symptoms || []).find((item) => item.startsWith('入睡：'));
      if (!value) return NaN;
      return value === '入睡：23:00前' ? 1 : value === '入睡：23:00后' ? 0 : NaN;
    }).filter(Number.isFinite));
    return {
      length: cycle.length,
      days: entries.length,
      sleep: average('sleep'),
      mood: average('mood'),
      energy: average('energy'),
      activity: average('activity'),
      stress: average('stress'),
      bedtime
    };
  }).filter(Boolean);
}

function renderFactors(context) {
  const root = document.querySelector('#personalFactorInsight');
  if (!root) return;
  const samples = cycleSamples(context);
  root.closest('.panel')?.classList.toggle('is-empty-state', samples.length < 3);
  if (samples.length < 3) {
    const loggedCycles = samples.length;
    root.innerHTML = `<div class="observation-empty"><strong>还需要至少 ${3 - loggedCycles} 个有记录的完整周期</strong><p>每个周期记录至少3天后，才会比较睡眠、压力、活动、情绪和精力与周期长度是否反复同时变化。现在不会根据少量记录猜测原因。</p></div><p class="observation-method">当前可分析完整周期：${loggedCycles}个；建议在经前一周和周期中段各记录几天。</p>`;
    return;
  }
  const factors = [
    { key: 'stress', label: '压力偏高', direction: 1 },
    { key: 'sleep', label: '睡眠偏低', direction: -1 },
    { key: 'energy', label: '精力偏低', direction: -1 },
    { key: 'activity', label: '活动偏少', direction: -1 },
    { key: 'mood', label: '情绪评分偏低', direction: -1 },
    { key: 'bedtime', label: '23:00后入睡', direction: -1 }
  ].map((factor) => {
    const usable = samples.filter((sample) => Number.isFinite(sample[factor.key]));
    const raw = correlation(usable.map((sample) => sample[factor.key]), usable.map((sample) => sample.length));
    const aligned = raw === null ? null : raw * factor.direction;
    const absolute = Math.abs(aligned || 0);
    const strength = usable.length < 4 || raw === null ? '样本不足' : absolute >= .6 ? '较强关联' : absolute >= .35 ? '中等关联' : '弱关联';
    const tone = absolute >= .6 ? 'strong' : absolute >= .35 ? 'medium' : 'light';
    return { ...factor, usable: usable.length, aligned, strength, tone };
  }).sort((a, b) => Math.abs(b.aligned || 0) - Math.abs(a.aligned || 0));
  const meaningful = factors.filter((factor) => factor.aligned > .2 && factor.usable >= 4);
  root.innerHTML = `<div class="factor-list">${factors.map((factor) => `<div class="factor-row"><div><strong>${factor.label}</strong><span>${factor.usable}个可比较周期</span></div><span class="factor-strength ${factor.tone}">${factor.strength}</span></div>`).join('')}</div><div class="observation-note">${meaningful.length ? `你的记录中，${meaningful.slice(0, 2).map((factor) => factor.label).join('、')}与周期较长曾较常同时出现。可以在未来周期优先观察，但不能据此判断它们造成了周期变化。` : '目前没有看到稳定的中等以上个人关联；继续记录比强行解释更可靠。'}</div><p class="observation-method">分析最近最多12个完整周期；每周期至少3条每日状态。关联不是病因，也未排除疾病、旅行等未记录因素。</p>`;
}

function symptomName(value) {
  return value.startsWith('疼痛部位：') ? value.slice(5) + '不适' : value;
}

function isMetadataTag(value) {
  return value.startsWith('入睡：') || value.startsWith('排便：');
}

function pmsSamples(context) {
  return context.periods.slice(-7).map((period) => {
    const start = add(period.start, -7), end = add(period.start, -1);
    const entries = Object.entries(context.logs).filter(([date]) => date >= start && date <= end).map(([date, log]) => ({ date, log }));
    if (!entries.length) return null;
    const burdens = entries.map(({ log }) => {
      const pain = clamp(Number(log.pain) || 0, 0, 10) / 10;
      const mood = (5 - clamp(Number(log.mood) || 3, 1, 5)) / 4;
      const sleep = (5 - clamp(Number(log.sleep) || 3, 1, 5)) / 4;
      const energy = (5 - clamp(Number(log.energy) || 3, 1, 5)) / 4;
      const stress = (clamp(Number(log.stress) || 3, 1, 5) - 1) / 4;
      const symptoms = Math.min((log.symptoms || []).filter((item) => !isMetadataTag(item)).length / 5, 1);
      return (pain * .25 + mood * .2 + sleep * .15 + energy * .15 + stress * .15 + symptoms * .1) * 100;
    });
    return { period: period.start, entries, burden: mean(burdens) };
  }).filter(Boolean);
}

function reliefSuggestions(topSymptoms, burden) {
  const text = topSymptoms.join('、');
  const suggestions = [];
  if (/焦虑|生气|害怕|紧张|情绪低落/.test(text)) suggestions.push('把经前高压安排提前或拆小，并直接告诉毛毛球你希望获得倾听、独处还是实际帮助。');
  if (/嗜睡|疲倦/.test(text)) suggestions.push('经前两三天给睡眠留出30–60分钟缓冲，运动以散步和舒展为主。');
  if (/腹胀|恶心|食欲变化/.test(text)) suggestions.push('规律少量进食、补水，减少过晚大餐；不需要为了“调经”强行进补。');
  if (/小腹|腰背|乳房|头部|疼痛/.test(text) || burden >= 45) suggestions.push('可用温热而不烫的热敷15–20分钟；疼痛突然加重或明显影响生活时应寻求专业评估。');
  if (!suggestions.length) suggestions.push('继续保持规律睡眠、进食和轻柔活动，并记录真正有效的缓解方式。');
  return suggestions.slice(0, 3);
}

function renderPms(context) {
  const root = document.querySelector('#pmsInsight');
  const badge = document.querySelector('#pmsBurden');
  if (!root || !badge) return;
  const samples = pmsSamples(context);
  const loggedDays = samples.reduce((sum, sample) => sum + sample.entries.length, 0);
  root.closest('.panel')?.classList.toggle('is-empty-state', samples.length < 2 || loggedDays < 4);
  if (samples.length < 2 || loggedDays < 4) {
    badge.textContent = '记录不足';
    badge.dataset.level = 'unknown';
    root.innerHTML = `<div class="observation-empty"><strong>还不能稳定评估经前不适</strong><p>需要至少2个经前窗口、合计4天的每日状态。系统会关注疼痛、睡眠、情绪、精力、压力和症状频率，不会诊断PMS或PMDD。</p></div><p class="observation-method">当前：${samples.length}个经前窗口，${loggedDays}个记录日。</p>`;
    return;
  }
  const burden = Math.round(mean(samples.map((sample) => sample.burden)));
  const level = burden >= 65 ? '较高' : burden >= 40 ? '中等' : '较轻';
  badge.textContent = `${level} · ${burden}/100`;
  badge.dataset.level = burden >= 65 ? 'high' : burden >= 40 ? 'medium' : 'low';
  const counts = new Map();
  samples.flatMap((sample) => sample.entries).forEach(({ log }) => (log.symptoms || []).filter((symptom) => !isMetadataTag(symptom)).forEach((symptom) => counts.set(symptomName(symptom), (counts.get(symptomName(symptom)) || 0) + 1)));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const suggestions = reliefSuggestions(top.map(([name]) => name), burden);
  root.innerHTML = `<div class="pms-summary"><div><strong>${samples.length}个</strong><span>有记录的经前窗口</span></div><div><strong>${loggedDays}天</strong><span>经前记录日</span></div></div>${top.length ? `<div class="symptom-frequency"><strong>较常记录的感受</strong>${top.map(([name, count]) => `<span>${escape(name)} · ${count}天</span>`).join('')}</div>` : '<p class="muted">这些经前记录没有症状标签。</p>'}<div class="relief-list"><strong>下次可尝试</strong>${suggestions.map((suggestion) => `<p>${escape(suggestion)}</p>`).join('')}</div><p class="observation-method">这是个人记录负担分，不是医学量表。若情绪或疼痛严重影响生活，请寻求专业帮助；若出现伤害自己的想法，请立即联系当地急救或危机支持。</p>`;
}

globalThis.renderPersonalInsights = (context) => {
  if (!context?.periods?.length) return;
  renderFactors(context);
  renderPms(context);
};
