import assert from 'node:assert/strict';
import { analyzePeriodTiming } from '../analysis/period-timing.js';

const period = (start, end = start) => ({ type: 'period', start, end, status: 'confirmed', updatedAt: `${start}T12:00:00.000Z` });
const reported = (values) => ({ ...values, fieldStatus: Object.fromEntries(Object.keys(values).map((key) => [key, 'reported'])) });

const within = analyzePeriodTiming({
  periods: [period('2026-01-01'), period('2026-01-30'), period('2026-02-28')],
  as_of: '2026-03-10'
});
assert.equal(within.latest.direction, 'within_range');
assert.equal(within.latest.deltaDays, 0);
assert.equal(within.trend.status, 'no_repeated_shift');

const early = analyzePeriodTiming({
  periods: [period('2026-01-01'), period('2026-01-30'), period('2026-02-28'), period('2026-03-25'), period('2026-04-19')],
  logs: {
    '2026-03-20': reported({ stress: 5 }),
    '2026-04-15': reported({ stress: 4 })
  },
  as_of: '2026-05-30',
  safety_profile: { pregnancyStatus: 'possible' }
});
assert.equal(early.latest.direction, 'early');
assert.equal(early.latest.deltaDays, -4);
assert.equal(early.latest.outsideByDays, 2);
assert.equal(early.trend.status, 'repeated_early');
assert.equal(early.trend.count, 2);
assert.equal(early.tcmContext.eligible, true);
assert.deepEqual(early.tcmContext.signals.map((item) => item.id), ['stress_high']);
assert.equal(early.current.status, 'past_window');
assert.equal(early.current.pregnancyCheckRelevant, true);

const ongoing = analyzePeriodTiming({
  periods: [period('2026-01-01'), period('2026-01-30'), period('2026-02-28'), { type: 'period', start: '2026-03-29', end: '', status: 'ongoing' }],
  as_of: '2026-04-30'
});
assert.equal(ongoing.current, null, '进行中的经期不得显示当前周期推迟');

console.log('Period timing tests passed');
