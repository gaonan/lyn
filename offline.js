const VERSION='20261113-r42';

// Report when this release's cache is available, independent of scene startup.
export async function prepareOffline({
  timeoutMs=15000,
  serviceWorker=globalThis.navigator?.serviceWorker,
  pageURL=globalThis.location?.href,
}={}) {
  if(!serviceWorker?.register)return {controlled:false,reason:'unsupported'};
  let scriptURL;
  try{
    const page=new URL(pageURL);
    if(page.protocol!=='https:')return {controlled:false,reason:'insecure'};
    scriptURL=new URL(`./sw.js?v=${VERSION}`,page).href;
  }catch{return {controlled:false,reason:'invalid-url'};}
  const current=()=>serviceWorker.controller?.scriptURL===scriptURL;
  if(current())return {controlled:true,reason:'ready',scriptURL};

  return new Promise(resolve=>{
    let finished=false,timer;
    function finish(reason,error){
      if(finished)return;finished=true;
      clearTimeout(timer);serviceWorker.removeEventListener('controllerchange',changed);
      resolve({controlled:reason==='ready',reason,scriptURL,...(error?{error:String(error.message||error)}:{})});
    }
    function changed(){if(current())finish('ready');}
    // Subscribe before registration: a cached worker can install and claim fast.
    serviceWorker.addEventListener('controllerchange',changed);
    const wait=Number.isFinite(timeoutMs)?Math.max(0,Math.min(timeoutMs,60000)):15000;
    timer=setTimeout(()=>finish('timeout'),wait);
    Promise.resolve().then(()=>serviceWorker.register(scriptURL,{updateViaCache:'none'}))
      .then(changed,error=>finish('registration-failed',error));
    changed();
  });
}
