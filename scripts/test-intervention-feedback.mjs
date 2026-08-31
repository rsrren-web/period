import assert from 'node:assert/strict';

const documentListeners = new Map();
const formListeners = new Map();
const storage = new Map();
let opened = false;
let closed = false;
let savedEvent = false;

const form = {
  dataset: {},
  elements: {
    interventionId: { value: '' },
    interventionName: { value: '' },
    target: { value: '' }
  },
  values: new Map(),
  reset() {},
  addEventListener(type, listener) { formListeners.set(type, listener); }
};
const dialog = { showModal() { opened = true; }, close() { closed = true; } };
const name = { textContent: '' };

globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); }
};
globalThis.document = {
  addEventListener(type, listener) { documentListeners.set(type, listener); },
  querySelector(selector) { return selector === '#interventionFeedbackDialog' ? dialog : selector === '#interventionFeedbackForm' ? form : selector === '#interventionFeedbackName' ? name : null; },
  dispatchEvent(event) { if (event.type === 'intervention-feedback-saved') savedEvent = true; }
};
globalThis.FormData = class {
  constructor(source) { this.values = source.values; }
  get(key) { return this.values.get(key) ?? null; }
};
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

const module = await import(`../intervention-feedback.js?test=${Date.now()}`);
const button = { dataset: { interventionFeedback: 'tea_1', interventionName: '测试茶饮', interventionTarget: 'appetite_low', recommendationId: 'rec_1', sourceEventId: 'event_1', sourcePatternId: '' } };
documentListeners.get('click')({ target: { closest: () => button } });
assert.equal(opened, true, '点击效果按钮必须打开反馈弹窗');
assert.equal(form.elements.interventionId.value, 'tea_1');
assert.equal(name.textContent, '测试茶饮');

form.values = new Map([['interventionId', 'tea_1'], ['interventionName', '测试茶饮'], ['target', 'appetite_low'], ['helpful', 'yes'], ['before', '4'], ['after', '2']]);
formListeners.get('submit')({ preventDefault() {}, currentTarget: form });
assert.equal(closed, true, '保存后必须关闭反馈弹窗');
assert.equal(savedEvent, true, '保存后必须通知趋势页局部刷新');
assert.deepEqual(module.readInterventionUsage().map(({ used_at, ...item }) => item), [{ intervention_id: 'tea_1', intervention_name: '测试茶饮', target: 'appetite_low', recommendation_id: 'rec_1', source_event_id: 'event_1', source_pattern_id: null, helpful: true, before: 4, after: 2 }]);

console.log('Intervention feedback click and save tests passed.');
