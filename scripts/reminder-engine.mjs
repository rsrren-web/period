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

const dailyActions=[
  '把今天最费力的一件事降到“能完成就很好”，再给自己留一段不被打扰的休息时间。',
  '选一顿真正想吃、也容易入口的正餐；今天不接受空腹硬撑这项挑战。',
  '如果身体愿意，就慢慢走十分钟；不愿意的话，窝进被子也算完成任务。',
  '今晚把睡觉时间提前一点，手机也一起接受“强制下班”。',
  '准备一个舒服的位置和喜欢的节目，今天的娱乐时间不需要附带生产力。',
  '把“我今天希望被怎样照顾”直接告诉毛毛球，让他领取明确任务。'
];

const friendCharacters=[
  {name:'芭芭拉',subject:'芭芭拉的今日应援曲已经开始播放♪',opening:'芭芭拉闪亮登场！今天的应援对象只有一位——当然就是公主大人。',label:'今日应援动作',closing:'完成以后要记得给自己鼓掌，我也会在这里替你加倍鼓掌！',signature:'为公主大人应援的芭芭拉 ♪'},
  {name:'琴',subject:'琴团长批准公主大人今日减负',opening:'以代理团长的名义通知：公主大人今天的任务表需要重新排优先级。',label:'团长批示',closing:'休息不是擅离职守，而是为了明天仍有力量。此项安排即刻生效。',signature:'代理团长·琴'},
  {name:'安柏',subject:'侦察骑士发现一项超简单的隐藏任务！',opening:'公主大人，我从高处侦察过了——今天没有必须硬闯的危险区域！',label:'侦察骑士的隐藏任务',closing:'做完就回来向我报告，我给你颁发“今天也有好好照顾自己”徽章！',signature:'侦察骑士安柏'},
  {name:'莫娜',subject:'莫娜的星盘显示：今天适合宠爱自己',opening:'我刚刚重新计算了星轨。结果非常明确：公主大人今天不宜勉强，宜接受照顾。',label:'今日星象指引',closing:'这次占卜不收摩拉。毕竟，让公主大人舒服一点比报酬重要。',signature:'伟大的占星术士莫娜'},
  {name:'砂糖',subject:'砂糖的温柔实验：让今天舒服一点',opening:'公、公主大人，我准备了一个没有爆炸风险的小实验，只需要观察你怎样会更舒服。',label:'今日实验步骤',closing:'实验结果不需要完美。只要比刚才轻松一点，就已经是非常珍贵的数据了。',signature:'认真记录结果的砂糖'},
  {name:'凝光',subject:'群玉阁今日决策：优先照顾公主大人',opening:'我审阅了今天的安排。继续勉强自己的收益过低，这笔交易不值得。',label:'群玉阁的最优方案',closing:'时间要花在真正有价值的事情上。今天，公主大人的舒适就是最值得的投资。',signature:'凝光'},
  {name:'甘雨',subject:'甘雨已经替公主大人整理好今日事项',opening:'公主大人，今天的日程我重新整理过了。不紧急的部分，都可以安心延后。',label:'今日精简清单',closing:'剩下的事情交给明天的甘雨。今天的公主大人只负责好好度过今天。',signature:'为你整理日程的甘雨'},
  {name:'香菱',subject:'万民堂今日限定：公主大人的舒服套餐',opening:'公主大人，香菱来啦！今天不挑战奇怪食材，只研究怎样让你吃得开心又舒服。',label:'万民堂今日小菜单',closing:'吃完记得告诉我味道！如果还想加一道甜点，我可以假装没看见。',signature:'万民堂香菱'},
  {name:'八重神子',subject:'神子大人发现公主大人的秘密任务',opening:'哎呀，我听说某位公主大人今天还想逞强。这个故事走向，可逃不过我的眼睛。',label:'宫司大人的特别安排',closing:'乖乖完成，我就替你保守“今天偷偷休息了”的秘密。毛毛球除外，他负责监督。',signature:'八重神子'},
  {name:'珊瑚宫心海',subject:'心海的能量策略：今天只打有把握的仗',opening:'公主大人，能量有限时，最好的策略不是硬撑，而是把力量留给最重要的地方。',label:'今日能量部署',closing:'撤退、补给和休息都是策略的一部分。今天不需要证明任何事。',signature:'珊瑚宫心海'},
  {name:'胡桃',subject:'往生堂临时通知：公主大人今天禁止加班',opening:'咳咳，本堂主宣布：今日“逞强营业”暂停，休息业务正式开张！',label:'堂主亲自安排的业务',closing:'完成任务就算今日业绩满分。要是毛毛球不配合，我就上门催办啦！',signature:'往生堂第七十七代堂主·胡桃'},
  {name:'诺艾尔',subject:'诺艾尔已接下公主大人的今日委托',opening:'公主大人，请把今天需要照顾的事情交给我。你不必一个人全部完成。',label:'女仆骑士的委托清单',closing:'如果还有别的需要，请随时吩咐。能让你舒服一点，就是委托成功。',signature:'随时待命的诺艾尔'},
  {name:'丽莎',subject:'小可爱，丽莎老师布置了一份轻松作业',opening:'公主大人，今天的课程不考勤奋，只考你会不会对自己温柔一点。',label:'丽莎老师的课后作业',closing:'按时完成的话，姐姐会给你一个很高的分数。熬夜可是要扣分的哦？',signature:'丽莎老师'},
  {name:'宵宫',subject:'公主大人的今日小烟花已经准备好啦！',opening:'今天就算不适合放大型烟花，也可以点亮一个小小的开心瞬间！',label:'长野原今日点火计划',closing:'不需要轰轰烈烈，能让你笑一下的小火花就足够啦。',signature:'长野原宵宫'},
  {name:'纳西妲',subject:'纳西妲收到了公主大人的小小心声',opening:'身体的感受像叶子上的纹路，认真听一听，就会发现它正在告诉你今天需要什么。',label:'今天可以尝试的小事',closing:'照顾自己不是一道必须答对的题。愿你今天比昨天多一点轻松。',signature:'纳西妲'}
];

const blessingProfiles=[
  {name:'温迪',title:'风神发来庆功邀请',voice:'风已经把“辛苦啦”送到你窗边。今天就让轻松和快乐重新占领日程吧！'},
  {name:'钟离',title:'岩王帝君见证了这次圆满收官',voice:'此番辛劳已告一段落。依契约，公主大人理应获得一份郑重的嘉奖。'},
  {name:'雷电影',title:'雷之神准许公主大人今日尽情休息',voice:'你已经坚定地走完这一程。今日不必追逐永恒，只需享受片刻安宁。'},
  {name:'纳西妲',title:'小吉祥草王送来一颗奖励种子',voice:'你照顾自己的每一次选择，都会长成新的力量。今天要给这颗种子一点奖励。'},
  {name:'芙宁娜',title:'芙宁娜宣布：谢幕与庆功时间到！',voice:'多么精彩的一幕！公主大人顺利完成本月演出，现在全场应当为你起立鼓掌！'},
  {name:'玛薇卡',title:'火神为公主大人点燃庆功篝火',voice:'这一轮挑战已经漂亮结束。现在，把胜利写进今天，再痛快地奖励自己一次！'},
  {name:'渊下宫之灵',title:'古老的回声送来一份神秘奖励',voice:'跨越漫长岁月的回声已经听见你的坚持。今日，这份神秘嘉奖只属于公主大人。'}
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
    const god=pick(blessingProfiles,event.period.start),reward=pick(rewards,`${event.key}:reward`);
    return ownerNotify?[{to:ownerEmail,cc:partnerNotify?partnerEmail:undefined,subject:`${god.title} · 公主大人的奖励已送达`,text:`公主大人，还有负责见证的毛毛球：\n\n${god.voice}\n\n🎁 本次随机奖励\n${reward}\n\n毛毛球，请协助公主大人把奖励变成现实。\n\n本次记录：${event.period.start} 至 ${event.period.end}\n\n——${god.name}`}]:[];
  }
  if(event.type==='period-daily'){
    const offset=hash(event.period.start)%friendCharacters.length,character=friendCharacters[(offset+event.day-1)%friendCharacters.length],action=pick(dailyActions,`${event.key}:${character.name}`);
    return ownerNotify?[{to:ownerEmail,subject:`${character.subject}｜经期第${event.day}天`,text:`公主大人：\n\n${character.opening}\n\n${character.label}\n${action}\n\n${character.closing}\n\n——${character.signature}`}]:[];
  }
  const advice=stageAdvice(event.type);
  const label=event.label||'经后恢复阶段',periodSoon=event.type==='stage-period';
  const owner=ownerNotify?(periodSoon?{to:ownerEmail,subject:'魈的夜前传讯：公主大人，明日由我守着你',text:`公主大人：\n\n明日可能进入${label}。无需逞强，也不必向任何人证明你能忍耐。\n\n今日委托\n${advice}\n\n若有不适，唤我便是。其余纷扰，我替你挡下。\n\n${common}\n\n——魈`}:{to:ownerEmail,subject:`菲林斯的私信：公主大人，${label}在敲门`,text:`我的公主大人：\n\n明天可能进入${label}。我已经替你把“必须完美”的那一页从日程里悄悄撕掉了。\n\n今天只做这件事\n${advice}\n\n慢一点没有关系。你只管告诉我想被怎样宠着，剩下的交给我。\n\n${common}\n\n——菲林斯`}):null;
  const partner=partnerNotify?{to:partnerEmail,subject:`派蒙的紧急向导委托：毛毛球，请接住您的公主大人！`,text:`毛毛球，派蒙发现新任务啦！\n\n明天您的公主大人可能进入${label}。这次的任务不是猜她会不会不开心，而是先问一句：“今天想让我怎么陪你？”\n\n🧭 毛毛球的向导任务\n${advice}\n\n任务完成条件：公主大人觉得被理解，而不是被安排。派蒙会在旁边负责加油和监督！\n\n${common}\n\n——最好的伙伴与向导·派蒙`} : null;
  return [owner,partner].filter(Boolean);
}

export function testMails({ownerEmail,partnerEmail,prediction}){
  const note=predictionNote(prediction);
  return [
    {to:ownerEmail,subject:'【测试】菲林斯的私信已经找到公主大人',text:`我的公主大人：\n\n这是一封角色邮件测试。以后每次阶段变化，我都会带着不同的任务和惊喜来找你。\n\n你只管期待下一封信，剩下的交给我。\n\n${note}\n\n——菲林斯`},
    {to:partnerEmail,subject:'【测试】派蒙确认毛毛球的向导频道畅通！',text:`毛毛球，派蒙测试完毕！\n\n以后阶段变化前，派蒙会把“如何陪好您的公主大人”整理成有趣又好执行的向导任务。\n\n${note}\n\n——最好的伙伴与向导·派蒙`}
  ];
}
