const USAGE_KEY = 'period-intervention-usage-v1';

export function readInterventionUsage() {
  try {
    const value = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeInterventionUsage(records) {
  localStorage.setItem(USAGE_KEY, JSON.stringify(records.slice(-300)));
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function hasInterventionFeedbackToday(interventionId, records = readInterventionUsage()) {
  const today = localDateKey();
  return Boolean(interventionId) && records.some((record) => record.intervention_id === interventionId && localDateKey(record.used_at) === today);
}

function markRecordedButtons(interventionId) {
  document.querySelectorAll?.('[data-intervention-feedback]').forEach((button) => {
    if (button.dataset.interventionFeedback !== interventionId) return;
    button.disabled = true;
    button.textContent = '今天已记录 ✓';
    button.classList?.add('is-recorded');
    button.setAttribute?.('aria-label', `${button.dataset.interventionName || '这项调养'}今天已记录效果`);
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-intervention-feedback]');
  if (!button) return;
  if (hasInterventionFeedbackToday(button.dataset.interventionFeedback)) {
    markRecordedButtons(button.dataset.interventionFeedback);
    document.dispatchEvent(new CustomEvent('intervention-feedback-saved', { detail: { interventionId: button.dataset.interventionFeedback, duplicate: true } }));
    return;
  }
  const dialog = document.querySelector('#interventionFeedbackDialog');
  const form = document.querySelector('#interventionFeedbackForm');
  if (!dialog || !form) return;
  form.reset();
  form.elements.interventionId.value = button.dataset.interventionFeedback;
  form.elements.interventionName.value = button.dataset.interventionName;
  form.elements.target.value = button.dataset.interventionTarget;
  form.dataset.recommendationId = button.dataset.recommendationId || '';
  form.dataset.sourceEventId = button.dataset.sourceEventId || '';
  form.dataset.sourcePatternId = button.dataset.sourcePatternId || '';
  document.querySelector('#interventionFeedbackName').textContent = button.dataset.interventionName;
  dialog.showModal();
});

document.querySelector('#interventionFeedbackForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const score = (name) => data.get(name) === '' ? null : Number(data.get(name));
  const records = readInterventionUsage();
  const interventionId = data.get('interventionId');
  if (hasInterventionFeedbackToday(interventionId, records)) {
    markRecordedButtons(interventionId);
    document.querySelector('#interventionFeedbackDialog')?.close();
    document.dispatchEvent(new CustomEvent('intervention-feedback-saved', { detail: { interventionId, duplicate: true } }));
    return;
  }
  records.push({
    intervention_id: interventionId,
    intervention_name: data.get('interventionName'),
    target: data.get('target'),
    recommendation_id: form.dataset.recommendationId || null,
    source_event_id: form.dataset.sourceEventId || null,
    source_pattern_id: form.dataset.sourcePatternId || null,
    helpful: data.get('helpful') === 'yes',
    before: score('before'),
    after: score('after'),
    used_at: new Date().toISOString()
  });
  writeInterventionUsage(records);
  markRecordedButtons(interventionId);
  document.querySelector('#interventionFeedbackDialog')?.close();
  document.dispatchEvent(new CustomEvent('intervention-feedback-saved', { detail: { interventionId, duplicate: false } }));
});
