import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const line=name=>app.split(/\r?\n/).find(value=>value.startsWith(`function ${name}`)||value.startsWith(`async function ${name}`))||'';
const functions=['normalizeState','periodKey','newer','mergeMap','mergeUserState','orderedEntries','stateFingerprint','settingsFingerprint','fetchJsonWithTimeout','pullRemote'];

function stateWith(logs={},periods=[]){return {periods,logs,tombstones:{periods:{},logs:{}}}}
function harness(initial,{pending='',timeout=2500}={}){
  const store=new Map([['period-helper-sync-pending-v1',pending]]),requests=[];
  let resolveFetch,renderCount=0,aborted=false;
  const fetchPromise=new Promise(resolve=>{resolveFetch=resolve});
  const context={
    AbortController,DOMException,JSON,Map,Promise,setTimeout,clearTimeout,
    navigator:{onLine:true},SYNC_URL:'https://sync.test',STORE_KEY:'state',SYNC_PENDING_KEY:'period-helper-sync-pending-v1',
    state:initial,settings:{lifeStage:'regular',ownerNotify:true,partnerNotify:true},
    migrateDailyLogs:value=>value||{},
    localStorage:{getItem:key=>store.get(key)||'',setItem:(key,value)=>store.set(key,value)},
    fetch:(url,options)=>{requests.push({url,options});options.signal.addEventListener('abort',()=>{aborted=true});return fetchPromise},
    markPerformanceStart(){},markPerformanceEnd(){},setSync(){},safeLog(){},alertSystem(){},
    renderCurrentView(){renderCount++}
  };
  const source=functions.map(name=>line(name)).join('\n').replace('timeout=2500',`timeout=${timeout}`);
  vm.runInNewContext(`${source}\nthis.pullRemote=pullRemote;this.getState=()=>state;this.setState=value=>{state=value};`,context);
  return {context,resolve:data=>resolveFetch({ok:true,json:async()=>({ok:true,state:data})}),renders:()=>renderCount,pending:()=>store.get('period-helper-sync-pending-v1'),aborted:()=>aborted,requests};
}

const identical=stateWith({'2026-08-20':{updatedAt:'2026-08-20T08:00:00Z',mood:3}});
let test=harness(identical);let pull=test.context.pullRemote();test.resolve(identical);assert.equal(await pull,false);assert.equal(test.renders(),0,'A: identical remote 不得 render');

const localNew=stateWith({'2026-08-20':{updatedAt:'2026-08-20T09:00:00Z',mood:5}}),remoteOld=stateWith({'2026-08-20':{updatedAt:'2026-08-20T08:00:00Z',mood:2}});
test=harness(localNew,{pending:'yes'});pull=test.context.pullRemote();test.resolve(remoteOld);await pull;assert.equal(test.context.getState().logs['2026-08-20'].mood,5);assert.equal(test.pending(),'yes');assert.equal(test.renders(),0,'B: local newer + pending 不得被覆盖或额外 render');

const remoteNew=stateWith({'2026-08-20':{updatedAt:'2026-08-20T10:00:00Z',mood:4}});
test=harness(remoteOld);pull=test.context.pullRemote();test.resolve(remoteNew);assert.equal(await pull,true);assert.equal(test.context.getState().logs['2026-08-20'].mood,4);assert.equal(test.renders(),1,'C: remote newer 必须恰好 render 一次');

test=harness(remoteOld,{pending:'yes'});pull=test.context.pullRemote();test.context.setState(localNew);test.resolve(remoteOld);assert.equal(await pull,false);assert.equal(test.context.getState().logs['2026-08-20'].mood,5);assert.equal(test.renders(),0,'D1: pull 等待期间的本地保存不得被误判为 remote change');

const independent=stateWith({'2026-08-19':{updatedAt:'2026-08-20T10:00:00Z',sleep:4}});
test=harness(remoteOld,{pending:'yes'});pull=test.context.pullRemote();test.context.setState(localNew);test.resolve(independent);assert.equal(await pull,true);assert.equal(test.context.getState().logs['2026-08-20'].mood,5);assert.equal(test.context.getState().logs['2026-08-19'].sleep,4);assert.equal(test.renders(),1,'D2: independent remote change 必须只 render 一次');

test=harness(remoteOld,{timeout:20});const timedOut=await test.context.pullRemote();assert.equal(timedOut,false);assert.equal(test.aborted(),true,'E: timeout 必须真正 abort fetch');assert.equal(test.renders(),0);

console.log('Startup pull A–E and Scenario D regression tests passed.');
