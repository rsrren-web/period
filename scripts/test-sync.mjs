import assert from 'node:assert/strict';
import {mergeJournal,mergeState,validateJournalPayload,validatePayload} from '../worker/src/index.js';

const at='2026-07-19T12:00:00.000Z';
const period={id:'period-1',start:'2026-07-10',end:'2026-07-15',type:'period',source:'本设备',status:'confirmed',updatedAt:at};
const log={mood:'3',energy:'3',sleep:'3',activity:'3',pain:'0',stress:'3',symptoms:['嗜睡','疼痛部位：小腹/盆腔'],temperature:'36.50',updatedAt:at};
const state={periods:[period],logs:{'2026-07-19':log},tombstones:{periods:{},logs:{}},settings:{lifeStage:'regular',ownerNotify:true,partnerNotify:true}};
assert.doesNotThrow(()=>validatePayload({schemaVersion:1,mutationId:'mutation-1',state}));
assert.doesNotThrow(()=>validatePayload({schemaVersion:1,mutationId:'period-edit',state:{...state,periods:[{...period,status:'ongoing',originalStart:'2026-07-09'}]}}));
assert.doesNotThrow(()=>validatePayload({schemaVersion:1,mutationId:'period-delete',state:{...state,periods:[{...period,status:'deleted',originalStart:'2026-07-09'}]}}));
assert.throws(()=>validatePayload({schemaVersion:1,mutationId:'bad',state:{...state,logs:{'2026-99-99':log}}}));
assert.throws(()=>validatePayload({schemaVersion:1,mutationId:'bad',state:{...state,logs:{'2026-07-19':{...log,notes:'x'.repeat(2001)}}}}));

const v2Log={modelVersion:2,mood:null,energy:3,sleep:2,activity:4,stress:3,pain:0,primaryEmotion:null,bedtime:'after_23',bowelMovement:false,exerciseTypes:['徒步'],socialTypes:null,socialIntensity:null,socialEffect:null,painLocations:null,symptomTags:null,temperature:null,fieldStatus:{energy:'reported',sleep:'reported',activity:'reported',stress:'reported',pain:'reported',bedtime:'reported',bowelMovement:'reported',exerciseTypes:'reported'},legacySymptoms:[],updatedAt:at};
const v2State={...state,schemaVersion:2,logs:{'2026-07-19':v2Log}};
assert.doesNotThrow(()=>validatePayload({schemaVersion:2,mutationId:'v2-valid',state:v2State}));
assert.throws(()=>validatePayload({schemaVersion:2,mutationId:'v2-invalid-boolean',state:{...v2State,logs:{'2026-07-19':{...v2Log,bowelMovement:'没有'}}}}));
assert.throws(()=>validatePayload({schemaVersion:2,mutationId:'v2-invalid-enum',state:{...v2State,logs:{'2026-07-19':{...v2Log,bedtime:'unknown'}}}}));

const deletedAt='2026-07-20T12:00:00.000Z';
const merged=mergeState({...state,tombstones:{periods:{'period-1':deletedAt},logs:{'2026-07-19':deletedAt}},appliedMutations:[],revision:1},state,'mutation-2');
assert.equal(merged.periods.length,0);
assert.equal(Object.keys(merged.logs).length,0);
const repeated=mergeState(merged,state,'mutation-2');
assert.equal(repeated.revision,merged.revision);
console.log('Sync validation, tombstones and idempotency passed');

const journal={date:'2026-07-19',title:'一天',body:'今天睡眠不足，但散步后感觉好一些。',tags:['睡眠','运动'],phase:'follicular',familyVisible:false,updatedAt:at};
const journalPayload={schemaVersion:1,month:'2026-07',mutationId:'journal-1',entries:{'2026-07-19':journal},tombstones:{}};
assert.doesNotThrow(()=>validateJournalPayload(journalPayload));
assert.throws(()=>validateJournalPayload({...journalPayload,entries:{'2026-07-19':{...journal,body:'x'.repeat(10001)}}}));
const journalMerged=mergeJournal({schemaVersion:1,month:'2026-07',revision:1,entries:{'2026-07-19':journal},tombstones:{'2026-07-19':deletedAt},appliedMutations:[]},journalPayload);
assert.equal(Object.keys(journalMerged.entries).length,0);
assert.equal(journalMerged.tombstones['2026-07-19'],deletedAt);
console.log('Journal validation, monthly merge and tombstones passed');
