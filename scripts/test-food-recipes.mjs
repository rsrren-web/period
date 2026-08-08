globalThis.document = { querySelector(selector) { if (selector === '#tcmAdvice') return globalThis.out; return { textContent: '', className: '' }; } };
globalThis.out = { innerHTML: '' };
await import('../traditional-care.js');
const cases = [
  [{key:'follicular'}, {energy:2}, '无糖黑豆浆'],
  [{key:'follicular'}, {energy:4}, '黑豆煮水'],
  [{key:'pms'}, {stress:4}, '玫瑰陈皮饮'],
  [{key:'period'}, {symptoms:['怕冷']}, '淡姜枣饮'],
  [{key:'period'}, {}, '小米山药粥'],
  [{key:'ovulation'}, {}, '雪梨百合饮']
];
for (const [phase, log, expected] of cases) {
  globalThis.renderTraditionalAdvice(phase, log);
  if (!globalThis.out.innerHTML.includes(expected)) throw new Error(`未触发 ${expected}`);
  for (const label of ['食材','做法','为什么今天推荐','先换一个']) {
    if (!globalThis.out.innerHTML.includes(label)) throw new Error(`缺少 ${label}`);
  }
  console.log(`${phase.key}: ${expected}`);
}
