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

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-intervention-feedback]');
  if (!button) return;
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
  records.push({
    intervention_id: data.get('interventionId'),
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
  document.querySelector('#interventionFeedbackDialog')?.close();
  document.dispatchEvent(new CustomEvent('intervention-feedback-saved'));
});
