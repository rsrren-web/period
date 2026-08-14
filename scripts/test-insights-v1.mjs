import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readTcmObservations, writeTcmObservations } from '../tcm-observation-model.js';
import { aggregateInterventionResponses } from '../analysis/intervention-response-aggregator.js';
import { analyzeTcmClusters } from '../analysis/tcm-cluster-engine.js';

const empty = readTcmObservations([]);
assert.equal(empty.cold_sensation, null, '未记录必须保持 null');
const tags = writeTcmObservations(['普通标签'], { cold_sensation: 'no', cold_hands_feet: 'yes', warmth_relief: null, bloating_level: 4, appetite_level: null, body_heaviness: 'no' });
const restored = readTcmObservations(tags);
assert.equal(restored.cold_sensation, 'no', '明确否不能变成未记录');
assert.equal(restored.cold_hands_feet, 'yes');
assert.equal(restored.warmth_relief, null);
assert.equal(restored.bloating_level, 4);

const feedback = Array.from({ length: 3 }, (_, index) => ({ intervention_id: 'tea_1', intervention_name: '测试茶饮', target: 'sleep_quality', used_at: `2026-08-0${index + 1}T12:00:00Z`, helpful: index !== 2, before: 4, after: 2 }));
const response = aggregateInterventionResponses(feedback);
assert.equal(response.length, 1);
assert.equal(response[0].interventionName, '测试茶饮');
assert.equal(response[0].dataLabel, '数据仍少');
assert.equal(aggregateInterventionResponses(feedback.slice(0, 2)).length, 0, '少于3次不得形成汇总');

const tcmRules = JSON.parse(fs.readFileSync(new URL('../knowledge/tcm_cluster_rules.json', import.meta.url), 'utf8'));
const noTcm = analyzeTcmClusters({ logs: {}, periods: [], as_of: '2026-08-13', rules_config: tcmRules });
assert.equal(noTcm.filter((item) => item.status === 'active').length, 0, '无新增体感记录时不得形成可展示的 TCM Cluster');
assert.ok(noTcm.every((item) => item.status === 'insufficient'), '数据不足状态必须保留，供质量审计使用');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const name of ['coldSensation', 'coldHandsFeet', 'warmthRelief', 'bloatingLevel', 'appetiteLevel', 'bodyHeaviness']) assert.match(html, new RegExp(`name="${name}"`));
assert.match(html, /insights-page\.js\?v=86/);
console.log('Insights v1 与 TCM 体感模型检查通过');
