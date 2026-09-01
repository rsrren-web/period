import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const detail=fs.readFileSync(new URL('../daily-insights.js',import.meta.url),'utf8');
const wellness=fs.readFileSync(new URL('../wellness-engine.js',import.meta.url),'utf8');

for(const name of ['menstrualStatus','clotPresence','clotLevel','spottingContext','periodEpisodeId']) assert.doesNotMatch(html,new RegExp(`name="${name}"`),`每日记录不应重新包含 ${name} 控件`);
for(const name of ['flowLevel','bloodColor','clotAmount']) assert.match(html,new RegExp(`name="${name}"`),`月经日必须可记录 ${name}`);
assert.doesNotMatch(html,/今天的月经状态/,'每日记录不得重复首页月经入口');
assert.match(html,/name="manualCycleDay"/,'移除月经状态后仍须保留周期日修正');
assert.match(app,/const actualPeriod=periodForDate\(date\),menstrualStatus=actualPeriod\?'on_period'/,'保存每日记录时必须从首页月经记录推导状态');
assert.doesNotMatch(app,/f\.get\('menstrualStatus'\)/,'每日记录保存不得读取已删除控件');
assert.match(app,/refreshMenstrualDetails\(f,date\)/,'经血记录必须只在实际月经日显示');
assert.match(app,/f\.get\('flowLevel'\)/,'保存时必须读取经量');
assert.match(app,/f\.get\('bloodColor'\)/,'保存时必须读取经血颜色');
assert.match(app,/f\.get\('clotAmount'\)/,'保存时必须读取血块量');
assert.match(app,/correctCycleDay\(next,value,anchor\)/,'手动周期日必须使用结构化修正函数');
assert.match(app,/form\.dataset\.cycleMode==='auto'/,'自动周期日与手动周期日必须分流');
assert.match(detail,/MENSTRUAL_LABELS/,'日历详情必须展示结构化月经字段');
assert.match(wellness,/statusIcon\('月经', menstrualStatus/,'首页最终状态卡必须展示月经状态或明确未记录');

console.log('Menstrual UI linkage tests passed.');
