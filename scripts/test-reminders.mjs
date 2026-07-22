import assert from 'node:assert/strict';
import {buildReminderEvents,mailForEvent} from './reminder-engine.mjs';

const prediction={next:'2026-08-09',windowStart:'2026-08-06',windowEnd:'2026-08-12',center:29};
const periods=[
  {period_start:'2026-06-12',period_end:'2026-06-18',status:'confirmed'},
  {period_start:'2026-07-11',period_end:'2026-07-17',status:'confirmed'}
];
const empty={periods:[],settings:{ownerNotify:true,partnerNotify:true}};

assert.deepEqual(buildReminderEvents({date:'2026-08-08',prediction,periods,userData:empty}).map(event=>event.type),['stage-period']);
assert.deepEqual(buildReminderEvents({date:'2026-08-01',prediction,periods,userData:empty}).map(event=>event.type),['stage-luteal']);
assert.deepEqual(buildReminderEvents({date:'2026-07-23',prediction,periods,userData:empty}).map(event=>event.type),['stage-ovulation']);

const ongoing={periods:[{id:'p1',start:'2026-07-11',end:'2026-07-17',type:'period',status:'ongoing',updatedAt:'2026-07-17T18:00:00Z'}]};
assert.deepEqual(buildReminderEvents({date:'2026-07-17',prediction,periods,userData:ongoing}).map(event=>event.type),['period-daily','stage-recovery']);

const ended={periods:[{id:'p1',start:'2026-07-11',end:'2026-07-17',type:'period',status:'confirmed',updatedAt:'2026-07-17T19:00:00Z'}]};
const endEvents=buildReminderEvents({date:'2026-07-18',prediction,periods,userData:ended});
assert.deepEqual(endEvents.map(event=>event.type),['period-ended']);
assert.equal(buildReminderEvents({date:'2026-07-18',prediction,periods,userData:ended,sent:[endEvents[0].key]}).length,0);

const endMail=mailForEvent(endEvents[0],{prediction,ownerEmail:'owner@example.com',partnerEmail:'partner@example.com'});
assert.equal(endMail.length,1);
assert.equal(endMail[0].cc,'partner@example.com');
assert.match(endMail[0].text,/公主大人/);
assert.match(endMail[0].text,/毛毛球/);

const endedBeforeBatch={periods:[{id:'p2',start:'2026-07-11',end:'2026-07-17',type:'period',status:'confirmed',updatedAt:'2026-07-17T16:00:00Z'}]};
assert.deepEqual(buildReminderEvents({date:'2026-07-17',prediction,periods,userData:endedBeforeBatch}).map(event=>event.type),['period-ended']);
assert.equal(buildReminderEvents({date:'2026-07-18',prediction,periods,userData:endedBeforeBatch}).length,0);

console.log('邮件事件检查通过：阶段、经期每日、结束补发与去重均正常');
