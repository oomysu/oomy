/* oomy service worker: оффлайн-оболочка + быстрые повторные загрузки.
   медиа и аудио не кэшируем — они тяжёлые и идут с range-запросами. */
const CACHE='oomy-v2';
const SHELL=[
  './',
  './index.html',
  './manifest.json',
  './assets/images/favicon.svg',
  './assets/images/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(new Request(u,{cache:'reload'}))))).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

function isStatic(url){
  return /\.(?:css|js|json|woff2?|png|jpe?g|gif|webp|svg|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  let url;
  try{url=new URL(req.url);}catch(err){return;}
  if(url.origin!==self.location.origin)return;
  /* музыка и большие медиа — мимо кэша */
  if(/\/assets\/audio\//i.test(url.pathname))return;
  if(req.headers.get('range'))return;

  /* страницы: сначала сеть, оффлайн — сохранённая оболочка */
  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{});
        return res;
      }).catch(()=>caches.match('./index.html').then(r=>r||caches.match('./')))
    );
    return;
  }

  if(!isStatic(url))return;

  /* статика: сразу из кэша, обновление — фоном */
  e.respondWith(
    caches.match(req).then(hit=>{
      const net=fetch(req).then(res=>{
        if(res&&res.ok){
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>hit);
      return hit||net;
    })
  );
});
