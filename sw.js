const CACHE='period-helper-v109';
const REQUIRED_ASSETS=[
  './',
  './index.html',
  './styles.css',
  './sync-config.js',
  './outputs/meiyou_periods_draft.csv',
  './daily-record-model.js',
  './daily-detail-model.js',
  './daily-entry-semantics.js',
  './tcm-observation-model.js',
  './analysis/analysis-config.js',
  './analysis/data-quality-engine.js',
  './analysis/baseline-engine.js',
  './analysis/baseline-snapshot-store.js',
  './wellness-engine.js',
  './intervention-feedback.js',
  './app.js'
];
const OPTIONAL_ASSETS=[
  './manifest.webmanifest',
  './public/icons/favicon-32.png',
  './public/icons/icon-192.png',
  './public/icons/apple-touch-icon.png'
];

async function cacheAsset(cache,url){
  const response=await fetch(new Request(url,{cache:'reload'}));
  if(!response.ok)throw new Error(`cache install failed: ${url}`);
  await cache.put(url,response);
}

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE)
    .then(async cache=>{
      await Promise.all(REQUIRED_ASSETS.map(url=>cacheAsset(cache,url)));
      await Promise.allSettled(OPTIONAL_ASSETS.map(url=>cacheAsset(cache,url)));
    })
    .then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(caches.match('./index.html').then(cached=>cached||fetch(event.request).then(response=>{
      if(!response.ok)throw new Error('navigation failed');
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
      return response;
    })));
    return;
  }
  const url=new URL(event.request.url),sameOrigin=url.origin===self.location.origin;
  event.respondWith(caches.match(event.request,sameOrigin?{ignoreSearch:true}:undefined).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response;
  })));
});
