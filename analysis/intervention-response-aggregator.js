const round = (value) => value === null ? null : Math.round(value * 1000) / 1000;

export function aggregateInterventionResponses(entries = []) {
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.intervention_id || !entry?.target || !entry?.used_at) continue;
    const key = `${entry.target}:${entry.intervention_id}`;
    const list = groups.get(key) || []; list.push(entry); groups.set(key, list);
  }
  return [...groups.values()].flatMap((items) => {
    if (items.length < 3) return [];
    const paired = items.filter((item) => Number.isFinite(Number(item.before)) && Number.isFinite(Number(item.after)));
    const helpful = items.filter((item) => item.helpful === true || item.outcome === 'helpful').length;
    const meanBefore = paired.length ? paired.reduce((sum, item) => sum + Number(item.before), 0) / paired.length : null;
    const meanAfter = paired.length ? paired.reduce((sum, item) => sum + Number(item.after), 0) / paired.length : null;
    return [{ interventionId: items[0].intervention_id, interventionName: items[0].intervention_name || items[0].intervention_id, target: items[0].target, uses: items.length, improvementCount: helpful, helpfulRate: items.length ? helpful / items.length : null, meanBefore: round(meanBefore), meanAfter: round(meanAfter), meanDelta: meanBefore === null || meanAfter === null ? null : round(meanBefore - meanAfter), dataLabel: items.length < 5 ? '数据仍少' : '可比较', status: items.length < 5 ? 'exploratory' : 'usable' }];
  });
}

export const InterventionResponseAggregator = Object.freeze({ aggregate: aggregateInterventionResponses });
