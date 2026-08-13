import assert from 'node:assert/strict';
import { applyAutomaticCycleDay, calculateCycleDay, compatibilityTags, correctCycleDay, migrateDailyLog, migrateDailyLogs, recalculateAutomaticCycleDays } from '../daily-record-model.js';

const updatedAt = '2026-08-13T12:00:00.000Z';
const unknown = migrateDailyLog({ mood: '3', energy: '2', sleep: '4', activity: '3', stress: '2', pain: '0', symptoms: [], temperature: '', updatedAt });
assert.equal(unknown.modelVersion, 3);
assert.equal(unknown.bowelMovement, null, '未记录排便必须保持 null');
assert.equal(unknown.bedtime, null, '未记录入睡时段必须保持 null');
assert.equal(unknown.exerciseTypes, null, '未记录运动类型必须保持 null');
assert.equal(unknown.symptomTags, null, '无症状标签不能被误写成明确“没有症状”');
assert.equal(unknown.fieldStatus.mood, 'legacy_uncertain');
assert.equal(unknown.menstrual_status, null);
assert.equal(unknown.flow_level, null);
assert.equal(unknown.blood_color, null);
assert.equal(unknown.clot_presence, 'not_recorded');
assert.equal(unknown.clot_level, null);
assert.equal(unknown.cycle_day, null);
assert.equal(unknown.cycle_day_source, 'not_recorded');
assert.equal(unknown.fieldStatus.menstrual_status, 'not_recorded');

const explicitNo = migrateDailyLog({ mood: '3', energy: '2', sleep: '4', activity: '3', stress: '2', pain: '0', symptoms: ['排便：未排便', '入睡：23:00后'], temperature: '', updatedAt });
assert.equal(explicitNo.bowelMovement, false, '明确未排便必须保存为 false');
assert.equal(explicitNo.bedtime, 'after_23');
assert.equal(explicitNo.fieldStatus.bowelMovement, 'reported');
assert.ok(compatibilityTags(explicitNo).includes('排便：未排便'));

const explicitYes = migrateDailyLog({ modelVersion: 3, mood: null, energy: 3, sleep: 3, activity: 2, stress: 4, pain: 0, primaryEmotion: null, bedtime: null, bowelMovement: true, exerciseTypes: null, socialTypes: null, socialIntensity: null, socialEffect: null, painLocations: null, symptomTags: null, temperature: null, menstrual_status:null,cycle_day:null,cycle_day_source:'not_recorded',cycle_day_anchor_start:null,flow_level:null,blood_color:null,clot_presence:'not_recorded',clot_level:null,spotting_context:null,period_episode_id:null,fieldStatus: { bowelMovement: 'reported' }, legacySymptoms: [], updatedAt }, { legacy: false });
assert.equal(explicitYes.bowelMovement, true);
assert.equal(explicitYes.mood, null);
assert.deepEqual(migrateDailyLogs({ '2026-08-13': explicitYes }), { '2026-08-13': explicitYes }, 'v3 迁移必须幂等');

const period={id:'p1',start:'2026-08-09',end:'2026-08-13',type:'period',status:'confirmed'};
assert.deepEqual(calculateCycleDay('2026-08-13',[period]),{value:5,source:'auto_calculated',anchorStart:'2026-08-09'});
const automatic=applyAutomaticCycleDay(explicitYes,'2026-08-13',[period]);
assert.equal(automatic.cycle_day,5);assert.equal(automatic.cycle_day_source,'auto_calculated');assert.equal(automatic.fieldStatus.cycle_day,'system_generated');
const corrected=correctCycleDay(automatic,4,'2026-08-10');
assert.equal(corrected.cycle_day,4);assert.equal(corrected.cycle_day_source,'user_corrected');
assert.equal(applyAutomaticCycleDay(corrected,'2026-08-14',[period]).cycle_day,4,'自动计算不得覆盖用户修正');
const recalculated=recalculateAutomaticCycleDays({'2026-08-13':automatic,'2026-08-14':corrected},[{...period,start:'2026-08-10'}]);
assert.equal(recalculated['2026-08-13'].cycle_day,4,'正式月经起点修改后应重算自动值');
assert.equal(recalculated['2026-08-14'].cycle_day,4,'正式月经起点修改后不得覆盖手动值');

const spotting=migrateDailyLog({...explicitYes,menstrual_status:'spotting_only',spotting_context:'intermenstrual',flow_level:'spotting',blood_color:'brown',clot_presence:'no'},{legacy:false});
assert.equal(spotting.flow_level,'spotting');assert.equal(spotting.spotting_context,'intermenstrual');assert.equal(spotting.clot_level,null);
const notPeriod=migrateDailyLog({...spotting,menstrual_status:'not_on_period'},{legacy:false});
assert.equal(notPeriod.flow_level,null);assert.equal(notPeriod.blood_color,null);assert.equal(notPeriod.clot_presence,'not_recorded');assert.equal(notPeriod.spotting_context,null);

console.log('Daily record model v3 tests passed.');
