import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openReminderLedger } from './reminder-ledger.mjs';

const directory = await mkdtemp(join(tmpdir(), 'period-reminder-ledger-'));
try {
  const path = join(directory, 'ledger.json');
  const first = await openReminderLedger(path);
  assert.equal(first.has('period-ended:2026-08-09:2026-08-15'), false);
  await first.add('period-ended:2026-08-09:2026-08-15');
  const restored = await openReminderLedger(path);
  assert.equal(restored.has('period-ended:2026-08-09:2026-08-15'), true);
  assert.equal(restored.has('period-ended:other'), false);
  console.log('Reminder ledger hashing and persistence tests passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
