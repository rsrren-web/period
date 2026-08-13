import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDailyLogs } from '../daily-record-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'user-data.json');
const state = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const before = state.logs && typeof state.logs === 'object' ? state.logs : {};
const logs = migrateDailyLogs(before);

const report = {
  records: Object.keys(logs).length,
  legacyRecordsMigrated: Object.values(before).filter((log) => log?.modelVersion !== 2).length,
  explicitBowelYes: Object.values(logs).filter((log) => log.bowelMovement === true).length,
  explicitBowelNo: Object.values(logs).filter((log) => log.bowelMovement === false).length,
  bowelUnrecorded: Object.values(logs).filter((log) => log.bowelMovement === null).length,
  bedtimeRecorded: Object.values(logs).filter((log) => log.bedtime !== null).length,
  structuredEmotionRecorded: Object.values(logs).filter((log) => log.primaryEmotion !== null).length,
  preservedLegacyTags: Object.values(logs).reduce((sum, log) => sum + log.legacySymptoms.length, 0)
};

const migrated = { ...state, schemaVersion: 2, logs };
fs.writeFileSync(dataPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
