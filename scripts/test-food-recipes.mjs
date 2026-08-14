import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectDailyNourishment } from '../analysis/daily-nourishment.js';

const library = JSON.parse(fs.readFileSync(new URL('../knowledge/interventions.v1.json', import.meta.url), 'utf8'));
const edible = library.interventions.filter((item) => ['tea', 'food'].includes(item.category));
assert.equal(edible.length, 48);
for (const item of edible) {
  assert.ok(item.execution?.ingredients?.length, `${item.id} 缺少具体用料`);
  assert.ok(item.execution?.steps?.length, `${item.id} 缺少具体步骤`);
  assert.ok(item.execution.ingredients.some((part) => part.name !== '水'), `${item.id} 不能把水作为唯一食养内容`);
}
console.log(`食养干预库：${edible.length}项均包含具体用料和步骤。`);

const legacySource = fs.readFileSync(new URL('../knowledge/wellness-knowledge.js', import.meta.url), 'utf8');
const recipes = [...legacySource.matchAll(/id: '([^']+)', title: '([^']+)', phases: \[([^\]]+)\], signals: \[([^\]]+)\], priority: (\d+)/g)]
  .map(([, id, title, phases, signals, priority]) => ({
    id, title, priority: Number(priority),
    phases: [...phases.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    signals: [...signals.matchAll(/'([^']+)'/g)].map((match) => match[1])
  }));
for (const phase of ['period', 'follicular', 'ovulation', 'pms']) {
  const selected = selectDailyNourishment({ recipes, phase_key: phase, record_date: '2026-08-13', signals: [] });
  assert.ok(selected, `${phase} should always have one daily nourishment item`);
  assert.ok(selected.phases.includes(phase), `${selected.id} must support ${phase}`);
}
assert.equal(selectDailyNourishment({ recipes, phase_key: 'pms', record_date: '2026-08-13', signals: ['焦虑'] }).id, 'rose-chenpi');
console.log('每日阶段食养：四阶段均固定提供1项，选择确定且不随机。');
