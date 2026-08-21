import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

async function installWithFailures(failures=[]){
  const handlers={},puts=[],failed=new Set(failures);
  let skipped=false,installPromise;
  const cache={put:async(url)=>puts.push(String(url))};
  const context={
    URL,
    Request:class Request{constructor(url){this.url=url}toString(){return this.url}},
    fetch:async request=>({ok:!failed.has(String(request)),clone(){return this}}),
    caches:{open:async()=>cache,keys:async()=>[],match:async()=>null,delete:async()=>true},
    self:{location:{origin:'https://example.test'},addEventListener:(type,handler)=>{handlers[type]=handler},skipWaiting:async()=>{skipped=true},clients:{claim:async()=>{}}}
  };
  vm.runInNewContext(source,context);
  handlers.install({waitUntil:value=>{installPromise=value}});
  let error=null;
  try{await installPromise}catch(value){error=value}
  return {error,puts,skipped};
}

const success=await installWithFailures();
assert.equal(success.error,null);
assert.equal(success.skipped,true);
assert.ok(success.puts.includes('./outputs/meiyou_periods_draft.csv'),'fresh offline today 必须缓存历史基础数据');

const optionalFailure=await installWithFailures(['./manifest.webmanifest','./public/icons/icon-192.png']);
assert.equal(optionalFailure.error,null,'optional asset 失败不得阻止 SW install');
assert.equal(optionalFailure.skipped,true);

const requiredFailure=await installWithFailures(['./app.js']);
assert.ok(requiredFailure.error,'required asset 失败必须阻止 SW install');
assert.equal(requiredFailure.skipped,false);

console.log('Service Worker required/optional install tests passed.');
