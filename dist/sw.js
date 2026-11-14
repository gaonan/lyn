const CACHE='carnation7-20261113-r26';
const VERSION='20261113-r26';
const BARKS='assets/daimi/two-barks.m4a';
const FILES=['./','index.html','manifest.webmanifest','assets/icon.svg','vendor/three.module.min.js','vendor/three.core.min.js',...['style.css','main.js','architecture.js','botanicals.js','performer-photo.js','performer-views.js','offline.js','hearts.js','collection.js','navigation.js','music.js','magazines.js','magazine-quest.js','daimi-views.js','roles.js','record.js','reward-sounds.js','artwork.js','assets/fonts/noto-serif-sc-title.woff2',BARKS, ...['heart','magazine','role','record','celebration'].map(cue=>`assets/sounds/${cue}.m4a`)].map(path=>`${path}?v=${VERSION}`)];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('carnation7-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    // Artwork textures are immutable within a release.
    const texture=/\/assets\/(performer|magazines|daimi|roles|record)\/[^/]+\.webp$/.test(url.pathname)&&url.searchParams.get('v')===VERSION;
    const bark=url.pathname.endsWith('/'+BARKS)&&url.searchParams.get('v')===VERSION;
    const cue=/\/assets\/sounds\/[^/]+\.m4a$/.test(url.pathname)&&url.searchParams.get('v')===VERSION;
    if(bark||texture||cue){
      const cached=await caches.match(event.request);
      if(cached){
        const range=event.request.headers.get('range');
        return bark&&range ? audioRange(cached,range) : cached;
      }
    }
    try{
      const response=await fetch(event.request);
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
      return response;
    }catch{
      const cached=await caches.match(event.request);if(cached)return cached;
      if(event.request.mode==='navigate')return await caches.match('./')||Response.error();
      return Response.error();
    }
  })());
});

// iOS asks for byte ranges even for this short, fully precached audio clip.
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
    'Content-Type':response.headers.get('Content-Type')||'audio/mp4',
    'Accept-Ranges':'bytes',
    'Content-Range':`bytes ${start}-${end}/${size}`,
    'Content-Length':String(end-start+1),
  }});
}
