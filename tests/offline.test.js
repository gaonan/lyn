import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOffline} from '../dist/offline.js';

const pageURL='https://example.test/flower/?v=20261113-r25';
const currentURL='https://example.test/flower/sw.js?v=20261113-r25';
class Workers extends EventTarget {
  controller=null;
  requests=[];
  listenerCount=0;
  register(url,options){this.requests.push({url,options});return Promise.resolve({active:this.controller});}
  addEventListener(type,listener){super.addEventListener(type,listener);this.listenerCount++;}
  removeEventListener(type,listener){super.removeEventListener(type,listener);this.listenerCount--;}
  claim(scriptURL){this.controller={scriptURL};this.dispatchEvent(new Event('controllerchange'));}
}
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));

test('first visit waits for the new worker to claim the page, not registration alone',async()=>{
  const workers=new Workers();let settled=false;
  const pending=prepareOffline({serviceWorker:workers,pageURL}).then(value=>{settled=true;return value;});
  await tick();await tick();
  assert.equal(settled,false);
  assert.deepEqual(workers.requests,[{url:currentURL,options:{updateViaCache:'none'}}]);
  workers.claim(currentURL);
  assert.equal((await pending).controlled,true);assert.equal(workers.listenerCount,0);
});

test('R2 registration/activation cannot release a model request before R22 takes control',async()=>{
  const workers=new Workers();workers.controller={scriptURL:'https://example.test/flower/sw.js?v=20261113-r2'};
  let settled=false;
  const pending=prepareOffline({serviceWorker:workers,pageURL}).then(value=>{settled=true;return value;});
  await tick();await tick();workers.claim(workers.controller.scriptURL);await tick();
  assert.equal(settled,false,'the existing R2 worker must not receive the R22 model');
  workers.claim(currentURL);
  assert.deepEqual(await pending,{controlled:true,reason:'ready',scriptURL:currentURL});
  assert.equal(workers.listenerCount,0);
});

test('an already controlling R22 worker permits an offline revisit without registering over the network',async()=>{
  const workers=new Workers();workers.controller={scriptURL:currentURL};
  const result=await prepareOffline({serviceWorker:workers,pageURL});
  assert.equal(result.controlled,true);assert.equal(workers.requests.length,0);assert.equal(workers.listenerCount,0);
});

test('a stalled registration times out, removes listeners and lets the online model load proceed',async()=>{
  const workers=new Workers();workers.register=()=>new Promise(()=>{});
  const result=await prepareOffline({serviceWorker:workers,pageURL,timeoutMs:10});
  assert.equal(result.controlled,false);assert.equal(result.reason,'timeout');assert.equal(workers.listenerCount,0);
  workers.claim(currentURL);assert.equal(result.reason,'timeout');
});

test('registration errors fail open with a reason instead of blocking the scene',async()=>{
  const workers=new Workers();workers.register=()=>Promise.reject(new Error('fixture: storage disabled'));
  const result=await prepareOffline({serviceWorker:workers,pageURL});
  assert.equal(result.controlled,false);assert.equal(result.reason,'registration-failed');
  assert.equal(result.error,'fixture: storage disabled');assert.equal(workers.listenerCount,0);
});

test('HTTP local preview skips worker installation and continues immediately',async()=>{
  const workers=new Workers();
  const result=await prepareOffline({serviceWorker:workers,pageURL:'http://localhost:4173/'});
  assert.equal(result.controlled,false);assert.equal(result.reason,'insecure');assert.equal(workers.requests.length,0);
});
