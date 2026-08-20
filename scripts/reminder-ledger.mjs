import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const digest = (value) => createHash('sha256').update(String(value)).digest('hex');

export async function openReminderLedger(path) {
  let entries = [];
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (Array.isArray(value?.entries)) entries = value.entries.filter((item) => /^[a-f0-9]{64}$/.test(item));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const values = new Set(entries);
  return Object.freeze({
    has: (key) => values.has(digest(key)),
    async add(key) {
      values.add(digest(key));
      await writeFile(path, `${JSON.stringify({ version: 1, entries: [...values].slice(-500) }, null, 2)}\n`, 'utf8');
    }
  });
}
