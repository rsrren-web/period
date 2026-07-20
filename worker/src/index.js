const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const ISO_RE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DAY=86_400_000;
const DEVICE_TTL_SECONDS=180*24*60*60;

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'';
    const cors=corsHeaders(origin,env.ALLOWED_ORIGIN);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);
    const requestId=crypto.randomUUID().slice(0,8);
    try{
      if(url.pathname==='/health'&&request.method==='GET')return reply({ok:true,service:'period-sync'},200,cors);
      if(url.pathname==='/status'&&request.method==='GET'){
        const expiresAt=env.GITHUB_TOKEN_EXPIRES_AT||null;
        const daysRemaining=expiresAt?Math.ceil((Date.parse(`${expiresAt}T23:59:59Z`)-Date.now())/DAY):null;
        const githubOk=(await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`)).ok;
        return reply({ok:githubOk,githubOk,tokenExpiresAt:expiresAt,tokenDaysRemaining:daysRemaining},githubOk?200:503,cors);
      }
      if(url.pathname==='/state'&&request.method==='GET'){
        const remote=await readState(env);
        return reply({ok:true,state:remote.state},200,cors);
      }
      if(url.pathname==='/authorize'&&request.method==='POST'){
        requireOrigin(origin,env);
        await enforceLimit(env.AUTH_RATE_LIMITER,clientKey(request),5,60);
        requireSmallBody(request,4_096);
        const body=await safeJson(request);
        if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw clientError('编辑口令应为12–128位');
        if(!env.EDIT_PASSWORD||env.EDIT_PASSWORD.length<12)throw serverError('Worker编辑口令配置需要更新为至少12位');
        if(!await constantTimeEqual(body.password,env.EDIT_PASSWORD))throw authError('编辑口令不正确');
        const credential=await issueDeviceCredential(env);
        safeLog('authorize_ok',{requestId});
        return reply({ok:true,...credential},200,cors);
      }
      if(url.pathname==='/sync'&&request.method==='POST'){
        requireOrigin(origin,env);
        const device=await authenticateSync(request,env);
        await enforceLimit(env.SYNC_RATE_LIMITER,device.sub,30,60);
        requireSmallBody(request,1_000_000);
        const incoming=await safeJson(request);
        validatePayload(incoming);
        const result=await mergeAndWrite(env,incoming);
        safeLog('sync_ok',{requestId,mutation:incoming.mutationId.slice(0,8),revision:result.revision});
        return reply({ok:true,state:result},200,cors);
      }
      return reply({ok:false,error:'Not found'},404,cors);
    }catch(error){
      const status=Number(error.status)||500;
      safeLog('request_failed',{requestId,path:url.pathname,status,code:error.code||'internal'});
      return reply({ok:false,error:status>=500?'同步服务暂时不可用':error.message},status,cors);
    }
  }
};

function corsHeaders(origin,allowed){
  const headers={...JSON_HEADERS,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization,x-edit-password'};
  if(origin===allowed)headers['access-control-allow-origin']=origin;
  return headers;
}
function reply(body,status,headers){return new Response(JSON.stringify(body),{status,headers})}
function requireOrigin(origin,env){if(!origin||origin!==env.ALLOWED_ORIGIN)throw forbiddenError('不允许的网页来源')}
function clientKey(request){return request.headers.get('cf-connecting-ip')||'unknown'}
async function enforceLimit(binding,key,limit,period){
  if(!binding)return;
  const result=await binding.limit({key});
  if(!result.success){const error=new Error(`请求过于频繁，请在${period}秒后重试`);error.status=429;error.code='rate_limited';throw error}
}
function requireSmallBody(request,max){const length=Number(request.headers.get('content-length')||0);if(length>max){const e=clientError('上传数据过大');e.status=413;throw e}}
async function safeJson(request){try{return await request.json()}catch{throw clientError('请求不是有效JSON')}}
function clientError(message){const error=new Error(message);error.status=400;error.code='invalid_payload';return error}
function authError(message){const error=new Error(message);error.status=401;error.code='unauthorized';return error}
function forbiddenError(message){const error=new Error(message);error.status=403;error.code='forbidden';return error}
function serverError(message){const error=new Error(message);error.status=500;error.code='configuration';return error}
function safeLog(event,fields={}){console.log(JSON.stringify({event,...fields,at:new Date().toISOString()}))}

async function constantTimeEqual(a,b){
  const [left,right]=await Promise.all([digest(a),digest(b)]);
  let diff=left.length^right.length;
  for(let i=0;i<Math.min(left.length,right.length);i++)diff|=left[i]^right[i];
  return diff===0;
}
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
function base64url(value){return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decodeBase64url(value){const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');return Uint8Array.from(atob(normalized),c=>c.charCodeAt(0))}
async function signingKey(env){if(!env.DEVICE_SIGNING_KEY)throw serverError('设备凭证密钥尚未配置');return crypto.subtle.importKey('raw',new TextEncoder().encode(env.DEVICE_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function issueDeviceCredential(env){
  const now=Math.floor(Date.now()/1000),payload={v:1,sub:crypto.randomUUID(),iat:now,exp:now+DEVICE_TTL_SECONDS};
  const encoded=base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature=base64url(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode(encoded))));
  return {deviceToken:`${encoded}.${signature}`,expiresAt:new Date(payload.exp*1000).toISOString()};
}
async function requireDeviceCredential(request,env){
  const match=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')||'');
  if(!match)throw authError('需要重新验证编辑口令');
  const [encoded,signature]=match[1].split('.');
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(decodeBase64url(encoded)))}catch{throw authError('设备凭证无效')}
  const valid=await crypto.subtle.verify('HMAC',await signingKey(env),decodeBase64url(signature),new TextEncoder().encode(encoded));
  if(!valid||payload.v!==1||typeof payload.sub!=='string'||payload.exp<=Math.floor(Date.now()/1000))throw authError('设备凭证已过期，请重新验证编辑口令');
  return payload;
}
async function authenticateSync(request,env){
  if(request.headers.get('authorization'))return requireDeviceCredential(request,env);
  await enforceLimit(env.AUTH_RATE_LIMITER,clientKey(request),5,60);
  const password=request.headers.get('x-edit-password')||'';
  if(password.length<12||!env.EDIT_PASSWORD||!await constantTimeEqual(password,env.EDIT_PASSWORD))throw authError('编辑口令不正确');
  return {sub:`legacy-${clientKey(request)}`};
}

function assertObject(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw clientError(`${label}格式不正确`)}
function assertString(value,label,max,{allowEmpty=true}={}){if(typeof value!=='string'||value.length>max||(!allowEmpty&&!value))throw clientError(`${label}格式不正确`)}
function assertDate(value,label){assertString(value,label,10,{allowEmpty:false});if(!DATE_RE.test(value)||Number.isNaN(Date.parse(`${value}T12:00:00Z`)))throw clientError(`${label}日期无效`)}
function assertTimestamp(value,label){assertString(value,label,30,{allowEmpty:false});if(!ISO_RE.test(value)||Number.isNaN(Date.parse(value)))throw clientError(`${label}时间无效`)}
function assertRating(value,label,min,max){if(typeof value!=='string'||!/^\d{1,2}$/.test(value)||Number(value)<min||Number(value)>max)throw clientError(`${label}超出范围`)}
function validatePeriod(period){
  assertObject(period,'经期记录');assertString(period.id,'经期ID',100,{allowEmpty:false});assertDate(period.start,'开始');assertDate(period.end,'结束');
  if(period.end<period.start||daysBetween(period.start,period.end)>30)throw clientError('经期日期范围无效');
  if(!['period','spotting','uncertain'].includes(period.type))throw clientError('经期类型无效');
  assertString(period.source??'','经期来源',50);assertString(period.status??'','经期状态',30);assertTimestamp(period.updatedAt,'经期更新时间');
}
function validateLog(date,log){
  assertDate(date,'记录');assertObject(log,'每日记录');
  const allowed=new Set(['mood','energy','sleep','activity','stress','pain','symptoms','temperature','updatedAt']);for(const key of Object.keys(log))if(!allowed.has(key))throw clientError('每日记录包含已停用字段');
  for(const key of ['mood','energy','sleep','activity','stress'])assertRating(log[key],key,1,5);
  assertRating(log.pain,'pain',0,10);
  if(!Array.isArray(log.symptoms)||log.symptoms.length>50)throw clientError('症状列表无效');
  for(const symptom of log.symptoms)assertString(symptom,'症状',50,{allowEmpty:false});
  if(log.temperature!==''&&(!['string','number'].includes(typeof log.temperature)||Number(log.temperature)<34||Number(log.temperature)>42))throw clientError('基础体温超出范围');
  assertTimestamp(log.updatedAt,'每日记录更新时间');
}
function validateTombstones(value){
  assertObject(value,'删除记录');assertObject(value.periods,'经期删除记录');assertObject(value.logs,'每日删除记录');
  if(Object.keys(value.periods).length>2000||Object.keys(value.logs).length>20000)throw clientError('删除记录数量超过限制');
  for(const [key,at] of Object.entries(value.periods)){assertString(key,'删除ID',100,{allowEmpty:false});assertTimestamp(at,'删除时间')}
  for(const [date,at] of Object.entries(value.logs)){assertDate(date,'删除日期');assertTimestamp(at,'删除时间')}
}
function validatePayload(payload){
  assertObject(payload,'同步数据');if(payload.schemaVersion!==1)throw clientError('同步版本不支持');assertString(payload.mutationId,'变更ID',100,{allowEmpty:false});assertObject(payload.state,'记录');
  if(!Array.isArray(payload.state.periods)||payload.state.periods.length>1000)throw clientError('经期记录数量超过限制');
  payload.state.periods.forEach(validatePeriod);
  assertObject(payload.state.logs,'每日记录');if(Object.keys(payload.state.logs).length>10000)throw clientError('每日记录数量超过限制');for(const [date,log] of Object.entries(payload.state.logs))validateLog(date,log);
  validateTombstones(payload.state.tombstones||{periods:{},logs:{}});
  assertObject(payload.state.settings||{},'设置');const settings=payload.state.settings||{};
  if(settings.lifeStage!==undefined&&!['menarche','regular','perimenopause'].includes(settings.lifeStage))throw clientError('使用阶段无效');
  for(const key of ['ownerNotify','partnerNotify'])if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw clientError('通知设置类型无效');
}
function validateMonth(month){if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw clientError('随笔月份无效')}
function validateJournalEntry(date,entry,month){
  assertDate(date,'随笔日期');if(!date.startsWith(`${month}-`))throw clientError('随笔日期与月份不一致');assertObject(entry,'随笔');
  if(entry.date!==date)throw clientError('随笔日期字段不一致');assertString(entry.title??'','随笔标题',120);assertString(entry.body,'随笔正文',10000,{allowEmpty:false});
  if(!Array.isArray(entry.tags)||entry.tags.length>10)throw clientError('随笔标签无效');for(const tag of entry.tags)assertString(tag,'随笔标签',30,{allowEmpty:false});
  if(!['period','follicular','ovulation','pms'].includes(entry.phase))throw clientError('随笔阶段无效');if(typeof entry.familyVisible!=='boolean')throw clientError('随笔分享字段无效');
  if(entry.draft!==undefined&&typeof entry.draft!=='boolean')throw clientError('随笔草稿字段无效');assertTimestamp(entry.updatedAt,'随笔更新时间');
}
function validateJournalPayload(payload){
  assertObject(payload,'随笔同步数据');if(payload.schemaVersion!==1)throw clientError('随笔同步版本不支持');validateMonth(payload.month);assertString(payload.mutationId,'变更ID',100,{allowEmpty:false});
  assertObject(payload.entries,'随笔记录');assertObject(payload.tombstones,'随笔删除记录');if(Object.keys(payload.entries).length>31||Object.keys(payload.tombstones).length>62)throw clientError('单月随笔数量超过限制');
  for(const [date,entry] of Object.entries(payload.entries))validateJournalEntry(date,entry,payload.month);for(const [date,at] of Object.entries(payload.tombstones)){assertDate(date,'随笔删除日期');if(!date.startsWith(`${payload.month}-`))throw clientError('随笔删除日期与月份不一致');assertTimestamp(at,'随笔删除时间')}
}
function daysBetween(a,b){return Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/DAY)}
function emptyState(){return {schemaVersion:1,revision:0,updatedAt:null,periods:[],logs:{},tombstones:{periods:{},logs:{}},settings:{lifeStage:'regular',ownerNotify:true,partnerNotify:true},appliedMutations:[]}}
function normalizeState(value){const empty=emptyState(),source=value?.logs&&typeof value.logs==='object'&&!Array.isArray(value.logs)?value.logs:{},allowed=['mood','energy','sleep','activity','stress','pain','symptoms','temperature','updatedAt'],logs=Object.fromEntries(Object.entries(source).map(([date,log])=>[date,Object.fromEntries(allowed.filter(key=>log?.[key]!==undefined).map(key=>[key,log[key]]))]));return {...empty,...value,periods:Array.isArray(value?.periods)?value.periods:[],logs,tombstones:{periods:value?.tombstones?.periods||{},logs:value?.tombstones?.logs||{}},settings:{...empty.settings,...value?.settings},appliedMutations:Array.isArray(value?.appliedMutations)?value.appliedMutations:[]}}
function periodKey(period){return period.id||`${period.start}|${period.type||'period'}`}
function newer(a,b){return String(a||'')>=String(b||'')}
function mergeTombstones(a={},b={}){const out={...a};for(const [key,at] of Object.entries(b))if(!out[key]||newer(at,out[key]))out[key]=at;return out}
function mergeState(remote,incoming,mutationId){
  const base=normalizeState(remote);if(base.appliedMutations.includes(mutationId))return base;
  const tombstones={periods:mergeTombstones(base.tombstones.periods,incoming.tombstones?.periods),logs:mergeTombstones(base.tombstones.logs,incoming.tombstones?.logs)};
  const periodMap=new Map(base.periods.map(period=>[periodKey(period),period]));
  for(const period of incoming.periods){const key=periodKey(period),old=periodMap.get(key);if(!old||newer(period.updatedAt,old.updatedAt))periodMap.set(key,period)}
  for(const [key,period] of periodMap)if(tombstones.periods[key]&&newer(tombstones.periods[key],period.updatedAt))periodMap.delete(key);
  const logs={...base.logs};for(const [date,log] of Object.entries(incoming.logs)){const old=logs[date];if(!old||newer(log.updatedAt,old.updatedAt))logs[date]=log}
  for(const [date,log] of Object.entries(logs))if(tombstones.logs[date]&&newer(tombstones.logs[date],log.updatedAt))delete logs[date];
  return {...base,revision:Number(base.revision||0)+1,updatedAt:new Date().toISOString(),periods:[...periodMap.values()].sort((a,b)=>a.start.localeCompare(b.start)),logs,tombstones,settings:{...base.settings,...incoming.settings},appliedMutations:[...base.appliedMutations.slice(-99),mutationId]};
}
async function mergeAndWrite(env,payload){
  for(let attempt=0;attempt<3;attempt++){
    const remote=await readState(env),merged=mergeState(remote.state,payload.state,payload.mutationId);
    if(merged.revision===remote.state.revision)return merged;
    const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`,{method:'PUT',body:JSON.stringify({message:`Sync period records (${payload.mutationId.slice(0,8)})`,content:toBase64(JSON.stringify(merged,null,2)+'\n'),sha:remote.sha,branch:env.GITHUB_BRANCH})});
    if(response.ok)return merged;if(response.status!==409)throw await githubError(response);
  }
  const error=new Error('同时发生了其他更新，请重试');error.status=409;error.code='conflict';throw error;
}
function emptyJournal(month){return {schemaVersion:1,month,revision:0,updatedAt:null,entries:{},tombstones:{},appliedMutations:[]}}
function normalizeJournal(value,month){const empty=emptyJournal(month);return {...empty,...value,month,entries:value?.entries&&typeof value.entries==='object'?value.entries:{},tombstones:value?.tombstones&&typeof value.tombstones==='object'?value.tombstones:{},appliedMutations:Array.isArray(value?.appliedMutations)?value.appliedMutations:[]}}
function mergeJournal(remote,incoming){
  const base=normalizeJournal(remote,incoming.month);if(base.appliedMutations.includes(incoming.mutationId))return base;
  const tombstones=mergeTombstones(base.tombstones,incoming.tombstones),entries={...base.entries};
  for(const [date,entry] of Object.entries(incoming.entries)){const old=entries[date];if(!old||newer(entry.updatedAt,old.updatedAt))entries[date]=entry}
  for(const [date,entry] of Object.entries(entries))if(tombstones[date]&&newer(tombstones[date],entry.updatedAt))delete entries[date];
  return {...base,revision:Number(base.revision||0)+1,updatedAt:new Date().toISOString(),entries,tombstones,appliedMutations:[...base.appliedMutations.slice(-99),incoming.mutationId]};
}
async function mergeAndWriteJournal(env,payload){
  for(let attempt=0;attempt<3;attempt++){
    const remote=await readJournal(env,payload.month),merged=mergeJournal(remote.journal,payload);
    if(merged.revision===remote.journal.revision)return merged;
    const path=`data/journals/${payload.month.slice(0,4)}/${payload.month}.json`;
    const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,{method:'PUT',body:JSON.stringify({message:`Sync journal ${payload.month} (${payload.mutationId.slice(0,8)})`,content:toBase64(JSON.stringify(merged,null,2)+'\n'),sha:remote.sha,branch:env.GITHUB_BRANCH})});
    if(response.ok)return merged;if(response.status!==409)throw await githubError(response);
  }
  const error=new Error('随笔同时发生其他更新，请重试');error.status=409;error.code='journal_conflict';throw error;
}
async function readJournal(env,month){
  const path=`data/journals/${month.slice(0,4)}/${month}.json`,response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if(response.status===404)return {journal:emptyJournal(month),sha:undefined};if(!response.ok)throw await githubError(response);const file=await response.json();return {journal:normalizeJournal(JSON.parse(fromBase64(file.content)),month),sha:file.sha};
}
async function listJournalMonths(env){
  const root=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/data/journals?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);if(root.status===404)return[];if(!root.ok)throw await githubError(root);
  const years=(await root.json()).filter(item=>item.type==='dir'&&/^\d{4}$/.test(item.name)).slice(-20),months=[];
  for(const year of years){const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${year.path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);if(!response.ok)continue;for(const item of await response.json()){const match=/^(\d{4}-(?:0[1-9]|1[0-2]))\.json$/.exec(item.name);if(item.type==='file'&&match)months.push(match[1])}}
  return months.sort();
}
async function readState(env){
  const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if(response.status===404)return {state:emptyState(),sha:undefined};if(!response.ok)throw await githubError(response);
  const file=await response.json();return {state:normalizeState(JSON.parse(fromBase64(file.content))),sha:file.sha};
}
function github(env,path,init={}){return fetch(`https://api.github.com${path}`,{...init,headers:{accept:'application/vnd.github+json',authorization:`Bearer ${env.GITHUB_TOKEN}`,'x-github-api-version':'2022-11-28','user-agent':'period-sync-worker','content-type':'application/json',...(init.headers||{})}})}
async function githubError(response){const detail=await response.json().catch(()=>({}));const error=new Error(`GitHub: ${detail.message||response.status}`);error.status=response.status===401||response.status===403?502:response.status;error.code='github_error';return error}
function fromBase64(value){const binary=atob(value.replace(/\s/g,''));const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));return new TextDecoder().decode(bytes)}
function toBase64(value){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}

export {mergeJournal,mergeState,normalizeState,validateJournalPayload,validatePayload};
