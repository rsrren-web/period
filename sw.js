const CACHE='period-helper-v88';
const ASSETS=['./','./index.html','./styles.css','./sync-config.js','./daily-record-model.js','./tcm-observation-model.js','./analysis/analysis-config.js','./analysis/data-quality-engine.js','./analysis/baseline-engine.js','./analysis/baseline-snapshot-store.js','./analysis/health-event-engine.js','./analysis/pattern-engine.js','./analysis/intervention-engine.js','./analysis/recommendation-context-adapter.js','./analysis/recommendation-engine.js','./analysis/recommendation-pipeline.js','./analysis/daily-nourishment.js','./analysis/insight-builder.js','./analysis/insight-ranker.js','./analysis/insights-page-data.js','./analysis/insights-repository.js','./analysis/intervention-response-aggregator.js','./analysis/tcm-cluster-engine.js','./knowledge/interventions.v1.json','./knowledge/insights_config.json','./knowledge/observation_actions.json','./knowledge/tcm_cluster_rules.json','./knowledge/wellness-knowledge.js','./traditional-care.js','./daily-insights.js','./personal-insights.js','./wellness-engine.js','./insights-page.js','./app.js','./manifest.webmanifest','./public/og.png','./public/icons/favicon-32.png','./public/icons/icon-192.png','./public/icons/icon-512.png','./public/icons/icon-maskable-512.png','./public/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(ASSETS.map(async url=>{const response=await fetch(new Request(url,{cache:'reload'}));if(response.ok)await cache.put(url,response)}))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));return response}).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response;
  }).catch(()=>caches.match(event.request)));
});
