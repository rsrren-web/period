const DATA_URL='./outputs/meiyou_periods_draft.csv';
const STORE_KEY='period-helper-state-v1';
const SETTINGS_KEY='period-helper-settings-v1';
const DAY=86400000;
const fmt=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'});
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const parseDate=s=>new Date(`${s}T12:00:00`);
const days=(a,b)=>Math.round((parseDate(b)-parseDate(a))/DAY);
const addDays=(s,n)=>{const d=parseDate(s);d.setDate(d.getDate()+n);return iso(d)};
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const labels5=['很低','偏低','一般','较好','很好'];

let basePeriods=[];
let state=JSON.parse(localStorage.getItem(STORE_KEY)||'{"periods":[],"logs":{}}');
let settings={lifeStage:'regular',ownerNotify:true,partnerNotify:true,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};
let calendarCursor=new Date();
let deferredInstall;

async function loadBase(){
  const text=await fetch(DATA_URL).then(r=>{if(!r.ok)throw new Error('历史数据载入失败');return r.text()});
  const lines=text.trim().split(/\r?\n/);const head=lines.shift().split(',');
  basePeriods=lines.map(line=>{const parts=line.split(',');return Object.fromEntries(head.map((h,i)=>[h,parts[i]||'']))});
}
function allPeriods(){
  const map=new Map(basePeriods.map(p=>[p.period_start,{start:p.period_start,end:p.period_end,type:'period',source:'美柚截图',status:p.status}]));
  state.periods.filter(p=>p.type==='period').forEach(p=>map.set(p.start,p));
  return [...map.values()].sort((a,b)=>a.start.localeCompare(b.start));
}
function cycleModel(){
  const ps=allPeriods();const intervals=ps.slice(0,-1).map((p,i)=>({...p,length:days(p.start,ps[i+1].start)}));
  const valid=intervals.filter(x=>x.length>=15&&x.length<=60);
  const recent=valid.slice(-12);const weighted=[];
  recent.forEach((x,i)=>{const weight=i>=recent.length-3?3:i>=recent.length-6?2:1;for(let j=0;j<weight;j++)weighted.push(x.length)});
  const center=Math.round(median(weighted)||29);const deviations=recent.map(x=>Math.abs(x.length-center));
  let spread=Math.max(2,Math.ceil(median(deviations)*1.5));
  if(settings.lifeStage==='menarche')spread=Math.max(5,spread+2);
  if(settings.lifeStage==='perimenopause')spread=Math.max(7,spread+4);
  const last=ps.at(-1);const next=addDays(last.start,center);
  return {ps,intervals,center,spread,next,windowStart:addDays(next,-spread),windowEnd:addDays(next,spread),last,confidence:recent.length>=6&&spread<=4?'较高':recent.length>=3?'中等':'较低'};
}
function phaseInfo(){
  const m=cycleModel();const today=iso(new Date());const cd=days(m.last.start,today)+1;const inPeriod=today>=m.last.start&&today<=m.last.end;
  const ovulation=addDays(m.next,-14);const pmsStart=addDays(m.next,-7);
  let key='follicular',name='卵泡期';
  if(inPeriod){key='period';name='经期'}else if(today>=addDays(ovulation,-2)&&today<=addDays(ovulation,2)){key='ovulation';name='排卵估算期'}else if(today>=pmsStart){key='pms';name='经前阶段'}
  return {...m,today,cycleDay:cd,key,name,ovulation,pmsStart};
}
function save(){localStorage.setItem(STORE_KEY,JSON.stringify(state));render();showToast('已离线保存在本设备')}
function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}

function render(){renderHero();renderAdvice();renderCalendar();renderHistory();renderInsights();renderFamily();renderSettings()}
function renderHero(){
  const p=phaseInfo();
  document.querySelector('#cycleDay').textContent=p.cycleDay>0?p.cycleDay:'—';
  document.querySelector('#phasePill').textContent=p.name;
  document.querySelector('#nextPeriod').textContent=`预计 ${fmt.format(parseDate(p.next))} 左右进入下次经期`;
  document.querySelector('#predictionDetail').textContent=`较可能在 ${fmt.format(parseDate(p.windowStart))}–${fmt.format(parseDate(p.windowEnd))}，预测可信度${p.confidence}；近期中心周期约 ${p.center} 天。`;
}
function currentLog(){return state.logs[iso(new Date())]||{}}
function renderAdvice(){
  const p=phaseInfo(),log=currentLog();
  const phaseAdvice={
    period:['根据身体感受降低运动强度，轻柔步行和伸展通常比强撑更合适。','规律进食并保证水分，工作安排尽量留出缓冲。','若不适明显，优先休息，不用把计划完成度当作身体状态的评价。'],
    follicular:['精力可能逐步恢复，可把复杂工作分批安排，同时观察自己的实际状态。','逐渐恢复力量或有氧活动，强度以第二天不过度疲劳为准。','饮食保持蛋白质、蔬菜、全谷物和含铁食物的均衡搭配。'],
    ovulation:['这是日历法估算窗口，不代表已经确认排卵，也不能用于避孕保证。','若记录基础体温，只有持续变化趋势才有回顾性参考意义。','维持正常作息和活动，不必为了“周期阶段”强行改变计划。'],
    pms:['为睡眠和临时变化预留空间，减少连续高压或过晚的安排。','如果以往此时容易嗜睡或烦躁，可提前和伴侣沟通希望得到的支持。','规律进食、适量活动，并观察咖啡因、酒精或高盐饮食是否加重个人不适。']};
  let list=[...phaseAdvice[p.key]];
  if(Number(log.sleep)<=2)list.unshift('今天记录的睡眠偏低，优先补足休息，再决定运动和工作强度。');
  if(Number(log.pain)>=6)list.unshift('今天疼痛记录较高，建议减少勉强活动并持续观察。');
  document.querySelector('#dailyAdvice').innerHTML=`<div class="advice-list">${list.slice(0,4).map(x=>`<div class="advice-item">${x}</div>`).join('')}</div>`;

  const symptoms=log.symptoms||[];let tendency='当前记录不足，先观察睡眠、冷热感、食欲、疼痛性质、经量与情绪的组合变化。';let tips=['以温和、规律、可持续为原则，不因单一症状自行确定证型。'];
  if(symptoms.includes('怕冷')&&Number(log.energy)<=2){tendency='传统辨证中，怕冷与疲乏同时出现可作为偏虚寒倾向的线索，但仍需结合经量、舌脉、食欲和持续时间。';tips=['选择温热熟食、规律三餐；可少量饮用普通姜枣饮，胃部灼热、过敏或不适时停止。','避免空腹大量饮用刺激性饮品，优先保证睡眠和轻柔活动。']}
  else if(symptoms.includes('烦躁')||symptoms.includes('情绪敏感')){tendency='传统辨证中，经前烦躁、情绪敏感可作为气机不畅倾向的线索；单凭情绪不能确定证候。';tips=['安排舒缓步行、拉伸或呼吸练习，减少连续高压任务。','可选择普通玫瑰花饮作为食物级饮品；过敏、孕期可能性或服药情况下先咨询专业人员。']}
  else if(symptoms.includes('腹胀')||symptoms.includes('食欲变化')){tendency='腹胀与食欲变化在传统辨证中常需结合排便、口渴、舌苔和饮食诱因继续观察。';tips=['以温热、清淡、规律饮食为主，暂时减少过量油腻、酒精和冰冷刺激。','记录进食与症状时间，优先寻找个人重复模式。']}
  document.querySelector('#tcmAdvice').innerHTML=`<p>${tendency}</p><div class="advice-list">${tips.map(x=>`<div class="advice-item">${x}</div>`).join('')}</div>`;
}
function monthDates(y,m){const first=new Date(y,m,1,12),start=new Date(first);start.setDate(1-first.getDay());return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d})}
function inRange(x,a,b){return x>=a&&x<=b}
function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),model=cycleModel();
  document.querySelector('#calendarTitle').textContent=`${y}年${m+1}月`;
  const recorded=allPeriods();const today=iso(new Date());
  document.querySelector('#calendarGrid').innerHTML=monthDates(y,m).map(d=>{const s=iso(d);const rec=recorded.some(p=>inRange(s,p.start,p.end));const pred=inRange(s,model.windowStart,model.windowEnd);const ovu=inRange(s,addDays(model.next,-16),addDays(model.next,-12));return `<button class="day ${d.getMonth()!==m?'outside':''} ${s===today?'today':''} ${rec?'recorded':''} ${pred?'predicted':''} ${ovu?'ovulation':''}" data-date="${s}">${d.getDate()}</button>`}).join('');
}
function renderHistory(){
  const ps=allPeriods();document.querySelector('#historyCount').textContent=`${ps.length} 次`;
  document.querySelector('#historyList').innerHTML=[...ps].reverse().map((p,idx)=>{const realIndex=ps.length-1-idx;const cycle=realIndex<ps.length-1?days(p.start,ps[realIndex+1].start):'—';return `<div class="history-row"><strong>${p.start} → ${p.end}</strong><span>经期 ${days(p.start,p.end)+1} 天</span><span>周期 ${cycle} 天</span></div>`}).join('');
}
function renderInsights(){
  const m=cycleModel(),cycles=m.intervals.map(x=>x.length),periodDays=m.ps.map(p=>days(p.start,p.end)+1),recent=cycles.slice(-12);
  const stats=[['29天',`全部中位周期`],[`${mean(recent).toFixed(1)}天`,'近12次平均'],[`${Math.min(...recent)}–${Math.max(...recent)}天`,'近12次范围'],[`${mean(periodDays.slice(-12)).toFixed(1)}天`,'近12次经期']];
  document.querySelector('#summaryStats').innerHTML=stats.map(([v,l])=>`<div class="stat"><strong>${v}</strong><span>${l}</span></div>`).join('');
  document.querySelector('#cycleChart').innerHTML=m.intervals.slice(-36).map(x=>`<div class="bar" style="height:${clamp((x.length-15)*8,20,210)}px" data-label="${x.start} · ${x.length}天"></div>`).join('');
  const logs=Object.entries(state.logs);const byPhase={period:[],follicular:[],ovulation:[],pms:[]};
  logs.forEach(([date,l])=>{const copyToday=phaseForDate(date,m);byPhase[copyToday].push(l)});
  document.querySelector('#moodInsight').innerHTML=logs.length<6?'<p class="muted">至少记录6天后开始显示个人情绪模式；跨3个周期后可信度更高。</p>':phaseAverages(byPhase,'mood');
  document.querySelector('#lifestyleInsight').innerHTML=logs.length<6?'<p class="muted">继续记录睡眠、精力和活动，系统将按周期阶段比较个人变化。</p>':['sleep','energy','activity'].map(k=>`<div class="insight-line">${({sleep:'睡眠',energy:'精力',activity:'活动'})[k]}：${bestPhase(byPhase,k)}</div>`).join('');
  const unusual=m.intervals.filter(x=>x.length<21||x.length>35);
  document.querySelector('#qualityInsight').innerHTML=`<p>历史中有 <strong>${unusual.length}</strong> 个周期开始间隔在21–35天之外。它们被保留，不会自动删除。</p><p class="muted">当前历史来自截图转录；已确认的2019年18天周期将保留，但在预测中使用稳健中位数降低单次极端值影响。</p>`;
}
function phaseForDate(date,m){
  if(m.ps.some(p=>inRange(date,p.start,p.end)))return'period';
  const starts=m.ps.map(p=>p.start).sort();
  const nextStart=starts.find(start=>start>date)||m.next;
  if(inRange(date,addDays(nextStart,-16),addDays(nextStart,-12)))return'ovulation';
  if(inRange(date,addDays(nextStart,-7),addDays(nextStart,-1)))return'pms';
  return'follicular';
}
function phaseAverages(groups,key){const names={period:'经期',follicular:'卵泡期',ovulation:'排卵估算期',pms:'经前阶段'};return Object.entries(groups).filter(([,a])=>a.length).map(([k,a])=>`<div class="insight-line">${names[k]}：${mean(a.map(x=>Number(x[key])||3)).toFixed(1)}/5（${a.length}条）</div>`).join('')}
function bestPhase(groups,key){const entries=Object.entries(groups).filter(([,a])=>a.length).map(([k,a])=>[k,mean(a.map(x=>Number(x[key])||3))]).sort((a,b)=>b[1]-a[1]);return entries.length?`${({period:'经期',follicular:'卵泡期',ovulation:'排卵估算期',pms:'经前阶段'})[entries[0][0]]}记录相对较高`:'数据不足'}
function renderFamily(){
  const p=phaseInfo();document.querySelector('#familyPhase').textContent=`当前约为周期第 ${p.cycleDay} 天 · ${p.name}`;
  document.querySelector('#familySummary').textContent=`下次经期中心预测为 ${fmt.format(parseDate(p.next))}，较可能在 ${fmt.format(parseDate(p.windowStart))}–${fmt.format(parseDate(p.windowEnd))}。预测会随新记录更新。`;
  const support=p.key==='pms'?'近期可预留更多睡眠和安排缓冲；先询问需要陪伴、准备用品，还是减少打扰。':p.key==='period'?'当前处于已记录经期；可以关心休息、补充用品和当天实际感受。':'维持正常关心即可，不依据周期阶段替本人判断情绪或能力。';
  document.querySelector('#familySupport').textContent=support;
  document.querySelector('#emailPreview').innerHTML=`主题：明天可能进入经期提醒<br><br>预计明天接近经期中心日期。她在这个阶段可能更需要休息或安排缓冲，实际感受以她本人为准。建议先询问今天希望获得怎样的支持。`;
}
function renderSettings(){document.querySelector('#lifeStage').value=settings.lifeStage;document.querySelector('#ownerNotify').checked=settings.ownerNotify;document.querySelector('#partnerNotify').checked=settings.partnerNotify;document.querySelector('#offlineStatus').textContent=navigator.onLine?'当前在线；新记录仍会先保存在本设备。':'当前离线；记录功能仍可使用，联网后可重新载入公开历史。'}
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'})}
function showToast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
async function hash(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function ensureEditor(){if(!settings.passcodeHash)return true;if(sessionStorage.getItem('period-editor')==='yes')return true;const entered=prompt('请输入共享编辑口令');if(entered&&await hash(entered)===settings.passcodeHash){sessionStorage.setItem('period-editor','yes');return true}showToast('口令不正确');return false}

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelector('#openLogBtn').addEventListener('click',()=>{showView('today');document.querySelector('.quick-log').scrollIntoView({behavior:'smooth'})});
document.querySelector('#startPeriodBtn').addEventListener('click',async()=>{if(!await ensureEditor())return;const d=document.querySelector('#periodDialog'),today=iso(new Date());d.querySelector('[name=start]').value=today;d.querySelector('[name=end]').value=today;d.showModal()});
document.querySelector('#periodForm').addEventListener('submit',async e=>{if(e.submitter?.value==='cancel')return; e.preventDefault();const f=new FormData(e.currentTarget),start=f.get('start'),end=f.get('end')||start;if(end<start)return showToast('结束日期不能早于开始日期');state.periods.push({start,end,type:f.get('type'),source:'本设备',status:'confirmed'});save();document.querySelector('#periodDialog').close()});
document.querySelector('#dailyForm').addEventListener('submit',async e=>{e.preventDefault();if(!await ensureEditor())return;const f=new FormData(e.currentTarget);state.logs[iso(new Date())]={mood:f.get('mood'),energy:f.get('energy'),sleep:f.get('sleep'),activity:f.get('activity'),pain:f.get('pain'),stress:f.get('stress'),symptoms:f.getAll('symptom'),temperature:f.get('temperature'),discharge:f.get('discharge'),sexualActivity:f.get('sexualActivity')==='on',notes:f.get('notes'),updatedAt:new Date().toISOString()};save()});
document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('input',()=>{input.nextElementSibling.textContent=input.name==='pain'?input.value:labels5[input.value-1]}));
document.querySelector('#prevMonth').addEventListener('click',()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar()});
document.querySelector('#nextMonth').addEventListener('click',()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar()});
document.querySelector('#lifeStage').addEventListener('change',e=>{settings.lifeStage=e.target.value;saveSettings();render()});
document.querySelector('#ownerNotify').addEventListener('change',e=>{settings.ownerNotify=e.target.checked;saveSettings()});
document.querySelector('#partnerNotify').addEventListener('change',e=>{settings.partnerNotify=e.target.checked;saveSettings()});
document.querySelector('#savePasscode').addEventListener('click',async()=>{const v=document.querySelector('#editPasscode').value;if(v.length<4)return showToast('口令至少4位');settings.passcodeHash=await hash(v);saveSettings();sessionStorage.setItem('period-editor','yes');document.querySelector('#editPasscode').value='';showToast('编辑口令已设置在本设备')});
document.querySelector('#exportBtn').addEventListener('click',()=>{const payload={schemaVersion:1,exportedAt:new Date().toISOString(),periods:allPeriods(),logs:state.logs,settings:{lifeStage:settings.lifeStage,ownerNotify:settings.ownerNotify,partnerNotify:settings.partnerNotify}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=`period-backup-${iso(new Date())}.json`;a.click();URL.revokeObjectURL(a.href)});
document.querySelector('#importInput').addEventListener('change',async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(data.schemaVersion!==1||!Array.isArray(data.periods))throw new Error();state.periods=data.periods.filter(p=>p.source!=='美柚截图');state.logs=data.logs||{};save()}catch{showToast('备份文件格式不正确')}});
document.querySelector('#resetLocalBtn').addEventListener('click',async()=>{if(!await ensureEditor())return;if(confirm('只清除本设备新增记录？公开历史不会删除。')){state={periods:[],logs:{}};save()}});
window.addEventListener('online',renderSettings);window.addEventListener('offline',renderSettings);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;document.querySelector('#installBtn').hidden=false});
document.querySelector('#installBtn').addEventListener('click',async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;document.querySelector('#installBtn').hidden=true}});

if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
try{await loadBase();render();const params=new URLSearchParams(location.search);if(params.get('view')==='family'){showView('family');document.querySelector('.tabs').hidden=true;document.querySelector('.hero-actions').hidden=true}}catch(err){document.querySelector('#nextPeriod').textContent='历史数据载入失败';document.querySelector('#predictionDetail').textContent='请联网刷新或检查数据文件。';console.error(err)}
