const CACHE='period-helper-v16';
const ASSETS=['./','./index.html','./styles.css','./sync-config.js','./app.js','./manifest.webmanifest','./public/og.png','./public/icons/favicon-32.png','./public/icons/icon-192.png','./public/icons/icon-512.png','./public/icons/icon-maskable-512.png','./public/icons/apple-touch-icon.png','./outputs/meiyou_periods_draft.csv','./data/user-data.json'];
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
