import assert from 'node:assert/strict';
import {mergeState,validatePayload} from '../worker/src/index.js';

const at='2026-07-19T12:00:00.000Z';
const period={id:'period-1',start:'2026-07-10',end:'2026-07-15',type:'period',source:'本设备',status:'confirmed',updatedAt:at};
const log={mood:'3',energy:'3',sleep:'3',activity:'3',pain:'0',stress:'3',symptoms:['嗜睡'],temperature:'36.50',discharge:'',sexualActivity:false,notes:'',updatedAt:at};
const state={periods:[period],logs:{'2026-07-19':log},tombstones:{periods:{},logs:{}},settings:{lifeStage:'regular',ownerNotify:true,partnerNotify:true}};
assert.doesNotThrow(()=>validatePayload({schemaVersion:1,mutationId:'mutation-1',state}));
assert.throws(()=>validatePayload({schemaVersion:1,mutationId:'bad',state:{...state,logs:{'2026-99-99':log}}}));
assert.throws(()=>validatePayload({schemaVersion:1,mutationId:'bad',state:{...state,logs:{'2026-07-19':{...log,notes:'x'.repeat(2001)}}}}));

const deletedAt='2026-07-20T12:00:00.000Z';
const merged=mergeState({...state,tombstones:{periods:{'period-1':deletedAt},logs:{'2026-07-19':deletedAt}},appliedMutations:[],revision:1},state,'mutation-2');
assert.equal(merged.periods.length,0);
assert.equal(Object.keys(merged.logs).length,0);
const repeated=mergeState(merged,state,'mutation-2');
assert.equal(repeated.revision,merged.revision);
console.log('Sync validation, tombstones and idempotency passed');
