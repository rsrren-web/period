const LEGACY_USAGE_KEY = 'period-intervention-usage-v1';
const MAX_RECORDS = 500;
let adapter = null;

const dateKey = (value = new Date()) => { const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) return ''; return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const stringList = (value) => [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item).slice(0, 20))];
const nullableScore = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function normalizeInterventionFeedback(record = {}) {
  const usedAt = typeof record.used_at === 'string' ? record.used_at : new Date().toISOString(), interventionId = String(record.intervention_id || record.id || '').slice(0, 120);
  if (!interventionId) return null;
  return { feedback_id: String(record.feedback_id || `feedback:${interventionId}:${usedAt}`).slice(0, 260), context_version: Number(record.context_version) === 1 ? 1 : 0, record_date: /^\d{4}-\d{2}-\d{2}$/.test(record.record_date || '') ? record.record_date : dateKey(usedAt), cycle_phase: typeof record.cycle_phase === 'string' ? record.cycle_phase.slice(0, 40) : null, cycle_day: Number.isInteger(record.cycle_day) ? record.cycle_day : null, matched_signals: stringList(record.matched_signals), matched_states: stringList(record.matched_states), matched_patterns: stringList(record.matched_patterns), intervention_id: interventionId, intervention_name: String(record.intervention_name || interventionId).slice(0, 120), target: String(record.target || 'general').slice(0, 120), recommendation_id: record.recommendation_id ? String(record.recommendation_id).slice(0, 160) : null, source_event_id: record.source_event_id ? String(record.source_event_id).slice(0, 160) : null, source_pattern_id: record.source_pattern_id ? String(record.source_pattern_id).slice(0, 160) : null, helpful: record.helpful === true || record.outcome === 'helpful', before: nullableScore(record.before), after: nullableScore(record.after), adverse_effect: record.adverse_effect === true, used_at: usedAt, updated_at: typeof record.updated_at === 'string' ? record.updated_at : usedAt };
}

export function mergeInterventionUsage(left = [], right = []) {
  const map = new Map();
  for (const raw of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) { const item = normalizeInterventionFeedback(raw); if (!item) continue; const old = map.get(item.feedback_id); if (!old || String(item.updated_at) >= String(old.updated_at)) map.set(item.feedback_id, item); }
  return [...map.values()].sort((a, b) => a.used_at.localeCompare(b.used_at)).slice(-MAX_RECORDS);
}

function legacyRecords() { try { return JSON.parse(localStorage.getItem(LEGACY_USAGE_KEY) || '[]'); } catch { return []; } }
export function readInterventionUsage() { return adapter ? mergeInterventionUsage([], adapter.read()) : mergeInterventionUsage([], legacyRecords()); }
function writeInterventionUsage(records) { if (adapter) adapter.write(mergeInterventionUsage([], records)); else localStorage.setItem(LEGACY_USAGE_KEY, JSON.stringify(mergeInterventionUsage([], records))); }
export function configureInterventionFeedback(nextAdapter) { adapter = nextAdapter; const legacy = mergeInterventionUsage([], legacyRecords()); if (legacy.length) { adapter.write(mergeInterventionUsage(adapter.read(), legacy), { migration: true }); localStorage.removeItem(LEGACY_USAGE_KEY); } }

export function hasInterventionFeedbackToday(interventionId, records = readInterventionUsage()) { const today = dateKey(); return Boolean(interventionId) && records.some((record) => record.intervention_id === interventionId && (record.record_date || dateKey(record.used_at)) === today); }
export function interventionHistoryBeforeToday(records = readInterventionUsage()) { const today = dateKey(); return records.filter((record) => (record.record_date || dateKey(record.used_at)) !== today); }
function markRecordedButtons(interventionId) { document.querySelectorAll?.('[data-intervention-feedback]').forEach((button) => { if (button.dataset.interventionFeedback !== interventionId) return; button.disabled = true; button.textContent = '今天已记录 ✓'; button.classList?.add('is-recorded'); button.setAttribute?.('aria-label', `${button.dataset.interventionName || '这项调养'}今天已记录效果`); }); }
function parseContext(value) { try { const item = JSON.parse(decodeURIComponent(value || '')); return item && typeof item === 'object' ? item : {}; } catch { return {}; } }

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-intervention-feedback]'); if (!button) return;
  if (hasInterventionFeedbackToday(button.dataset.interventionFeedback)) { markRecordedButtons(button.dataset.interventionFeedback); document.dispatchEvent(new CustomEvent('intervention-feedback-saved', { detail: { interventionId: button.dataset.interventionFeedback, duplicate: true } })); return; }
  const dialog = document.querySelector('#interventionFeedbackDialog'), form = document.querySelector('#interventionFeedbackForm'); if (!dialog || !form) return;
  form.reset(); form.elements.interventionId.value = button.dataset.interventionFeedback; form.elements.interventionName.value = button.dataset.interventionName; form.elements.target.value = button.dataset.interventionTarget; form.dataset.recommendationId = button.dataset.recommendationId || ''; form.dataset.sourceEventId = button.dataset.sourceEventId || ''; form.dataset.sourcePatternId = button.dataset.sourcePatternId || ''; form.dataset.feedbackContext = button.dataset.feedbackContext || ''; document.querySelector('#interventionFeedbackName').textContent = button.dataset.interventionName; dialog.showModal();
});

document.querySelector('#interventionFeedbackForm')?.addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form), records = readInterventionUsage(), interventionId = data.get('interventionId');
  if (hasInterventionFeedbackToday(interventionId, records)) { markRecordedButtons(interventionId); document.querySelector('#interventionFeedbackDialog')?.close(); document.dispatchEvent(new CustomEvent('intervention-feedback-saved', { detail: { interventionId, duplicate: true } })); return; }
  const score = (name) => data.get(name) === '' ? null : Number(data.get(name)), now = new Date().toISOString(), context = parseContext(form.dataset.feedbackContext);
  records.push(normalizeInterventionFeedback({ feedback_id: crypto.randomUUID(), context_version: 1, record_date: dateKey(), cycle_phase: context.cycle_phase, cycle_day: context.cycle_day, matched_signals: context.matched_signals, matched_states: context.matched_states, matched_patterns: context.matched_patterns, intervention_id: interventionId, intervention_name: data.get('interventionName'), target: data.get('target'), recommendation_id: form.dataset.recommendationId || null, source_event_id: form.dataset.sourceEventId || null, source_pattern_id: form.dataset.sourcePatternId || null, helpful: data.get('helpful') === 'yes', before: score('before'), after: score('after'), adverse_effect: data.get('adverseEffect') === 'yes', used_at: now, updated_at: now }));
  writeInterventionUsage(records); markRecordedButtons(interventionId); document.querySelector('#interventionFeedbackDialog')?.close(); document.dispatchEvent(new CustomEvent('intervention-feedback-saved', { detail: { interventionId, duplicate: false } }));
});
