import assert from 'node:assert/strict';
import {mergeState,validatePayload} from '../worker/src/index.js';
import {migrateDailyLog} from '../daily-record-model.js';

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
const v3Log=migrateDailyLog(v2Log);
const v3State={...v2State,schemaVersion:3,logs:{'2026-07-19':v3Log}};
assert.doesNotThrow(()=>validatePayload({schemaVersion:3,mutationId:'v3-valid',state:v3State}));
const constitutionProfile={version:1,baseline:{balanced:null,qi_deficiency:null,yang_deficiency:'moderate',yin_deficiency:null,phlegm_damp:null,damp_heat:null,blood_stasis:null,qi_stagnation:null,inherited_special:null},source:'manual',assessedAt:'2026-08-20',editable:true,updatedAt:'2026-08-20T12:00:00.000Z'};
assert.doesNotThrow(()=>validatePayload({schemaVersion:3,mutationId:'v3-constitution',state:{...v3State,settings:{...v3State.settings,constitutionProfile}}}));
assert.throws(()=>validatePayload({schemaVersion:3,mutationId:'v3-bad-constitution',state:{...v3State,settings:{...v3State.settings,constitutionProfile:{...constitutionProfile,baseline:{...constitutionProfile.baseline,yang_deficiency:'diagnosed'}}}}}));
const olderProfile={...constitutionProfile,baseline:{...constitutionProfile.baseline,yang_deficiency:'low'},updatedAt:'2026-08-01T12:00:00.000Z'};
const mergedProfile=mergeState({...v3State,settings:{...v3State.settings,constitutionProfile}}, {...v3State,settings:{...v3State.settings,constitutionProfile:olderProfile}}, 'constitution-merge');
assert.equal(mergedProfile.settings.constitutionProfile.baseline.yang_deficiency,'moderate','较旧设备不得覆盖较新的长期体质档案');
assert.throws(()=>validatePayload({schemaVersion:3,mutationId:'v3-invalid-flow',state:{...v3State,logs:{'2026-07-19':{...v3Log,menstrual_status:'not_on_period',flow_level:'medium'}}}}));
assert.throws(()=>validatePayload({schemaVersion:3,mutationId:'v3-missing-spotting-context',state:{...v3State,logs:{'2026-07-19':{...v3Log,menstrual_status:'spotting_only',spotting_context:null}}}}));
assert.throws(()=>validatePayload({schemaVersion:3,mutationId:'v3-invalid-clot-level',state:{...v3State,logs:{'2026-07-19':{...v3Log,menstrual_status:'on_period',clot_presence:'no',clot_level:'large'}}}}));

const deletedAt='2026-07-20T12:00:00.000Z';
const merged=mergeState({...state,tombstones:{periods:{'period-1':deletedAt},logs:{'2026-07-19':deletedAt}},appliedMutations:[],revision:1},state,'mutation-2');
assert.equal(merged.periods.length,0);
assert.equal(Object.keys(merged.logs).length,0);
const repeated=mergeState(merged,state,'mutation-2');
assert.equal(repeated.revision,merged.revision);
console.log('Sync validation, tombstones and idempotency passed');
