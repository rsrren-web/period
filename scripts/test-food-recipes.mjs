import assert from 'node:assert/strict';
import fs from 'node:fs';

const library = JSON.parse(fs.readFileSync(new URL('../knowledge/interventions.v1.json', import.meta.url), 'utf8'));
const edible = library.interventions.filter((item) => ['tea', 'food'].includes(item.category));
assert.equal(edible.length, 48);
for (const item of edible) {
  assert.ok(item.execution?.ingredients?.length, `${item.id} 缺少具体用料`);
  assert.ok(item.execution?.steps?.length, `${item.id} 缺少具体步骤`);
  assert.ok(item.execution.ingredients.some((part) => part.name !== '水'), `${item.id} 不能把水作为唯一食养内容`);
}
console.log(`食养干预库：${edible.length}项均包含具体用料和步骤。`);

