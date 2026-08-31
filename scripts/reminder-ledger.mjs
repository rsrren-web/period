import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const digest = (value) => createHash('sha256').update(String(value)).digest('hex');

export async function openReminderLedger(path) {
  let entries = [];
  let history = [];
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (Array.isArray(value?.entries)) entries = value.entries.filter((item) => /^[a-f0-9]{64}$/.test(item));
    if (Array.isArray(value?.history)) history = value.history.filter((item) => item && ['owner', 'partner'].includes(item.audience) && typeof item.role === 'string' && typeof item.topic === 'string').slice(-100);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const values = new Set(entries);
  const persist = () => writeFile(path, `${JSON.stringify({ version: 2, entries: [...values].slice(-500), history: history.slice(-100) }, null, 2)}\n`, 'utf8');
  return Object.freeze({
    has: (key) => values.has(digest(key)),
    history: () => history.map((item) => ({ ...item })),
    async add(key) {
      values.add(digest(key));
      await persist();
    },
    async remember(item) {
      if (!item || !['owner', 'partner'].includes(item.audience) || typeof item.role !== 'string' || typeof item.topic !== 'string') return;
      history.push({ audience: item.audience, role: item.role, topic: item.topic });
      history = history.slice(-100);
      await persist();
    }
  });
}
