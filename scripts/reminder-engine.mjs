import {addDays,days,median} from './period-core.mjs';

export function zonedDate(value=new Date(),timeZone='America/Vancouver'){
  return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
}

function updatedDate(period){
  if(!period?.updatedAt)return '';
  const value=new Date(period.updatedAt);
  return Number.isNaN(value.getTime())?'':zonedDate(value);
}

function periodEndSendDate(period){
  if(!period?.end||updatedDate(period)!==period.end)return '';
  const updatedAt=new Date(period.updatedAt);
  const scheduledCutoff=new Date(`${period.end}T17:17:00Z`);
  return updatedAt<=scheduledCutoff?period.end:addDays(period.end,1);
}

function hash(value){let result=2166136261;for(const character of value){result^=character.charCodeAt(0);result=Math.imul(result,16777619)}return result>>>0}
function pick(values,key){return values[hash(key)%values.length]}

export function normalizedUserPeriods(userData){
  return (userData.periods||[]).filter(period=>period?.type==='period'&&period.status!=='deleted').sort((a,b)=>a.start.localeCompare(b.start));
}

export function buildReminderEvents({date,prediction,periods,userData,sent=[]}){
  const events=[];
  const sentSet=new Set(sent);
  const userPeriods=normalizedUserPeriods(userData);
  const ongoing=[...userPeriods].reverse().find(period=>period.status==='ongoing'&&period.start<=date);
  const durations=periods.filter(period=>period.status!=='ongoing').map(period=>days(period.period_start,period.period_end)+1).filter(value=>value>=2&&value<=12).slice(-12);
  const usualDuration=Math.round(median(durations)||6);
  const addEvent=(event)=>{if(!sentSet.has(event.key))events.push(event)};

  const ended=[...userPeriods].reverse().find(period=>period.status==='confirmed'&&periodEndSendDate(period)===date);
  if(ended)addEvent({type:'period-ended',key:`period-ended:${ended.start}:${ended.end}`,period:ended});

  if(ongoing){
    addEvent({type:'period-daily',key:`period-daily:${ongoing.start}:${date}`,period:ongoing,day:days(ongoing.start,date)+1});
    const recoveryStart=addDays(ongoing.start,usualDuration);
    if(date===addDays(recoveryStart,-1))addEvent({type:'stage-recovery',key:`stage-recovery:${ongoing.start}`,targetDate:recoveryStart});
    return events;
  }

  const stageDates=[
    ['stage-ovulation',addDays(prediction.next,-16),'排卵估算阶段'],
    ['stage-luteal',addDays(prediction.next,-7),'经前准备阶段'],
    ['stage-period',prediction.next,'预计经期']
  ];
  for(const[type,targetDate,label]of stageDates)if(date===addDays(targetDate,-1))addEvent({type,key:`${type}:${targetDate}`,targetDate,label});
  return events;
}

const friendProfiles=[
  ['元气行动派','今天只做身体允许的那一份，剩下的任务可以理直气壮地往后放。'],
  ['温柔花艺师','给自己留一点柔软的时间，热敷、温水和安静休息都算认真照顾自己。'],
  ['理性图书管理员','先看疼痛、睡眠和精力记录，再安排今天；身体数据比原定计划更有发言权。'],
  ['自在旅行家','慢一点也会抵达。今天适合轻松散步，累了就及时回到舒服的地方。'],
  ['可靠料理搭档','别空着肚子硬撑，准备容易入口的正餐和水，吃得舒服比仪式感更重要。'],
  ['沉稳守夜人','如果今晚容易疲倦，就把睡眠放在优先级最前面，其他事情明天再处理。'],
  ['优雅生活家','公主大人不需要用忍耐证明坚强；清楚说出需要，也是一种从容。']
];

const blessingProfiles=[
  ['风之祝福','愿今天的轻松像风一样回来。'],['岩之祝福','你安稳走过了这一程，值得被认真夸奖。'],['雷之祝福','辛苦已经过去，接下来把时间留给喜欢的事。'],['草木祝福','身体正在进入新的节律，慢慢恢复就很好。'],['清泉祝福','愿疲惫被温柔带走，清爽和自在重新回来。'],['焰火祝福','今天值得庆祝，给自己一点明亮的小奖励。'],['晨光祝福','新阶段已经开始，愿你被好好照顾，也好好宠爱自己。']
];
const rewards=['20元自由小礼包：可以买任何想吃或想玩的小东西','一杯喜欢的饮品','今晚免做一项家务','一份自选甜点或水果','一次不被打扰的休息时段','周末一顿喜欢的饭','挑一件30元以内让自己开心的小物'];

function predictionNote(prediction){return `预计日期：${prediction.next}\n可能范围：${prediction.windowStart} 至 ${prediction.windowEnd}\n近期中心周期：${prediction.center}天\n\n日期来自历史记录估算，可能提前或推迟。`}

function stageAdvice(type){
  return ({
    'stage-ovulation':'保持平常的睡眠、饮水和活动即可。这是日历估算阶段，不代表已确认排卵，也不能用于避孕保证。',
    'stage-luteal':'给睡眠和临时变化留一点空间；如果容易疲倦或烦躁，可以提前减少连续高压安排。',
    'stage-period':'今天确认经期用品和热敷用品，规律进食，并为明天的工作与运动预留调整空间。',
    'stage-recovery':'经后恢复阶段可能即将开始。继续补足睡眠和规律饮食，活动量按精力逐日恢复。'
  })[type];
}

export function mailForEvent(event,{prediction,ownerEmail,partnerEmail,ownerNotify=true,partnerNotify=true}){
  const common=predictionNote(prediction);
  if(event.type==='period-ended'){
    const [profile,blessing]=pick(blessingProfiles,event.key),reward=pick(rewards,`${event.key}:reward`);
    return ownerNotify?[{to:ownerEmail,cc:partnerNotify?partnerEmail:undefined,subject:`公主大人的经期结束祝福 · ${profile}`,text:`公主大人，${blessing}\n\n这几天辛苦了。今天不需要立刻把所有计划恢复到满格，先按精力慢慢回来。\n\n本次随机奖励：${reward}\n请毛毛球协助兑现；奖励只是轻松的小约定，不涉及系统自动付款。\n\n本次记录：${event.period.start} 至 ${event.period.end}`}]:[];
  }
  if(event.type==='period-daily'){
    const [profile,care]=pick(friendProfiles,event.key);
    return ownerNotify?[{to:ownerEmail,subject:`公主大人的经期第${event.day}天 · ${profile}来陪你`,text:`公主大人，今天是已记录经期的第${event.day}天。\n\n${care}\n\n如果疼痛突然明显加重、出血异常或已经影响日常活动，请及时寻求专业帮助。`}]:[];
  }
  const advice=stageAdvice(event.type);
  const ownerTone=event.type==='stage-period'?'我会安静地提醒你：不舒服时不必逞强，今天提前准备好，明天会更从容。':'新的阶段快到了。把节奏交给真实感受，我会提醒你先照顾自己，再处理计划。';
  const owner=ownerNotify?{to:ownerEmail,subject:`公主大人，明天可能进入${event.label||'经后恢复阶段'}`,text:`公主大人，${ownerTone}\n\n${advice}\n\n${common}`} : null;
  const partner=partnerNotify?{to:partnerEmail,subject:`毛毛球的小向导提醒：您的公主大人明天可能进入${event.label||'经后恢复阶段'}`,text:`毛毛球，明天您的公主大人可能进入${event.label||'经后恢复阶段'}。\n\n${advice}\n\n最实用的支持方式是先问她今天希望被怎样照顾，不要预设她一定会出现某种情绪或症状。\n\n${common}`} : null;
  return [owner,partner].filter(Boolean);
}

export function testMails({ownerEmail,partnerEmail,prediction}){
  const note=predictionNote(prediction);
  return [
    {to:ownerEmail,subject:'【测试】公主大人的周期陪伴邮件已就绪',text:`公主大人，阶段提醒、经期每日关怀和结束祝福的邮件配置可以正常工作。\n\n${note}`},
    {to:partnerEmail,subject:'【测试】毛毛球的周期小向导已就绪',text:`毛毛球，之后会收到您的公主大人的阶段准备提醒；邮件不会默认披露每日私人症状。\n\n${note}`}
  ];
}
