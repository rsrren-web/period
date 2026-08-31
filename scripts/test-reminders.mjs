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
assert.match(endMail[0].text,/——/);

const periodCharacters=new Set();
const periodTopics=new Set();
const recentHistory=[];
for(let day=1;day<=10;day++){
  const [mail]=mailForEvent({type:'period-daily',key:`period-daily:2026-07-11:day-${day}`,period:{start:'2026-07-11'},day},{prediction,ownerEmail:'owner@example.com',partnerEmail:'partner@example.com',recentHistory});
  assert.match(mail.subject,/经期第\d+天/);
  assert.match(mail.text,/公主大人/);
  assert.match(mail.text,/周期小知识/);
  const signature=mail.text.match(/——(.+)$/m)?.[1];
  assert.ok(signature,'经期邮件缺少角色落款');
  assert.notEqual(mail.meta.role,recentHistory.at(-1)?.role,'同一受众不得连续收到相同角色邮件');
  assert.notEqual(mail.meta.topic,recentHistory.at(-1)?.topic,'科普主题用尽后也不得连续重复');
  periodCharacters.add(signature);
  periodTopics.add(mail.meta.topic);
  recentHistory.push(mail.meta);
}
assert.ok(periodCharacters.size>=4,'经期邮件应有足够的角色变化');
assert.equal(periodTopics.size,8,'科普主题未全部使用前不得重复');

const stageOwner=mailForEvent({type:'stage-period',label:'预计经期',key:'stage-period:2026-08-09'},{prediction,ownerEmail:'owner@example.com',partnerEmail:'partner@example.com'});
assert.match(stageOwner[0].text,/周期小知识/);
assert.match(stageOwner[1].text,/周期小知识/);
assert.notEqual(stageOwner[0].meta.topic,stageOwner[1].meta.topic,'同一事件的两封邮件不应重复科普');
const nextStage=mailForEvent({type:'stage-luteal',label:'经前准备阶段',key:'stage-luteal:2026-08-02'},{prediction,ownerEmail:'owner@example.com',partnerEmail:'partner@example.com',recentHistory:stageOwner.map(mail=>mail.meta)});
assert.notEqual(nextStage[0].meta.role,stageOwner[0].meta.role,'本人邮件角色不得连续重复');
assert.notEqual(nextStage[1].meta.role,stageOwner[1].meta.role,'伴侣邮件角色不得连续重复');

const endedBeforeBatch={periods:[{id:'p2',start:'2026-07-11',end:'2026-07-17',type:'period',status:'confirmed',updatedAt:'2026-07-17T16:00:00Z'}]};
assert.deepEqual(buildReminderEvents({date:'2026-07-17',prediction,periods,userData:endedBeforeBatch}).map(event=>event.type),['period-ended']);
assert.equal(buildReminderEvents({date:'2026-07-18',prediction,periods,userData:endedBeforeBatch}).length,0);

const endedWithEarlierLastDay={periods:[{id:'p3',start:'2026-08-09',end:'2026-08-15',type:'period',status:'confirmed',updatedAt:'2026-08-16T18:39:29.764Z'}]};
assert.deepEqual(buildReminderEvents({date:'2026-08-20',prediction,periods,userData:endedWithEarlierLastDay}).map(event=>event.type),['period-ended']);

console.log('邮件事件检查通过：阶段、经期每日、结束补发与去重均正常');
