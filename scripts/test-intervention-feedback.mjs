import assert from 'node:assert/strict';

const documentListeners = new Map();
const formListeners = new Map();
const storage = new Map();
let opened = false;
let closed = false;
let savedEvent = false;
let savedDetail = null;
const buttonClasses = new Set();
const button = {
  dataset: { interventionFeedback: 'tea_1', interventionName: '测试茶饮', interventionTarget: 'appetite_low', recommendationId: 'rec_1', sourceEventId: 'event_1', sourcePatternId: '' },
  disabled: false,
  textContent: '记录这次效果',
  classList: { add(value) { buttonClasses.add(value); } },
  setAttribute() {}
};

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
  querySelectorAll(selector) { return selector === '[data-intervention-feedback]' ? [button] : []; },
  dispatchEvent(event) { if (event.type === 'intervention-feedback-saved') { savedEvent = true; savedDetail = event.detail; } }
};
globalThis.FormData = class {
  constructor(source) { this.values = source.values; }
  get(key) { return this.values.get(key) ?? null; }
};
globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };

const module = await import(`../intervention-feedback.js?test=${Date.now()}`);
documentListeners.get('click')({ target: { closest: () => button } });
assert.equal(opened, true, '点击效果按钮必须打开反馈弹窗');
assert.equal(form.elements.interventionId.value, 'tea_1');
assert.equal(name.textContent, '测试茶饮');

form.values = new Map([['interventionId', 'tea_1'], ['interventionName', '测试茶饮'], ['target', 'appetite_low'], ['helpful', 'yes'], ['adverseEffect', 'no'], ['before', '4'], ['after', '2']]);
formListeners.get('submit')({ preventDefault() {}, currentTarget: form });
assert.equal(closed, true, '保存后必须关闭反馈弹窗');
assert.equal(savedEvent, true, '保存后必须通知趋势页局部刷新');
assert.equal(savedDetail.duplicate, false, '首次保存必须明确标记成功');
assert.equal(button.disabled, true, '同一天保存后按钮必须锁定');
assert.equal(button.textContent, '今天已记录 ✓', '按钮必须直接显示成功状态');
assert.equal(buttonClasses.has('is-recorded'), true);
const saved = module.readInterventionUsage()[0];
assert.deepEqual({ intervention_id: saved.intervention_id, intervention_name: saved.intervention_name, target: saved.target, recommendation_id: saved.recommendation_id, source_event_id: saved.source_event_id, source_pattern_id: saved.source_pattern_id, helpful: saved.helpful, before: saved.before, after: saved.after, adverse_effect: saved.adverse_effect }, { intervention_id: 'tea_1', intervention_name: '测试茶饮', target: 'appetite_low', recommendation_id: 'rec_1', source_event_id: 'event_1', source_pattern_id: null, helpful: true, before: 4, after: 2, adverse_effect: false });
assert.equal(saved.context_version,1,'新反馈必须带上下文版本');
assert.match(saved.feedback_id,/^[0-9a-f-]{36}$/,'新反馈必须有跨设备稳定去重 ID');
assert.match(saved.record_date,/^\d{4}-\d{2}-\d{2}$/);
assert.equal(module.normalizeInterventionFeedback({intervention_id:'blank-score',before:null,after:''}).before,null,'空评分不得被迁移成0分');
assert.equal(module.hasInterventionFeedbackToday('tea_1'), true);
assert.equal(module.interventionHistoryBeforeToday().length, 0, '今天的反馈不得让今天的建议进入冷却并消失');

const yesterday = new Date(Date.now() - 86400000).toISOString();
const withYesterday = [...module.readInterventionUsage(), { intervention_id: 'tea_old', used_at: yesterday }];
assert.equal(module.interventionHistoryBeforeToday(withYesterday).length, 1, '历史反馈仍须参与后续推荐排序');

formListeners.get('submit')({ preventDefault() {}, currentTarget: form });
assert.equal(module.readInterventionUsage().length, 1, '同一天同一调养项目不得重复写入');
assert.equal(savedDetail.duplicate, true, '重复提交必须返回已记录状态');

console.log('Intervention feedback click and save tests passed.');
