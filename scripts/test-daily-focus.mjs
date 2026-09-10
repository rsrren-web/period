import assert from 'node:assert/strict';
import { chooseDailyFocus, migrateLegacyFocusHistory, sleepFocusVariant } from '../wellness-engine.js';

const candidates = [
  { id: 'sleep', priority: 13, title: '睡眠' },
  { id: 'activity', priority: 7, title: '活动' },
  { id: 'pms', priority: 1, title: '阶段' }
];

assert.equal(chooseDailyFocus(candidates, [{ date: '2026-09-08', id: 'sleep' }], '2026-09-09').id, 'sleep', '普通建议可以连续出现第二天');
assert.equal(chooseDailyFocus(candidates, [{ date: '2026-09-08', id: 'sleep' }, { date: '2026-09-09', id: 'sleep' }], '2026-09-10').id, 'activity', '普通建议连续两天后必须让出至少一天');

const urgent = [{ id: 'pain', priority: 14, bypassCooldown: true }, ...candidates];
assert.equal(chooseDailyFocus(urgent, [{ date: '2026-09-08', id: 'pain' }, { date: '2026-09-09', id: 'pain' }], '2026-09-10').id, 'pain', '持续的高疼痛不得为了轮换而被隐藏');

assert.deepEqual(sleepFocusVariant('2026-09-10'), sleepFocusVariant('2026-09-10'), '同一天的睡眠行动必须稳定');
assert.notEqual(sleepFocusVariant('2026-09-10').action, sleepFocusVariant('2026-09-11').action, '连续日期应提供不同的睡眠行动');

const migrated = migrateLegacyFocusHistory(['sleep', 'activity'], '2026-09-10');
assert.deepEqual(migrated, [{ date: '2026-09-08', id: 'sleep' }, { date: '2026-09-09', id: 'sleep' }], '旧版最近建议必须迁移为一次立即生效的轮换冷却');
assert.equal(chooseDailyFocus(candidates, migrated, '2026-09-10').id, 'activity', '升级当天不得重新连续展示旧版首位建议');

console.log('Daily focus rotation, cooldown and urgent override tests passed.');
