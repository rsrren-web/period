import { DAILY_ENUMS, FIELD_STATUS_VALUES, SCORE_FIELDS, STRUCTURED_FIELDS, migrateDailyLogs } from '../../daily-record-model.js';

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
      if(url.pathname==='/health'&&request.method==='GET')return reply({ok:true,service:'period-sync',version:'v97'},200,cors);
      if(url.pathname==='/status'&&request.method==='GET'){
        const expiresAt=env.GITHUB_TOKEN_EXPIRES_AT||null;
        const daysRemaining=expiresAt?Math.ceil((Date.parse(`${expiresAt}T23:59:59Z`)-Date.now())/DAY):null;
        const githubOk=(await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`)).ok;
        const deviceAuthOk=await deviceCredentialSelfCheck(env);
        const ok=githubOk&&deviceAuthOk;
        return reply({ok,githubOk,deviceAuthOk,tokenExpiresAt:expiresAt,tokenDaysRemaining:daysRemaining},ok?200:503,cors);
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
async function verifyDeviceCredentialToken(token,env){
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token||''))throw authError('需要重新验证编辑口令');
  const [encoded,signature]=token.split('.');
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(decodeBase64url(encoded)))}catch{throw authError('设备凭证无效')}
  const valid=await crypto.subtle.verify('HMAC',await signingKey(env),decodeBase64url(signature),new TextEncoder().encode(encoded));
  if(!valid||payload.v!==1||typeof payload.sub!=='string'||payload.exp<=Math.floor(Date.now()/1000))throw authError('设备凭证已过期，请重新验证编辑口令');
  return payload;
}
async function deviceCredentialSelfCheck(env){try{const credential=await issueDeviceCredential(env);await verifyDeviceCredentialToken(credential.deviceToken,env);return true}catch{return false}}
async function requireDeviceCredential(request,env){
  const match=/^Bearer (.+)$/.exec(request.headers.get('authorization')||'');
  if(!match)throw authError('需要重新验证编辑口令');
  return verifyDeviceCredentialToken(match[1],env);
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
function assertRating(value,label,min,max){const validString=typeof value==='string'&&/^\d{1,2}$/.test(value),validNumber=typeof value==='number'&&Number.isInteger(value);if((!validString&&!validNumber)||Number(value)<min||Number(value)>max)throw clientError(`${label}超出范围`)}
function assertNullableRating(value,label,min,max){if(value===null)return;if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw clientError(`${label}超出范围`)}
function assertNullableEnum(value,label,allowed){if(value!==null&&!allowed.includes(value))throw clientError(`${label}选项无效`)}
function assertNullableEnumList(value,label,allowed,max=20){if(value===null)return;if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length)throw clientError(`${label}列表无效`);for(const item of value)if(!allowed.includes(item))throw clientError(`${label}选项无效`)}
function assertNullableStringList(value,label,maxItems,maxLength){if(value===null)return;if(!Array.isArray(value)||value.length>maxItems)throw clientError(`${label}列表无效`);for(const item of value)assertString(item,label,maxLength,{allowEmpty:false})}
function validatePeriod(period){
  assertObject(period,'经期记录');assertString(period.id,'经期ID',100,{allowEmpty:false});assertDate(period.start,'开始');assertDate(period.end,'结束');
  if(period.end<period.start||daysBetween(period.start,period.end)>30)throw clientError('经期日期范围无效');
  if(!['period','spotting','uncertain'].includes(period.type))throw clientError('经期类型无效');
  assertString(period.source??'','经期来源',50);if(!['confirmed','ongoing','deleted'].includes(period.status))throw clientError('经期状态无效');if(period.originalStart!==undefined)assertDate(period.originalStart,'原始开始');assertTimestamp(period.updatedAt,'经期更新时间');
}
function validateLog(date,log){
  assertDate(date,'记录');assertObject(log,'每日记录');
  if(![2,3].includes(log.modelVersion)){
    const allowed=new Set(['mood','energy','sleep','activity','stress','pain','symptoms','temperature','updatedAt']);for(const key of Object.keys(log))if(!allowed.has(key))throw clientError('每日记录包含已停用字段');
    for(const key of ['mood','energy','sleep','activity','stress'])assertRating(log[key],key,1,5);
    assertRating(log.pain,'pain',0,10);
    if(!Array.isArray(log.symptoms)||log.symptoms.length>50)throw clientError('症状列表无效');
    for(const symptom of log.symptoms)assertString(symptom,'症状',50,{allowEmpty:false});
    if(log.temperature!==''&&(!['string','number'].includes(typeof log.temperature)||Number(log.temperature)<34||Number(log.temperature)>42))throw clientError('基础体温超出范围');
    assertTimestamp(log.updatedAt,'每日记录更新时间');return;
  }
  const allowed=new Set(['modelVersion',...STRUCTURED_FIELDS,'cycle_day_source','cycle_day_anchor_start','fieldStatus','legacySymptoms','updatedAt']);for(const key of Object.keys(log))if(!allowed.has(key))throw clientError('每日记录包含未知字段');
  for(const key of SCORE_FIELDS)assertNullableRating(log[key],key,key==='pain'?0:1,key==='pain'?10:5);
  assertNullableEnum(log.primaryEmotion,'情绪',DAILY_ENUMS.primaryEmotion);
  assertNullableEnum(log.bedtime,'入睡时间',DAILY_ENUMS.bedtime);
  if(log.bowelMovement!==null&&typeof log.bowelMovement!=='boolean')throw clientError('排便记录类型无效');
  assertNullableEnumList(log.exerciseTypes,'运动',DAILY_ENUMS.exerciseTypes);
  assertNullableEnumList(log.socialTypes,'社交',DAILY_ENUMS.socialTypes);
  assertNullableRating(log.socialIntensity,'社交强度',1,5);
  assertNullableEnum(log.socialEffect,'社交影响',DAILY_ENUMS.socialEffect);
  assertNullableEnumList(log.painLocations,'疼痛部位',DAILY_ENUMS.painLocations);
  assertNullableStringList(log.symptomTags,'症状',50,50);
  if(log.temperature!==null&&(typeof log.temperature!=='number'||!Number.isFinite(log.temperature)||log.temperature<34||log.temperature>42))throw clientError('基础体温超出范围');
  assertObject(log.fieldStatus,'字段记录状态');if(log.modelVersion===3)for(const field of STRUCTURED_FIELDS)if(!(field in log.fieldStatus))throw clientError(`字段记录状态缺少${field}`);for(const [field,status] of Object.entries(log.fieldStatus)){if(!STRUCTURED_FIELDS.includes(field)||!FIELD_STATUS_VALUES.includes(status))throw clientError('字段记录状态无效')}
  if(!Array.isArray(log.legacySymptoms)||log.legacySymptoms.length>50)throw clientError('旧症状记录无效');for(const symptom of log.legacySymptoms)assertString(symptom,'旧症状',50,{allowEmpty:false});
  if(log.modelVersion===3){
    const required=['menstrual_status','cycle_day','cycle_day_source','cycle_day_anchor_start','flow_level','blood_color','clot_presence','clot_level','spotting_context','period_episode_id'];for(const key of required)if(!(key in log))throw clientError(`每日记录缺少${key}`);
    assertNullableEnum(log.menstrual_status,'月经状态',DAILY_ENUMS.menstrual_status);
    assertNullableRating(log.cycle_day,'周期日',1,366);if(!DAILY_ENUMS.cycle_day_source.includes(log.cycle_day_source))throw clientError('周期日来源无效');
    if(log.cycle_day_anchor_start!==null)assertDate(log.cycle_day_anchor_start,'周期日起点');
    if(log.cycle_day_source==='not_recorded'&&(log.cycle_day!==null||log.cycle_day_anchor_start!==null))throw clientError('未记录周期日不能包含数值或起点');
    if(log.cycle_day_source!=='not_recorded'&&log.cycle_day===null)throw clientError('周期日来源与数值不一致');
    if(['auto_calculated','user_corrected'].includes(log.cycle_day_source)&&log.cycle_day_anchor_start===null)throw clientError('自动或修正周期日必须保留计算起点');
    assertNullableEnum(log.flow_level,'经量',DAILY_ENUMS.flow_level);assertNullableEnum(log.blood_color,'经血颜色',DAILY_ENUMS.blood_color);
    if(!DAILY_ENUMS.clot_presence.includes(log.clot_presence))throw clientError('血块记录无效');assertNullableEnum(log.clot_level,'血块程度',DAILY_ENUMS.clot_level);
    assertNullableEnum(log.spotting_context,'点滴出血上下文',DAILY_ENUMS.spotting_context);if(log.period_episode_id!==null)assertString(log.period_episode_id,'经期记录ID',100,{allowEmpty:false});
    const bleeding=log.menstrual_status==='on_period'||log.menstrual_status==='spotting_only';
    if(!bleeding&&(log.flow_level!==null||log.blood_color!==null||log.clot_presence!=='not_recorded'||log.clot_level!==null||log.spotting_context!==null||log.period_episode_id!==null))throw clientError('非经期不能保存出血详情');
    if(log.menstrual_status==='spotting_only'&&log.spotting_context===null)throw clientError('点滴出血必须选择发生场景');
    if(log.menstrual_status!=='spotting_only'&&log.spotting_context!==null)throw clientError('仅点滴出血可设置发生场景');
    if(['period_start_transition','period_end_transition'].includes(log.spotting_context)&&log.period_episode_id===null)throw clientError('经期首尾点滴必须关联所属经期');
    if(['intermenstrual','uncertain'].includes(log.spotting_context)&&log.period_episode_id!==null)throw clientError('周期中段或未确定点滴不能关联为正式经期');
    if(log.clot_presence!=='yes'&&log.clot_level!==null)throw clientError('未明确有血块时不能填写血块程度');
  }
  assertTimestamp(log.updatedAt,'每日记录更新时间');
}
function validateTombstones(value){
  assertObject(value,'删除记录');assertObject(value.periods,'经期删除记录');assertObject(value.logs,'每日删除记录');
  if(Object.keys(value.periods).length>2000||Object.keys(value.logs).length>20000)throw clientError('删除记录数量超过限制');
  for(const [key,at] of Object.entries(value.periods)){assertString(key,'删除ID',100,{allowEmpty:false});assertTimestamp(at,'删除时间')}
  for(const [date,at] of Object.entries(value.logs)){assertDate(date,'删除日期');assertTimestamp(at,'删除时间')}
}
function validatePayload(payload){
  assertObject(payload,'同步数据');if(![1,2,3].includes(payload.schemaVersion))throw clientError('同步版本不支持');assertString(payload.mutationId,'变更ID',100,{allowEmpty:false});assertObject(payload.state,'记录');
  if(!Array.isArray(payload.state.periods)||payload.state.periods.length>1000)throw clientError('经期记录数量超过限制');
  payload.state.periods.forEach(validatePeriod);
  assertObject(payload.state.logs,'每日记录');if(Object.keys(payload.state.logs).length>10000)throw clientError('每日记录数量超过限制');for(const [date,log] of Object.entries(payload.state.logs))validateLog(date,log);
  validateTombstones(payload.state.tombstones||{periods:{},logs:{}});
  assertObject(payload.state.settings||{},'设置');const settings=payload.state.settings||{};
  if(settings.lifeStage!==undefined&&!['menarche','regular','perimenopause'].includes(settings.lifeStage))throw clientError('使用阶段无效');
  for(const key of ['ownerNotify','partnerNotify'])if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw clientError('通知设置类型无效');
}
function daysBetween(a,b){return Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/DAY)}
function emptyState(){return {schemaVersion:3,revision:0,updatedAt:null,periods:[],logs:{},tombstones:{periods:{},logs:{}},settings:{lifeStage:'regular',ownerNotify:true,partnerNotify:true},appliedMutations:[]}}
function normalizeState(value){const empty=emptyState(),logs=migrateDailyLogs(value?.logs);return {...empty,...value,schemaVersion:3,periods:Array.isArray(value?.periods)?value.periods:[],logs,tombstones:{periods:value?.tombstones?.periods||{},logs:value?.tombstones?.logs||{}},settings:{...empty.settings,...value?.settings},appliedMutations:Array.isArray(value?.appliedMutations)?value.appliedMutations:[]}}
function periodKey(period){return period.id||`${period.start}|${period.type||'period'}`}
function newer(a,b){return String(a||'')>=String(b||'')}
function mergeTombstones(a={},b={}){const out={...a};for(const [key,at] of Object.entries(b))if(!out[key]||newer(at,out[key]))out[key]=at;return out}
function mergeState(remote,incoming,mutationId){
  const base=normalizeState(remote),next=normalizeState(incoming);if(base.appliedMutations.includes(mutationId))return base;
  const tombstones={periods:mergeTombstones(base.tombstones.periods,next.tombstones?.periods),logs:mergeTombstones(base.tombstones.logs,next.tombstones?.logs)};
  const periodMap=new Map(base.periods.map(period=>[periodKey(period),period]));
  for(const period of next.periods){const key=periodKey(period),old=periodMap.get(key);if(!old||newer(period.updatedAt,old.updatedAt))periodMap.set(key,period)}
  for(const [key,period] of periodMap)if(tombstones.periods[key]&&newer(tombstones.periods[key],period.updatedAt))periodMap.delete(key);
  const logs={...base.logs};for(const [date,log] of Object.entries(next.logs)){const old=logs[date];if(!old||newer(log.updatedAt,old.updatedAt))logs[date]=log}
  for(const [date,log] of Object.entries(logs))if(tombstones.logs[date]&&newer(tombstones.logs[date],log.updatedAt))delete logs[date];
  return {...base,schemaVersion:3,revision:Number(base.revision||0)+1,updatedAt:new Date().toISOString(),periods:[...periodMap.values()].sort((a,b)=>a.start.localeCompare(b.start)),logs,tombstones,settings:{...base.settings,...next.settings},appliedMutations:[...base.appliedMutations.slice(-99),mutationId]};
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
async function readState(env){
  const response=await github(env,`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if(response.status===404)return {state:emptyState(),sha:undefined};if(!response.ok)throw await githubError(response);
  const file=await response.json();return {state:normalizeState(JSON.parse(fromBase64(file.content))),sha:file.sha};
}
function github(env,path,init={}){return fetch(`https://api.github.com${path}`,{...init,headers:{accept:'application/vnd.github+json',authorization:`Bearer ${env.GITHUB_TOKEN}`,'x-github-api-version':'2022-11-28','user-agent':'period-sync-worker','content-type':'application/json',...(init.headers||{})}})}
async function githubError(response){const detail=await response.json().catch(()=>({}));const error=new Error(`GitHub: ${detail.message||response.status}`);error.status=response.status===401||response.status===403?502:response.status;error.code='github_error';return error}
function fromBase64(value){const binary=atob(value.replace(/\s/g,''));const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));return new TextDecoder().decode(bytes)}
function toBase64(value){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}

export {deviceCredentialSelfCheck,issueDeviceCredential,mergeState,normalizeState,validatePayload,verifyDeviceCredentialToken};
