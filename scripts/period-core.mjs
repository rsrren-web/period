import fs from 'node:fs';

export function loadPeriods(path='outputs/meiyou_periods_draft.csv'){
  const text=fs.readFileSync(path,'utf8').trim();
  const lines=text.split(/\r?\n/);const headers=lines.shift().split(',');
  return lines.map(line=>{const parts=line.split(',');return Object.fromEntries(headers.map((h,i)=>[h,parts[i]||'']))}).sort((a,b)=>a.period_start.localeCompare(b.period_start));
}
export const asDate=s=>new Date(`${s}T12:00:00Z`);
export const days=(a,b)=>Math.round((asDate(b)-asDate(a))/86400000);
export function addDays(s,n){const d=asDate(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function median(values){const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]}
export function model(periods){
  const intervals=periods.slice(0,-1).map((p,i)=>days(p.period_start,periods[i+1].period_start)).filter(n=>n>=15&&n<=60);
  const recent=intervals.slice(-12),weighted=[];
  recent.forEach((n,i)=>{const w=i>=recent.length-3?3:i>=recent.length-6?2:1;for(let j=0;j<w;j++)weighted.push(n)});
  const center=Math.round(median(weighted));const deviation=median(recent.map(n=>Math.abs(n-center)));const spread=Math.max(2,Math.ceil(deviation*1.5));
  const next=addDays(periods.at(-1).period_start,center);
  return {center,spread,next,windowStart:addDays(next,-spread),windowEnd:addDays(next,spread),intervals};
}
