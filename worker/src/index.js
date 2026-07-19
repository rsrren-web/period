const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'';
    const cors=corsHeaders(origin,env.ALLOWED_ORIGIN);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);
    try{
      if(url.pathname==='/health'&&request.method==='GET')return reply({ok:true,service:'period-sync'},200,cors);
      if(url.pathname==='/state'&&request.method==='GET'){
        const remote=await readState(env);
        return reply({ok:true,state:remote.state},200,cors);
      }
      if(url.pathname==='/sync'&&request.method==='POST'){
        if(!origin||origin!==env.ALLOWED_ORIGIN)return reply({ok:false,error:'不允许的网页来源'},403,cors);
        if(!await authorized(request,env.EDIT_PASSWORD))return reply({ok:false,error:'编辑口令不正确'},401,cors);
        const length=Number(request.headers.get('content-length')||0);
        if(length>1_000_000)return reply({ok:false,error:'同步数据过大'},413,cors);
        const incoming=await request.json();
        validatePayload(incoming);
        const result=await mergeAndWrite(env,incoming);
        return reply({ok:true,state:result},200,cors);
      }
      return reply({ok:false,error:'Not found'},404,cors);
    }catch(error){
      console.error(error);
      const status=error.status||500;
      return reply({ok:false,error:status===500?'同步服务暂时不可用':error.message},status,cors);
    }
  }
};

function corsHeaders(origin,allowed){
  const headers={...jsonHeaders,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-edit-password'};
  if(origin===allowed)headers['access-control-allow-origin']=origin;
  return headers;
}
function reply(body,status,headers){return new Response(JSON.stringify(body),{status,headers})}
async function authorized(request,expected=''){
  const supplied=request.headers.get('x-edit-password')||'';
  if(!supplied||!expected)return false;
  const [a,b]=await Promise.all([digest(supplied),digest(expected)]);
  let diff=a.length^b.length;for(let i=0;i<Math.min(a.length,b.length);i++)diff|=a[i]^b[i];return diff===0;
}
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
function validatePayload(payload){
  if(!payload||payload.schemaVersion!==1||typeof payload.mutationId!=='string'||!payload.mutationId||!payload.state)throw clientError('同步数据格式不正确');
  if(!Array.isArray(payload.state.periods)||typeof payload.state.logs!=='object'||payload.state.logs===null)throw clientError('记录格式不正确');
  if(payload.state.periods.length>1000||Object.keys(payload.state.logs).length>10000)throw clientError('记录数量超过限制');
}
function clientError(message){const error=new Error(message);error.status=400;return error}
function emptyState(){return {schemaVersion:1,revision:0,updatedAt:null,periods:[],logs:{},settings:{lifeStage:'regular',ownerNotify:true,partnerNotify:true},appliedMutations:[]}}
function normalizeState(value){return {...emptyState(),...value,periods:Array.isArray(value?.periods)?value.periods:[],logs:value?.logs&&typeof value.logs==='object'?value.logs:{},settings:{...emptyState().settings,...value?.settings},appliedMutations:Array.isArray(value?.appliedMutations)?value.appliedMutations:[]}}
function periodKey(period){return period.id||`${period.start}|${period.type||'period'}`}
function mergeState(remote,incoming,mutationId){
  const base=normalizeState(remote);if(base.appliedMutations.includes(mutationId))return base;
  const periodMap=new Map(base.periods.map(period=>[periodKey(period),period]));
  incoming.periods.forEach(period=>{if(period?.start&&period?.end)periodMap.set(periodKey(period),period)});
  const logs={...base.logs};
  Object.entries(incoming.logs).forEach(([date,log])=>{const old=logs[date];if(!old||String(log.updatedAt||'')>=String(old.updatedAt||''))logs[date]=log});
  return {...base,revision:Number(base.revision||0)+1,updatedAt:new Date().toISOString(),periods:[...periodMap.values()].sort((a,b)=>a.start.localeCompare(b.start)),logs,settings:{...base.settings,...incoming.settings},appliedMutations:[...base.appliedMutations.slice(-49),mutationId]};
}
async function mergeAndWrite(env,payload){
  for(let attempt=0;attempt<3;attempt++){
    const remote=await readState(env),merged=mergeState(remote.state,payload.state,payload.mutationId);
    if(merged.revision===remote.state.revision)return merged;
    const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`,{method:'PUT',body:JSON.stringify({message:`Sync period records (${payload.mutationId.slice(0,8)})`,content:toBase64(JSON.stringify(merged,null,2)+'\n'),sha:remote.sha,branch:env.GITHUB_BRANCH})});
    if(response.ok)return merged;
    if(response.status!==409)throw await githubError(response);
  }
  const error=new Error('同时发生了其他更新，请重试');error.status=409;throw error;
}
async function readState(env){
  const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if(response.status===404)return {state:emptyState(),sha:undefined};
  if(!response.ok)throw await githubError(response);
  const file=await response.json();return {state:normalizeState(JSON.parse(fromBase64(file.content))),sha:file.sha};
}
function github(env,path,init={}){return fetch(`https://api.github.com${path}`,{...init,headers:{accept:'application/vnd.github+json',authorization:`Bearer ${env.GITHUB_TOKEN}`,'x-github-api-version':'2022-11-28','user-agent':'period-sync-worker','content-type':'application/json',...(init.headers||{})}})}
async function githubError(response){const detail=await response.json().catch(()=>({}));const error=new Error(`GitHub: ${detail.message||response.status}`);error.status=response.status===401||response.status===403?502:response.status;return error}
function fromBase64(value){const binary=atob(value.replace(/\s/g,''));const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));return new TextDecoder().decode(bytes)}
function toBase64(value){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}
