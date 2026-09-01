import assert from 'node:assert/strict';
import { DAILY_DETAIL_LABELS, dailyDetailRows, readDailyDetails, writeDailyDetails } from '../daily-detail-model.js';
import { compatibilityTags } from '../daily-record-model.js';
import { readTcmObservations, writeTcmObservations } from '../tcm-observation-model.js';

const base = writeTcmObservations(['普通标签'], { cold_sensation: 'yes', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no' });
const encoded = writeDailyDetails(base, {
  pain_nature: ['distending', 'cold'], pain_response: ['heat_relief', 'activity_change'], bowel: 'sticky',
  body_sense: ['cold_hands_feet', 'edema'], sleep_issue: ['waking', 'unrefreshed']
});
const restored = readDailyDetails(encoded);
assert.deepEqual(restored.pain_nature, ['distending', 'cold']);
assert.deepEqual(restored.pain_response, ['heat_relief', 'activity_change']);
assert.equal(restored.bowel, 'sticky');
assert.deepEqual(restored.body_sense, ['cold_hands_feet', 'edema']);
assert.deepEqual(restored.sleep_issue, ['waking', 'unrefreshed']);
assert.equal(readTcmObservations(encoded).cold_sensation, 'yes', '写入每日细节不得覆盖原有中医体感');
assert.ok(encoded.includes('普通标签'));

const explicitNone = writeDailyDetails(encoded, { pain_nature: [], pain_response: [], bowel: 'normal', body_sense: [], sleep_issue: [] });
assert.deepEqual(readDailyDetails(explicitNone).pain_nature, []);
assert.equal(readDailyDetails(explicitNone).bowel, 'normal');
assert.equal(compatibilityTags({ modelVersion: 3, symptomTags: explicitNone, fieldStatus: {}, updatedAt: new Date(0).toISOString() }).some((tag) => tag.startsWith('detail:')), false, '内部结构化标签不得以乱码形式展示');
assert.equal(DAILY_DETAIL_LABELS.sleep_issue.unrefreshed, '睡够仍累');
assert.ok(dailyDetailRows(encoded).some(([field, values]) => field === 'body_sense' && values.includes('手脚冷')));

const oldClientRewrite = writeTcmObservations(encoded, { cold_sensation: 'no', warmth_relief: 'no', nausea: 'no', diarrhea: 'no', bloating: 'no', poor_appetite: 'no', body_heaviness: 'no' });
assert.equal(readDailyDetails(oldClientRewrite).bowel, 'sticky', '旧版体感保存必须保留新版细节标签');

console.log('Daily menstrual, pain, bowel, body and sleep detail tags passed.');
