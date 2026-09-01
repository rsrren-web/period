import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const line = name => app.split(/\r?\n/).find(value => value.startsWith(`function ${name}`) || value.startsWith(`async function ${name}`)) || '';

const startup = app.split(/\r?\n/).find(value => value.startsWith("try{markPerformanceStart('startup-local-render')")) || '';
assert.ok(startup.indexOf('await loadBase()') < startup.indexOf('renderCurrentView({heavy:true})'), '基础历史必须在本地首屏前完成');
assert.ok(startup.indexOf('renderCurrentView({heavy:true})') < startup.indexOf('startupCloudSync()'), '远端同步不得阻塞本地首屏');
assert.match(line('startupCloudSync'), /await syncNow\(false\).*await pullRemote\(\)/, '存在本地待上传数据时必须先完成或尝试同步，再读取远端，避免并发竞态');
assert.match(startup, /scheduleStatusCheck\(\)/, '状态检查必须移出首屏关键路径');
assert.match(line('scheduleStatusCheck'), /setTimeout\([^]*2500/, '状态检查必须延后，避免争抢首屏');
assert.match(line('fetchJsonWithTimeout'), /timeout=2500[^]*await response\.json/, '远端读取及响应体解析必须有 2–3 秒总超时');
assert.match(line('pullRemote'), /if\(stateChanged\|\|settingsChanged\)renderCurrentView/, '远端数据没有变化时不得重渲染');

const renderView = line('renderView');
assert.equal((renderView.match(/cycleModel\(/g) || []).length, 1, '一次视图渲染只能创建一次周期模型');
assert.equal((renderView.match(/phaseInfo\(/g) || []).length, 1, '一次视图渲染只能创建一次阶段信息');
assert.equal((renderView.match(/analysisContext\(/g) || []).length, 1, '一次视图渲染只能创建一次分析上下文');
assert.match(line('phaseForDate'), /^function phaseForDate\(date,m\)/, 'phaseForDate 必须显式接收 model');
assert.match(line('renderHero'), /^function renderHero\(p\)/, 'today 子渲染器必须复用阶段信息');
assert.match(line('renderAdvice'), /^function renderAdvice\(p\)/, '建议渲染器必须复用阶段信息');

const calendar = line('renderCalendarEnhanced');
assert.doesNotMatch(calendar, /periods\.filter|model\.ps\.filter/, '日历日期不得逐日扫描历史周期');
assert.match(calendar, /model\.periodByDate\.get\(key\)/, '日历必须通过日期 Map 查询');
assert.match(calendar, /phaseForDate\(key,model\)/, '月历必须复用当前周期模型');

assert.doesNotMatch(app, /function renderAll\(|renderAll\(\)/, '不得保留隐藏页面 renderAll');
assert.doesNotMatch(line('scheduleHeavyRefresh'), /renderCurrentView|renderView/, '后台 baseline 不得触发第二次完整渲染');
assert.equal((line('saveLocal').match(/renderCurrentView\(/g) || []).length, 1, '一次保存只能触发一轮当前视图渲染');
for (const metric of ['startup-local-render', 'remote-sync', 'save-to-ui-feedback']) assert.ok(app.includes(metric), `缺少性能测量：${metric}`);
assert.match(line('markPerformanceEnd'), /performance\.clearMarks\(start\)[^]*performance\.clearMarks\(end\)[^]*performance\.clearMeasures\(name\)/, '性能测量完成后必须清理 PerformanceEntry');
assert.match(renderView, /`render-\$\{id\}`/, '缺少 today 等页面渲染性能测量');
assert.match(renderView, /`render-calendar-\$\{calendarMode\}`/, '缺少月历和年历性能测量');

assert.doesNotMatch(index, /traditional-care\.js|personal-insights\.js|insights-page\.js/, '非核心页面模块不得由 HTML 首屏加载');
assert.match(index, /styles\.css\?v=98/, '样式变更必须使用当前缓存版本');
assert.match(line('loadInsightsPage'), /import\('\.\/insights-page\.js'\)/, '趋势模块必须动态加载');
assert.match(line('loadInsightsPage'), /catch\(error=>\{insightsPagePromise=null;insightsPageAttempt\+\+;throw error\}\)/, '失败的趋势模块 Promise 必须清空，并更换模块 URL 以允许浏览器真正重试');
assert.match(line('loadPersonalInsights'), /catch\(error=>\{personalInsightsPromise=null;personalInsightsAttempt\+\+;throw error\}\)/, '个人趋势模块必须有独立的 single-flight 重试生命周期');
assert.match(line('loadInsightsModules'), /Promise\.all\(\[loadInsightsPage\(\),loadPersonalInsights\(\)\]\)/, '趋势子模块必须独立缓存，避免一个失败导致另一个重复初始化');
assert.match(line('renderInsightsAsync'), /isCurrentRender\('insights',navigation,render\)/, '趋势异步渲染必须拒绝 stale navigation');
assert.match(line('renderInsightsAsync'), /isCurrent:\(\)=>isCurrentRender\('insights',navigation,render\)/, '趋势模块内部异步阶段也必须拒绝 stale navigation');
assert.match(line('renderCalendarStatusAsync'), /isCurrentRender\('calendar',navigation,render\)/, '日历异步增强必须拒绝 stale navigation');
assert.match(line('loadTraditionalCare'), /import\('\.\/traditional-care\.js'\)/, '传统调养必须动态加载');
assert.match(line('loadTraditionalCare'), /traditionalCarePromise=null;traditionalCareAttempt\+\+;traditionalCareState='error'/, '传统调养加载失败后必须清空 Promise 并推进重试版本');
assert.match(line('loadTraditionalCare'), /traditionalCareAttempt\?import\(`\.\/traditional-care\.js\?retry=/, '传统调养失败后必须绕过浏览器失败模块缓存');
assert.match(line('renderAdvice'), /traditionalCareState==='active'\|\|traditionalCareState==='loading'\)return/, '基础建议 renderer 不得覆盖已加载或正在加载的增强 TCM');
assert.match(renderView, /heavy\|\|traditionalCareState==='active'/, '保存后的轻量 today render 必须局部刷新已激活 TCM');
assert.match(line('renderHistory'), /allItems\.length-36/, '历史图默认最多绘制最近 36 个周期');
assert.doesNotMatch(app, /3200/, '不得保留固定 3.2 秒后的历史图重渲染');
assert.match(line('scheduleHistoryRender'), /requestIdleCallback/, '历史图必须在空闲阶段绘制');
assert.doesNotMatch(sw, /knowledge\/|og\.png|icon-512|analysis\/analysis-orchestrator/, '大型非首屏资源不得预缓存');
assert.match(sw, /ignoreSearch:true/, '带版本参数的核心模块必须可命中离线缓存');

console.log('Performance contract tests passed.');
