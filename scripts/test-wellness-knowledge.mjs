import {
  ACUPOINTS,
  CARE_PRACTICES,
  FOOD_RECIPES,
  KNOWLEDGE_GUARDRAILS,
  KNOWLEDGE_SOURCES,
  PHASE_THEORY,
  STATUS_SIGNAL_RULES
} from '../knowledge/wellness-knowledge.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sourceIds = new Set(KNOWLEDGE_SOURCES.map(({ id }) => id));

assert(KNOWLEDGE_SOURCES.length >= 12, '知识来源数量不足');
assert(FOOD_RECIPES.length >= 8, '具体食谱数量不足');
assert(ACUPOINTS.length >= 5, '穴位条目数量不足');
assert(CARE_PRACTICES.length >= 4, '调养方法数量不足');
assert(['period', 'follicular', 'ovulation', 'pms'].every((key) => PHASE_THEORY[key]), '周期理论不完整');
assert(['period', 'follicular', 'ovulation', 'pms'].every((key) => PHASE_THEORY[key].rhythm?.length >= 12), '周期消长脉络不完整');
assert(KNOWLEDGE_GUARDRAILS.length >= 5, '知识引擎安全边界不足');
assert(STATUS_SIGNAL_RULES.length >= 8, '每日八维状态映射不足');
assert(!FOOD_RECIPES.some((recipe) => /藏红花|红花|丹参|当归|黄芪|桂枝/.test(`${recipe.ingredients}${recipe.steps}`)), '自动食养库不得包含药物处方材料');

for (const recipe of FOOD_RECIPES) {
  assert(recipe.title?.length >= 2, `${recipe.id} 缺少 title`);
  for (const field of ['ingredients', 'steps', 'why', 'skip']) assert(recipe[field]?.length >= 8, `${recipe.id} 缺少 ${field}`);
  assert(recipe.sources?.length, `${recipe.id} 缺少知识来源`);
  assert(recipe.sources.every((id) => sourceIds.has(id)), `${recipe.id} 使用了未知来源`);
}

for (const point of ACUPOINTS) {
  assert(point.name?.length >= 2, `${point.id} 缺少 name`);
  for (const field of ['location', 'method', 'why', 'skip']) assert(point[field]?.length >= 6, `${point.id} 缺少 ${field}`);
}

console.log(`知识引擎：${KNOWLEDGE_SOURCES.length}项来源、${FOOD_RECIPES.length}份食谱、${ACUPOINTS.length}个穴位、${CARE_PRACTICES.length}种调养方法、${STATUS_SIGNAL_RULES.length}条状态映射`);
