const CACHE='carnation7-20261127-palette-r6';
const VERSION='20261122-r95';
const BARKS='assets/daimi/two-barks.m4a';
const FILES=[
  './','index.html','app.js?v=20261127-palette-r6','style.css?v=20261127-palette-r3','creator-credit.css?v=20261127-palette-r5','assets/fonts/noto-serif-sc-film.woff2?v=20261127-palette-r3','visit.js?v=20261123-r97','phonograph-entrance.css?v=20261127-palette-r4','palette-access.js?v=20261127-palette-r4','play-save.js?v=20261127-palette-r4','assets/fonts/noto-serif-sc-home-cards.woff2?v=20261127-palette-r4','assets/carnation-gold.svg','assets/carnation-gold-32.png','assets/carnation-gold-192.png',
  ...[
    'manifest.webmanifest','daimi-feeding.css','assets/lighting/atrium-probes.bin',
    'assets/loading/secret-garden-landscape.webp','assets/loading/secret-garden-portrait.webp',
    'assets/fonts/noto-serif-sc-title.woff2',BARKS,
    ...['heart','magazine','role','record','celebration'].map(cue=>`assets/sounds/${cue}.m4a`),
  ].map(path=>`${path}?v=${VERSION}`),
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('carnation7-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function isRecoveryURL(url) {
  return url.searchParams.get('repair') === '1' || url.searchParams.has('recover');
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/phonograph/')||url.pathname==='/song-archive.html'||url.pathname.startsWith('/stats/')||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  const recoveryNavigation = event.request.mode === 'navigate' && isRecoveryURL(url);
  const fromRecoveryPage = event.request.referrer && isRecoveryURL(new URL(event.request.referrer));
  if (recoveryNavigation || fromRecoveryPage) {
    event.respondWith(fetch(event.request, { cache: 'reload' }));
    return;
  }
  // A retry gets a fresh response without making the temporary URL an offline entry.
  if (url.searchParams.has('asset-retry')) {
    event.respondWith(fetch(event.request, { cache: 'reload' }));
    return;
  }
  event.respondWith((async()=>{
    const bark=url.pathname.endsWith('/'+BARKS)&&url.searchParams.get('v')===VERSION;
    const immutable=url.searchParams.get('v')===VERSION&&/\.(js|mjs|css|webp|woff2|m4a|bin)$/.test(url.pathname);
    const cached=await caches.match(event.request)
      || (event.request.mode==='navigate' ? await caches.match('./') : undefined);
    if(immutable&&cached){
      const range=event.request.headers.get('range');
      if (range && url.pathname.endsWith('.m4a')) return audioRange(cached, range);
      return bark ? audioResponse(cached) : cached;
    }
    const network=fetch(event.request).then(response=>{
      if(response.ok&&response.status!==206){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
      }
      if((response.status>=500||response.status===429)&&cached)return cached;
      return bark&&response.ok ? audioResponse(response) : response;
    }).catch(()=>cached||Response.error());
    // A previously visited flower room remains usable when the evening route
    // stalls or the origin returns an error. The network still refreshes it.
    if(event.request.mode==='navigate'&&cached){
      event.waitUntil(network.then(()=>{}));
      let timer;
      try{return await Promise.race([network,new Promise(resolve=>{
        timer=setTimeout(()=>resolve(cached),3500);
      })]);}finally{clearTimeout(timer);}
    }
    return network;
  })());
});

function audioResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'audio/mp4');
  return new Response(response.body,{status:response.status,headers});
}

// iOS asks for byte ranges for audio files already stored in full.
async function audioRange(response, range) {
  const bytes=await response.arrayBuffer();
  const size=bytes.byteLength;
  const parts=/^bytes=(\d*)-(\d*)$/i.exec(range);
  const start=parts?.[1] ? Number(parts[1]) : Math.max(0,size-Number(parts?.[2]));
  const end=parts?.[1]&&parts[2] ? Math.min(size-1,Number(parts[2])) : size-1;
  if(!parts||!Number.isFinite(start)||start>=size||start>end){
    return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  }
  return new Response(bytes.slice(start,end+1),{status:206,headers:{
    'Content-Type':'audio/mp4',
    'Accept-Ranges':'bytes',
    'Content-Range':`bytes ${start}-${end}/${size}`,
    'Content-Length':String(end-start+1),
  }});
}
