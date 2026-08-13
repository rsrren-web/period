import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const detail=fs.readFileSync(new URL('../daily-insights.js',import.meta.url),'utf8');

for(const [name,values] of Object.entries({
  menstrualStatus:['on_period','spotting_only','not_on_period','__not_recorded'],
  flowLevel:['spotting','light','medium','heavy','very_heavy'],
  bloodColor:['bright_red','dark_red','brown','pink','other'],
  clotPresence:['yes','no','not_recorded'],
  clotLevel:['small','medium','large'],
  spottingContext:['period_start_transition','period_end_transition','intermenstrual','uncertain']
})){
  assert.ok(html.includes(`name="${name}"`),`缺少 ${name} 控件`);
  values.forEach(value=>assert.ok(html.includes(`value="${value}"`),`${name} 缺少稳定枚举 ${value}`));
}
assert.match(app,/menstrualRaw==='__not_recorded'\?null/,'UI 的暂不记录必须保存为 null');
assert.match(app,/clotPresence=bleeding\?/,'血块状态必须与月经状态联动');
assert.match(app,/transition&&!periodEpisodeId/,'经期首尾点滴必须关联正式月经');
assert.match(app,/correctCycleDay\(next,value,anchor\)/,'手动周期日必须使用结构化修正函数');
assert.match(app,/form\.dataset\.cycleMode==='auto'/,'自动周期日与手动周期日必须分流');
assert.match(detail,/MENSTRUAL_LABELS/,'日历详情必须展示结构化月经字段');

console.log('Menstrual UI linkage tests passed.');
