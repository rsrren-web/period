import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { createBaselineSnapshot } from '../analysis/baseline-engine.js';
import { createInsightsPageData } from '../analysis/insights-page-data.js';

const state=JSON.parse(readFileSync(new URL('../data/user-data.json',import.meta.url),'utf8'));
const lines=readFileSync(new URL('../outputs/meiyou_periods_draft.csv',import.meta.url),'utf8').trim().split(/\r?\n/),headers=lines.shift().split(',');
const periods=lines.map(line=>{const row=Object.fromEntries(headers.map((header,index)=>[header,line.split(',')[index]||'']));return {type:'period',start:row.period_start,end:row.period_end,status:row.status,base:true}});
const config=JSON.parse(readFileSync(new URL('../knowledge/insights_config.json',import.meta.url),'utf8'));
const tcmRules=JSON.parse(readFileSync(new URL('../knowledge/tcm_cluster_rules.json',import.meta.url),'utf8'));
const actions=JSON.parse(readFileSync(new URL('../knowledge/observation_actions.json',import.meta.url),'utf8'));
const asOf='2026-08-20',next='2026-09-07';
const phaseForDate=()=> 'follicular';
const stages={};
globalThis.__PERIOD_ANALYSIS_PROFILE__=(name,duration)=>{stages[name]=(stages[name]||0)+duration};

function timed(name,operation){performance.mark(`${name}:start`);const value=operation();performance.mark(`${name}:end`);const duration=performance.measure(name,`${name}:start`,`${name}:end`).duration;performance.clearMarks(`${name}:start`);performance.clearMarks(`${name}:end`);performance.clearMeasures(name);return {value,duration}}

const baseline=timed('baseline',()=>createBaselineSnapshot({logs:state.logs,periods,as_of:asOf,current_phase:'follicular',phaseForDate}));
const insights=timed('insights',()=>createInsightsPageData({logs:state.logs,periods,as_of:asOf,next_start:next,prediction_confidence:'较高',config,tcm_rules:tcmRules,observation_actions:actions,intervention_usage:[],phase:{key:'follicular'},phase_for_date:phaseForDate}));
const serialize=timed('serialize',()=>JSON.stringify(insights.value));
console.log(JSON.stringify({periods:periods.length,logs:Object.keys(state.logs).length,baselineMs:+baseline.duration.toFixed(2),insightsMs:+insights.duration.toFixed(2),serializeMs:+serialize.duration.toFixed(2),snapshotBytes:Buffer.byteLength(serialize.value),stages:Object.fromEntries(Object.entries(stages).map(([name,duration])=>[name,+duration.toFixed(2)]))},null,2));
