const DEFAULT_KEY = 'period-baseline-snapshots-v1';

export function readBaselineSnapshots(storage = globalThis.localStorage, key = DEFAULT_KEY) {
  if (!storage) return [];
  try { const value = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

export function appendBaselineSnapshot(snapshot, storage = globalThis.localStorage, key = DEFAULT_KEY) {
  if (!storage || !snapshot?.id) return { added: false, snapshots: [] };
  const snapshots = readBaselineSnapshots(storage, key);
  if (snapshots.some(item => item.id === snapshot.id)) return { added: false, snapshots };
  const next = [...snapshots, snapshot];
  storage.setItem(key, JSON.stringify(next));
  return { added: true, snapshots: next };
}

export const BASELINE_SNAPSHOT_STORAGE_KEY = DEFAULT_KEY;
