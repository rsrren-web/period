import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveList, resolvePresenceGroup, resolveScalar, resolvedStatus } from '../daily-entry-semantics.js';

assert.equal(resolveScalar({ prior: null, submitted: null, touched: false, parse: Number }), null);
assert.equal(resolveScalar({ prior: 4, submitted: null, touched: false, parse: Number }), 4);
assert.equal(resolveScalar({ prior: 4, submitted: '2', touched: true, parse: Number }), 2);
assert.equal(resolveScalar({ prior: 4, submitted: null, touched: true, parse: Number }), null);

assert.deepEqual(resolveList({ prior: ['拉伸'], touched: false }), ['拉伸']);
assert.equal(resolveList({ prior: null, touched: false }), null);
assert.deepEqual(resolveList({ selected: ['拉伸', '拉伸'], touched: true }), ['拉伸']);
assert.deepEqual(resolveList({ selected: [], touched: true, confirmedNone: true }), []);
assert.equal(resolveList({ selected: [], touched: true, confirmedNone: false }), null);

assert.deepEqual(
  resolvePresenceGroup({ prior: { cold: 'yes', warm: 'no' }, fields: ['cold', 'warm'], touched: false }),
  { cold: 'yes', warm: 'no' }
);
assert.deepEqual(
  resolvePresenceGroup({ fields: ['cold', 'warm'], selected: ['cold'], touched: true }),
  { cold: 'yes', warm: null }
);
assert.deepEqual(
  resolvePresenceGroup({ fields: ['cold', 'warm'], touched: true, confirmedNone: true }),
  { cold: 'no', warm: 'no' }
);

assert.equal(resolvedStatus(null, { touched: true }), 'not_recorded');
assert.equal(resolvedStatus([], { touched: true }), 'reported');
assert.equal(resolvedStatus(4, { priorStatus: 'legacy_uncertain', touched: false }), 'legacy_uncertain');
assert.equal(resolvedStatus(4, { touched: false }), 'reported');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const modal = html.slice(html.indexOf('<dialog id="logDialog"'), html.indexOf('<dialog id="periodDialog"'));
for (const field of ['energy', 'stress', 'activity', 'socialIntensity', 'sleep', 'pain']) {
  assert.doesNotMatch(modal, new RegExp(`name="${field}"[^>]*checked`), `${field} must not be preselected`);
}
for (const field of ['exerciseNone', 'socialNone', 'sleepIssueNone', 'painLocationNone', 'painNatureNone', 'painResponseNone', 'bodySenseNone']) {
  assert.match(modal, new RegExp(`name="${field}"`), `${field} explicit-none control is required`);
}
assert.match(app, /dailyFormTouched/);
assert.match(app, /resolvePresenceGroup/);
assert.doesNotMatch(app, /const checked=name=>form\.elements\[name\]\?\.checked\?'yes':'no'/);

console.log('daily entry semantics checks passed');
