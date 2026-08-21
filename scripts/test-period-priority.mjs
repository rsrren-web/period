import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const line=name=>app.split(/\r?\n/).find(value=>value.startsWith(`function ${name}`))||'';
const context={Map};
vm.runInNewContext(`${line('prioritizePeriods')}\n${line('periodsForDate')}\nthis.periodsForDate=periodsForDate;`,context);

const date='2026-08-20';
const base={start:'2026-08-19',end:'2026-08-22',base:true,status:'confirmed',updatedAt:'2020-01-01T00:00:00Z'};
const localConfirmed={id:'local-confirmed',start:'2026-08-18',end:'2026-08-21',base:false,status:'confirmed',updatedAt:'2026-08-20T08:00:00Z'};
const localOngoing={id:'local-ongoing',start:'2026-08-20',end:'2026-08-20',base:false,status:'ongoing',updatedAt:'2026-08-20T09:00:00Z'};
const model={periodRecordsByDate:new Map([[date,[base,localConfirmed,localOngoing]]])};
const records=context.periodsForDate(date,model);

assert.equal(JSON.stringify(records.map(record=>record.id||'base')),JSON.stringify(['local-ongoing','local-confirmed','base']),'overlap 顺序必须保持旧版 local/ongoing/newer 优先语义');
assert.match(line('showDay'), /records=periodsForDate\(date,model\),period=records\[0\][^]*editingPeriod=period/,'day dialog 的显示与编辑目标必须使用优先记录');
assert.match(app, /#dayCancelPeriodBtn[^\n]+removePeriodDay\(selectedDate,period\)/,'day dialog 删除目标必须沿用 editingPeriod');
assert.match(app, /#dayEditPeriodBtn[^\n]+openPeriodEditor\(period\)/,'day dialog 编辑目标必须沿用 editingPeriod');

console.log('Overlapping period priority tests passed.');
