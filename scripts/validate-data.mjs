import {loadPeriods,days,model} from './period-core.mjs';
const periods=loadPeriods();
const errors=[];
periods.forEach((p,i)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.period_start)||!/^\d{4}-\d{2}-\d{2}$/.test(p.period_end))errors.push(`第${i+1}行日期格式错误`);
  if(days(p.period_start,p.period_end)<0)errors.push(`${p.period_start} 结束早于开始`);
  if(i&&p.period_start<=periods[i-1].period_start)errors.push(`${p.period_start} 顺序或重复错误`);
});
const m=model(periods);const outside=m.intervals.filter(n=>n<21||n>35);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(JSON.stringify({records:periods.length,first:periods[0].period_start,last:periods.at(-1).period_end,centerCycle:m.center,nextPrediction:m.next,outside21to35:outside},null,2));
