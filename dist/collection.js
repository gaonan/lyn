export function setupCollection(hearts, getPlayer, rewardSounds, onCollect) {
  const root=document.createElement('div');root.innerHTML=`<div id="heart-counter" aria-live="polite"><span>♡</span><label>心心收集度：</label><b>0</b><em>/ 5</em></div><button id="collect-heart" hidden aria-label="按住两秒收集爱心"><svg viewBox="0 0 72 72"><circle class="track" cx="36" cy="36" r="32"/><circle class="progress" cx="36" cy="36" r="32"/></svg><span class="heart-symbol">♥</span><span class="collect-label">按住收集<small>2 秒 · 留住这份心意</small></span></button><div id="collected-message" role="status">♥ 已收集</div><div id="finale" hidden><canvas id="petal-sky"></canvas><div class="finale-content"><div class="eyebrow">FIVE HEARTS. ONE DESTINATION.</div><div class="finale-heart">♡</div><h2>该相逢的人<br>会相逢</h2><p>一路的花开，是相逢的伏笔。</p><button id="continue-walk">带着心意，继续漫游 <span>↗</span></button></div></div>`;document.body.append(root);
  const button=document.getElementById('collect-heart'),ring=button.querySelector('.progress'),counter=document.querySelector('#heart-counter b'),message=document.getElementById('collected-message'),finale=document.getElementById('finale');
  let near=null,holding=null,count=0,shown=false,celebrating=false,finaleStart=0,lastTime=0,pointer=null;const length=Math.PI*64;ring.style.strokeDasharray=length;ring.style.strokeDashoffset=length;
  function cancel(){holding=null;pointer=null;ring.style.strokeDashoffset=length;button.classList.remove('holding');}
  button.addEventListener('pointerdown',e=>{if(!near||shown)return;e.preventDefault();button.setPointerCapture(e.pointerId);pointer=e.pointerId;holding={id:near.id,start:performance.now()};rewardSounds?.unlock();button.classList.add('holding')});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,e=>{if(e.pointerId===pointer)cancel()});
  button.addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat&&near){e.preventDefault();holding={id:near.id,start:performance.now()};rewardSounds?.unlock();button.classList.add('holding')}});button.addEventListener('keyup',cancel);
  window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);
  const sky=document.getElementById('petal-sky'),ctx=sky.getContext('2d');let sw=0,sh=0;const sparks=Array.from({length:150},(_,i)=>({x:Math.random(),y:Math.random(),size:1+Math.random()*4,phase:Math.random()*6.28,speed:.05+Math.random()*.13,color:i%3?'#e8c588':'#eeb0b7'}));
  function resize(){sw=innerWidth;sh=innerHeight;sky.width=sw*Math.min(devicePixelRatio,1.5);sky.height=sh*Math.min(devicePixelRatio,1.5);ctx.setTransform(sky.width/sw,0,0,sky.height/sh,0,0)}window.addEventListener('resize',resize);
  function finish(){if(shown)return;shown=true;celebrating=true;finale.hidden=false;finaleStart=performance.now();resize();document.getElementById('continue-walk').focus();document.body.classList.add('celebrating');}
  document.getElementById('continue-walk').onclick=()=>{celebrating=false;finale.hidden=true;document.body.classList.remove('celebrating')};
  function celebrate(now){const t=(now-finaleStart)/1000;ctx.clearRect(0,0,sw,sh);ctx.globalCompositeOperation='lighter';
    for(const s of sparks){const orbit=t*.28+s.phase;const spread=Math.min(1,t*.6);const x=sw*.5+Math.cos(orbit)*(s.x*sw*.52)*spread,y=sh*.48+Math.sin(orbit*.7)*(s.y*sh*.7)*spread;ctx.globalAlpha=.2+.65*(.5+.5*Math.sin(t+s.phase));ctx.fillStyle=s.color;ctx.shadowColor=s.color;ctx.shadowBlur=s.size*3;ctx.save();ctx.translate(x,y);ctx.rotate(orbit);ctx.beginPath();ctx.ellipse(0,0,s.size*(s.size>3?2:1),s.size*.65,0,0,6.28);ctx.fill();ctx.restore();}
    ctx.shadowBlur=5;ctx.strokeStyle='#efd8a4';const scale=Math.min(sw*.025,sh*.032),cy=sh*.43;for(let j=0;j<3;j++){ctx.globalAlpha=.14*(1-Math.min(.6,t/20));ctx.lineWidth=.6;ctx.beginPath();for(let k=0;k<=200;k++){const a=k/200*Math.PI*2;const x=16*Math.sin(a)**3,y=13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a);const xx=sw/2+x*(scale+j*3),yy=cy-y*(scale+j*3);k?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}ctx.stroke()}ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';}
  function update(now,active){lastTime=now;const p=getPlayer();hearts.update(now/1000,p);if(celebrating)celebrate(now);if(!active||celebrating){button.hidden=true;cancel();return;}
    near=hearts.items.filter(h=>!h.collected&&Math.abs(p.y-h.floorY)<.7&&Math.hypot(p.x-h.footPosition.x,p.z-h.footPosition.z)<1.6).sort((a,b)=>Math.hypot(p.x-a.footPosition.x,p.z-a.footPosition.z)-Math.hypot(p.x-b.footPosition.x,p.z-b.footPosition.z))[0]||null;
    button.hidden=!near;if(holding&&(!near||holding.id!==near.id))cancel();
    if (!holding) return;
    const progress = Math.min(1, (now - holding.start) / 2000);
    ring.style.strokeDashoffset = length * (1 - progress);
    if (progress < 1) return;
    const { id } = holding;
    cancel();
    if (!hearts.collect(id)) return;
    count++;
    const complete = count === hearts.items.length;
    onCollect?.(id, complete);
    rewardSounds?.play('heart');
    counter.textContent = count;
    message.classList.add('show');
    setTimeout(() => message.classList.remove('show'), 1600);
    button.hidden = true;
    if (navigator.vibrate) navigator.vibrate([30, 25, 60]);
    if (complete) setTimeout(finish, 850);
  }
  function restore(ids) {
    for (const id of ids) hearts.collect(id, true);
    count = hearts.items.filter(heart => heart.collected).length;
    counter.textContent = count;
    shown = count === hearts.items.length;
  }
  function completeForTesting() {
    cancel();
    for (const heart of hearts.items) hearts.collect(heart.id);
    count = hearts.items.length;
    counter.textContent = count;
    shown = true;
    button.hidden = true;
  }
  return {update,restore,completeForTesting,get count(){return count},get holding(){return !!holding},get celebrating(){return celebrating},get complete(){return shown&&!celebrating}};
}
