const PHASE_SELECTION = Object.freeze({
  period: Object.freeze({ fallback: Object.freeze(['millet-yam', 'red-bean-pumpkin']), conditional: Object.freeze(['ginger-jujube']) }),
  follicular: Object.freeze({ fallback: Object.freeze(['black-bean-bowl']), conditional: Object.freeze(['black-soy-milk', 'oat-sesame', 'yam-jujube-congee', 'black-bean-walnut-congee', 'lily-lotus-soup']) }),
  ovulation: Object.freeze({ fallback: Object.freeze(['pear-lily']), conditional: Object.freeze(['rose-chenpi', 'yam-jujube-congee']) }),
  pms: Object.freeze({ fallback: Object.freeze(['pear-lily']), conditional: Object.freeze(['rose-chenpi', 'pumpkin-walnut-bowl', 'lily-lotus-soup', 'rose-pear-water', 'ginger-jujube']) })
});

const daySeed = (date) => {
  const value = Date.parse(`${date || '1970-01-01'}T12:00:00Z`);
  return Number.isFinite(value) ? Math.floor(value / 86400000) : 0;
};

const signalScore = (recipe, signals) => recipe.signals
  .filter((signal) => signal !== 'neutral' && signals.has(signal)).length;

export function selectDailyNourishment({ recipes = [], phase_key, record_date, signals = [] } = {}) {
  const plan = PHASE_SELECTION[phase_key];
  if (!plan || !Array.isArray(recipes) || !recipes.length) return null;
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const signalSet = signals instanceof Set ? signals : new Set(signals);
  const conditional = plan.conditional.map((id) => byId.get(id)).filter(Boolean)
    .map((recipe) => ({ recipe, score: signalScore(recipe, signalSet) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || (right.recipe.priority || 0) - (left.recipe.priority || 0));
  if (conditional.length) return conditional[0].recipe;
  const fallback = plan.fallback.map((id) => byId.get(id)).filter(Boolean);
  return fallback.length ? fallback[Math.abs(daySeed(record_date)) % fallback.length] : null;
}

export const DailyNourishment = Object.freeze({ select: selectDailyNourishment });
