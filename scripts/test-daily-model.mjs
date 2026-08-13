import assert from 'node:assert/strict';
import { compatibilityTags, migrateDailyLog, migrateDailyLogs } from '../daily-record-model.js';

const updatedAt = '2026-08-13T12:00:00.000Z';
const unknown = migrateDailyLog({ mood: '3', energy: '2', sleep: '4', activity: '3', stress: '2', pain: '0', symptoms: [], temperature: '', updatedAt });
assert.equal(unknown.modelVersion, 2);
assert.equal(unknown.bowelMovement, null, '未记录排便必须保持 null');
assert.equal(unknown.bedtime, null, '未记录入睡时段必须保持 null');
assert.equal(unknown.exerciseTypes, null, '未记录运动类型必须保持 null');
assert.equal(unknown.symptomTags, null, '无症状标签不能被误写成明确“没有症状”');
assert.equal(unknown.fieldStatus.mood, 'legacy_uncertain');

const explicitNo = migrateDailyLog({ mood: '3', energy: '2', sleep: '4', activity: '3', stress: '2', pain: '0', symptoms: ['排便：未排便', '入睡：23:00后'], temperature: '', updatedAt });
assert.equal(explicitNo.bowelMovement, false, '明确未排便必须保存为 false');
assert.equal(explicitNo.bedtime, 'after_23');
assert.equal(explicitNo.fieldStatus.bowelMovement, 'reported');
assert.ok(compatibilityTags(explicitNo).includes('排便：未排便'));

const explicitYes = migrateDailyLog({ modelVersion: 2, mood: null, energy: 3, sleep: 3, activity: 2, stress: 4, pain: 0, primaryEmotion: null, bedtime: null, bowelMovement: true, exerciseTypes: null, socialTypes: null, socialIntensity: null, socialEffect: null, painLocations: null, symptomTags: null, temperature: null, fieldStatus: { bowelMovement: 'reported' }, legacySymptoms: [], updatedAt }, { legacy: false });
assert.equal(explicitYes.bowelMovement, true);
assert.equal(explicitYes.mood, null);
assert.deepEqual(migrateDailyLogs({ '2026-08-13': explicitYes }), { '2026-08-13': explicitYes }, 'v2 迁移必须幂等');

console.log('Daily record model v2 tests passed.');
