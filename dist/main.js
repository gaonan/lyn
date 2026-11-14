import * as THREE from './vendor/three.module.min.js';
import { buildArchitecture } from './architecture.js?v=20261113-r33';
import { buildBotanicals } from './botanicals.js?v=20261113-r33';
import { createHearts } from './hearts.js?v=20261113-r33';
import { buildPhotographicPerformer } from './performer-photo.js?v=20261113-r33';
import { PERFORMER_VIEWS } from './performer-views.js?v=20261113-r33';
import { setupMusic } from './music.js?v=20261113-r33';
import { setupCollection } from './collection.js?v=20261113-r33';
import { spawnPlayer, stepPlayer } from './navigation.js?v=20261113-r33';
import { prepareOffline } from './offline.js?v=20261113-r33';
import { buildMagazines } from './magazines.js?v=20261113-r33';
import { setupMagazineQuest } from './magazine-quest.js?v=20261113-r33';
import { DAIMI_VIEWS } from './daimi-views.js?v=20261113-r33';
import { buildRolePortraits } from './roles.js?v=20261113-r33';
import { buildRecord } from './record.js?v=20261113-r33';
import { createRewardSounds } from './reward-sounds.js?v=20261113-r33';
import { createArtworkQueue } from './artwork.js?v=20261113-r33';
import { createAtriumLighting } from './atrium-light.js?v=20261113-r33';
import { setupGroupPhoto } from './group-photo.js?v=20261113-r33';
import { setupKeepsake } from './keepsake.js?v=20261113-r33';
const VERSION = '20261113-r33';
const $=s=>document.querySelector(s), canvas=$('#world');
const loading = window.bloomLoading;
const mobile = matchMedia('(any-pointer: coarse)').matches;
const renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,powerPreference:'high-performance'});
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  if (window.bloomReady) $('#error').hidden = false;
  else loading.fail('画面初始化中断，请重新加载。');
});
const qualityLevels = [
  { label: '超清', maxPixelRatio: 3 },
  { label: '清晰', maxPixelRatio: 2 },
  { label: '普通', maxPixelRatio: 1.4 },
];
const qualityButton = $('#quality');
let qualityIndex = mobile ? 1 : 0;
let renderWidth = 0, renderHeight = 0;
function resizeRenderer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return false;
  const { maxPixelRatio } = qualityLevels[qualityIndex];
  const pixelRatio = Math.min(devicePixelRatio, maxPixelRatio);
  if (width === renderWidth && height === renderHeight && pixelRatio === renderer.getPixelRatio()) return false;
  renderWidth = width;
  renderHeight = height;
  if (pixelRatio !== renderer.getPixelRatio()) renderer.setPixelRatio(pixelRatio);
  // Let CSS size the canvas, including while a mobile browser rotates.
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  return true;
}
function updateQualityLabel() {
  const { label } = qualityLevels[qualityIndex];
  qualityButton.querySelector('span').textContent = label;
  qualityButton.setAttribute('aria-label', `画质：${label}，点击切换`);
}
updateQualityLabel();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const lighting = createAtriumLighting(THREE, renderer, scene);
lighting.setShadows(qualityIndex === 0);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .07, 65);
camera.rotation.order = 'YXZ';
const world=buildArchitecture(THREE,scene);const flowers=buildBotanicals(THREE,scene,world.railPaths);
camera.position.set(5.1,5.6,7.5);camera.lookAt(-1.1,2.7,-2.8);
resizeRenderer();
renderer.render(scene,camera);
loading.update(10);
function onViewportResize() {
  if (resizeRenderer()) renderer.render(scene, camera);
}
window.addEventListener('resize', onViewportResize);
const lightButton = $('#light');
function alignViewStick() {
  const { left, width } = lightButton.getBoundingClientRect();
  const center = Math.max(innerWidth * .70, Math.min(innerWidth * .78, left + width / 2));
  document.body.style.setProperty('--look-right-center', `${innerWidth - center}px`);
}
window.addEventListener('resize', alignViewStick);
window.visualViewport?.addEventListener('resize', alignViewStick);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(alignViewStick).observe($('.tools'));
alignViewStick();
window.visualViewport?.addEventListener('resize', onViewportResize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onViewportResize).observe(canvas);
let offline = { controlled: false, reason: 'preparing' };
const loader = new THREE.TextureLoader();
const openingArtwork = createArtworkQueue(loader, ({ percent }) => {
  loading.update(10 + .89 * percent);
}, { concurrency: 5 });
const artwork = createArtworkQueue(loader, updateArtworkProgress);
const performer = buildPhotographicPerformer(THREE, scene, {
  views: PERFORMER_VIEWS, version: VERSION, nightTint: [.84, .87, .91], lowerBodyExtension: .299, loader: openingArtwork.loaderFor('performer'),
});
const music = setupMusic();
const magazines = buildMagazines(THREE, scene, VERSION, Math.random, openingArtwork.loaderFor('magazines'));
const dogSeat = world.stoolSeat.getCenter(new THREE.Vector3());
dogSeat.y = world.stoolSeat.max.y + .001;
dogSeat.z += .012;
performer.setNight(true);
const daimi = buildPhotographicPerformer(THREE, scene, {
  name: '呆米', reference: '呆米照片', position: dogSeat.toArray(),
  views: DAIMI_VIEWS, version: VERSION, height: .345, sway: false, fixedViewPlanes: true, loader: artwork.loaderFor('dog'),
});
const roles = buildRolePortraits(THREE, scene, VERSION, artwork.loaderFor('roles'));
const record = buildRecord(THREE, scene, VERSION, artwork.loaderFor('record'));
daimi.object.visible = false;
daimi.setNight(true);
const colliders=[...world.colliders,...flowers.colliders,performer.collider];
// A soft painted contact shadow grounds the flower banks without a costly shadow map.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sx=shadowCanvas.getContext('2d');const grad=sx.createRadialGradient(64,64,10,64,64,64);grad.addColorStop(0,'rgba(15,27,16,.36)');grad.addColorStop(1,'rgba(15,27,16,0)');sx.fillStyle=grad;sx.fillRect(0,0,128,128);const shadowMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
for(const c of flowers.colliders){if(c.minY>.1)continue;const m=new THREE.Mesh(new THREE.PlaneGeometry((c.maxX-c.minX)*1.65,(c.maxZ-c.minZ)*1.65),shadowMaterial);m.rotation.x=-Math.PI/2;m.position.set((c.minX+c.maxX)/2,.015,(c.minZ+c.maxZ)/2);scene.add(m)}
const performerShadow=new THREE.Mesh(new THREE.PlaneGeometry(.72,.48),shadowMaterial);performerShadow.rotation.x=-Math.PI/2;performerShadow.position.set(0,.018,-1.12);scene.add(performerShadow);
const daimiShadow = new THREE.Mesh(new THREE.PlaneGeometry(.255, .205), shadowMaterial);
daimiShadow.rotation.x = -Math.PI / 2;
daimiShadow.position.copy(dogSeat);
daimiShadow.position.y += .0005;
daimiShadow.visible = false;
scene.add(daimiShadow);
let entered=false,modelReady=false,p=spawnPlayer({x:0,y:0,z:6.8}),yaw=0,pitch=.08,eye=1.65,night=true;
const rewardSounds = createRewardSounds(VERSION);
const hearts=createHearts(THREE,scene);
const collection=setupCollection(hearts,()=>p,rewardSounds);
const openGroupPhoto = setupGroupPhoto($('#group-photo-dialog'), renderKeepsake, VERSION);
const openKeepsake = setupKeepsake($('#record-finale'), record, renderKeepsake, openGroupPhoto);
function renderKeepsake(ctx, x, y, width, height, guestPortrait) {
  const photoCamera = new THREE.PerspectiveCamera(52, width / height, .07, 65);
  photoCamera.position.set(.12, 1.51, 3.05);
  photoCamera.lookAt(guestPortrait ? -.40 : -.06, 1.18, -1.5);
  const props = [...hearts.items.map(heart => heart.object), daimi.object, daimiShadow];
  const visible = props.map(object => object.visible);
  props.forEach(object => { object.visible = false; });
  let guest, guestShadow;
  try {
    if (guestPortrait) {
      const height = 1.82;
      const texture = new THREE.CanvasTexture(guestPortrait);
      texture.colorSpace = THREE.SRGBColorSpace;
      guest = new THREE.Mesh(
        new THREE.PlaneGeometry(height * guestPortrait.width / guestPortrait.height, height),
        new THREE.MeshBasicMaterial({ map: texture, color: '#f2eeeb', transparent: true, alphaTest: .025, toneMapped: false }),
      );
      guest.position.set(-.78, height / 2 + .005, -.81);
      guest.rotation.y = Math.atan2(photoCamera.position.x - guest.position.x, photoCamera.position.z - guest.position.z);
      guestShadow = new THREE.Mesh(new THREE.PlaneGeometry(.61, .39), shadowMaterial);
      guestShadow.rotation.x = -Math.PI / 2;
      guestShadow.position.set(guest.position.x, .019, guest.position.z);
      scene.add(guest, guestShadow);
    }
    lighting.setNight(true);
    performer.setNight(true);
    performer.update(performance.now() / 1000, photoCamera);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.render(scene, photoCamera);
    ctx.drawImage(canvas, x, y, width, height);
  } finally {
    if (guest) {
      scene.remove(guest, guestShadow);
      guest.geometry.dispose();
      guest.material.map.dispose();
      guest.material.dispose();
      guestShadow.geometry.dispose();
    }
    props.forEach((object, i) => { object.visible = visible[i]; });
    lighting.setNight(night);
    performer.setNight(night);
    performer.update(performance.now() / 1000, camera);
    renderWidth = 0;
    resizeRenderer();
    renderer.render(scene, camera);
  }
}
const magazineQuest = setupMagazineQuest(magazines, roles, dogSeat, record, () => p, {
  openKeepsake,
  dogPhoto: `${DAIMI_VIEWS.front.url}?v=${VERSION}`,
  artworkProgress: artwork.progress,
  unlock() {
    daimi.object.visible = true;
    daimi.ready.then(ready => { daimiShadow.visible = ready; });
  },
  pause: resetInput,
  goToStage() { setSpot(0); },
  heartsComplete() { return collection.complete; },
  rewardSounds,
  muteForCelebration: music.muteForCelebration,
  toast,
});
let introTime=0;
const keys = new Set();
let jumpRequested = false;
let look = null;
let last=performance.now(),frameCount=0,lastMetric=last,fps=0;
const destinations = [
  { x: 0, y: 0, z: 5.5, yaw: 0, pitch: .08 },
  { x: 7.28, y: 3.2, z: 4.83, yaw: .32, pitch: -.13 },
  { x: 7.60, y: 4.8, z: -5.76, yaw: Math.PI / 2, pitch: 0 },
  { x: -7.60, y: 7.2, z: .95, yaw: -Math.PI / 2, pitch: 0 },
];
function setSpot(index) {
  const { x, y, z, yaw: heading, pitch: tilt } = destinations[index];
  p = spawnPlayer({ x, y, z });
  yaw = heading;
  pitch = tilt;
  eye = y + 1.65;
  camera.position.set(x, eye, z);
  camera.rotation.set(pitch, yaw, 0);
  resetInput();
  updateLocation();
}
function updateLocation() {
  const label = p.y > 6.7 ? '四层 · 顶部书廊' : p.y > 4.2 ? '三层 · 花藤走廊' :
    p.y > 2.8 ? '夹层 · 窗边花园' : p.y > 1.8 ? '下层 · 书墙回廊' : '一层 · 花海舞台';
  $('#location-label').textContent = label;
  $('#map-floor').textContent = p.y > 1 ? `${p.y.toFixed(1)}m` : '1F';
  const activeSpot = p.y > 6.7 ? 3 : p.y > 4.2 ? 2 : p.y > 1.8 ? 1 : 0;
  document.querySelectorAll('[data-spot]').forEach(el => el.classList.toggle('active', Number(el.dataset.spot) === activeSpot));
}
let toastTimer;
function toast(t){clearTimeout(toastTimer);$('#toast').textContent=t;$('#toast').style.opacity=1;toastTimer=setTimeout(()=>$('#toast').style.opacity=0,2400)}
function enter() {
  if (entered || !modelReady) return;
  entered = true;
  rewardSounds.unlock();
  music.start();
  document.body.classList.add('entered');
  $('#hud').hidden = false;
  alignViewStick();
  setSpot(0);
  setTimeout(() => { $('#hint').style.opacity = 0; }, 9000);
}
$('#enter').onclick=enter;$('.brand').onclick=e=>{e.preventDefault();if(entered)setSpot(0)};
document.querySelectorAll('[data-spot]').forEach(b=>b.onclick=()=>setSpot(Number(b.dataset.spot)));
const testCorner = $('#test-corner');
let testTaps = 0, lastTestTap = 0;
document.addEventListener('pointerdown', event => {
  if (event.target !== testCorner) testTaps = 0;
}, true);
testCorner.addEventListener('click', () => {
  if (!canMove()) return;
  const now = performance.now();
  testTaps = now - lastTestTap <= 1050 ? testTaps + 1 : 1;
  lastTestTap = now;
  if (testTaps !== 10) return;
  testTaps = 0;
  collection.completeForTesting();
  magazineQuest.completeForTesting();
  toast(record.claimed ? '前置任务已完成' : '前置任务已完成 · 唱片在一楼背墙');
});

const dialog=$('#help-dialog');$('#help').onclick=()=>{resetInput();dialog.showModal()};$('.close').onclick=()=>dialog.close();$('.close-help').onclick=()=>{dialog.close();enter()};dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
lightButton.onclick = () => {
  night = !night;
  performer.setNight?.(night);
  daimi.setNight(night);
  lighting.setNight(night);
  lightButton.innerHTML = night ? '☾<span>夜色</span>' : '☀<span>日光</span>';
  lightButton.setAttribute('aria-label', night ? '切换日光' : '切换傍晚灯光');
  alignViewStick();
};
qualityButton.onclick = () => {
  qualityIndex = (qualityIndex + 1) % qualityLevels.length;
  lighting.setShadows(qualityIndex === 0);
  updateQualityLabel();
  resizeRenderer();
  toast(`已切换${qualityLevels[qualityIndex].label}画质`);
};
$('#map-toggle').onclick=()=>{$('#map-panel').hidden=!$('#map-panel').hidden};
function resetInput() {
  keys.clear();
  jumpRequested = false;
  moveStick.reset();
  viewStick.reset();
  look = null;
}
window.addEventListener('blur',resetInput);document.addEventListener('visibilitychange',resetInput);
const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
function canMove() {
  return entered && !document.querySelector('dialog[open]') && !collection.celebrating;
}
window.addEventListener('keydown', event => {
  if (event.defaultPrevented || !canMove() || event.target.closest?.('input,textarea,[contenteditable]')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) jumpRequested = true;
  } else if (movementKeys.includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
});
window.addEventListener('keyup', event => keys.delete(event.code));
canvas.addEventListener('pointerdown',e=>{if(!entered||dialog.open||magazineQuest.open||collection.celebrating||look||viewStick.active)return;canvas.setPointerCapture(e.pointerId);look={id:e.pointerId,x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointermove', e => {
  if (!look || look.id !== e.pointerId) return;
  if (!viewStick.active) {
    const sensitivity = e.pointerType === 'touch' ? .0043 : .0032;
    yaw -= (e.clientX - look.x) * sensitivity;
    pitch = Math.max(-1.15, Math.min(1.15, pitch - (e.clientY - look.y) * sensitivity));
  }
  look.x = e.clientX;
  look.y = e.clientY;
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(look?.id===e.pointerId)look=null});
function bindStick(pad, cap) {
  let pointer = null;
  let centerX = 0, centerY = 0, travel = 1;
  const input = { x: 0, y: 0, get active() { return pointer !== null; }, reset };
  function update(event) {
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const scale = Math.max(travel, Math.hypot(dx, dy));
    input.x = dx / scale;
    input.y = dy / scale;
    cap.style.transform = `translate(${input.x * travel}px,${input.y * travel}px)`;
  }
  function reset() {
    const id = pointer;
    pointer = null;
    input.x = input.y = 0;
    cap.style.transform = '';
    if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  }
  pad.addEventListener('pointerdown', event => {
    if (pointer !== null || !entered || dialog.open || magazineQuest.open || collection.celebrating || event.button !== 0) return;
    event.preventDefault();
    const rect = pad.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    travel = (rect.width - cap.offsetWidth) / 2 - 3;
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    update(event);
  });
  pad.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) update(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(type, event => {
      if (event.pointerId === pointer) reset();
    });
  }
  return input;
}

const moveStick = bindStick($('#joystick'), $('#stick'));
const viewStick = bindStick($('#look-joystick'), $('#look-stick'));
function viewSpeed(axis) {
  const deadZone = .10;
  const magnitude = Math.max(0, (Math.abs(axis) - deadZone) / (1 - deadZone));
  return Math.sign(axis) * magnitude ** 1.7;
}
function drawMap(){if($('#map-panel').hidden)return;const ctx=$('#map').getContext('2d');ctx.clearRect(0,0,240,220);const tx=x=>20+(x+9)*11.1,tz=z=>12+(z+7)*11.6;ctx.fillStyle='#cbd2bc';ctx.fillRect(tx(-9),tz(-7),200,186);
 for(const s of world.surfaces){ctx.fillStyle=s.y===undefined?'#9aa88b':s.y>4?'#c4c9b4':s.y>0?'#d5cfb5':'#eaf0dd';ctx.fillRect(tx(s.minX),tz(s.minZ),(s.maxX-s.minX)*11.1,(s.maxZ-s.minZ)*11.6);if(s.y===undefined){ctx.strokeStyle='#6e8262';for(let j=0;j<=12;j++){const t=j/12;ctx.beginPath();if(s.xStart!==undefined){const x=s.minX+(s.maxX-s.minX)*t;ctx.moveTo(tx(x),tz(s.minZ));ctx.lineTo(tx(x),tz(s.maxZ));}else{const z=s.minZ+(s.maxZ-s.minZ)*t;ctx.moveTo(tx(s.minX),tz(z));ctx.lineTo(tx(s.maxX),tz(z));}ctx.stroke()}}}
 ctx.fillStyle='#b88388';for(const c of flowers.colliders){if(c.minY>.1)continue;ctx.beginPath();ctx.ellipse(tx((c.minX+c.maxX)/2),tz((c.minZ+c.maxZ)/2),(c.maxX-c.minX)*5.5,(c.maxZ-c.minZ)*5.5,0,0,Math.PI*2);ctx.fill()}drawMagazineMarkers(ctx, tx, tz);
 ctx.fillStyle='#687f5d';ctx.font='10px sans-serif';ctx.fillText('楼梯',23,132);ctx.fillText('夹层',194,160);ctx.save();ctx.translate(tx(p.x),tz(p.z));ctx.rotate(-yaw);ctx.fillStyle='#254e3b';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,6);ctx.lineTo(0,3);ctx.lineTo(-6,6);ctx.closePath();ctx.fill();ctx.restore()}
const mapMagazineCounts = [$('#map-ground-magazines'), $('#map-walk-magazines')];
function drawMagazineMarkers(ctx, tx, tz) {
  const remaining = [0, 0];
  for (const magazine of magazines.items) {
    if (magazine.lit) continue;
    const level = magazine.floorY === 0 ? 0 : 1;
    remaining[level]++;
    const x = tx(magazine.x), z = tz(magazine.z) + level * 13;
    ctx.fillStyle = level === 0 ? '#835b1b' : '#674583';
    ctx.strokeStyle = '#fdf8e7';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, z - 5);
    ctx.lineTo(x + 5, z);
    ctx.lineTo(x, z + 5);
    ctx.lineTo(x - 5, z);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  for (const [level, count] of remaining.entries()) {
    const label = mapMagazineCounts[level];
    if (label.textContent !== String(count)) label.textContent = count;
  }
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.035);last=now;if(document.hidden)return;
 if (canMove()) {
  yaw -= viewSpeed(viewStick.x) * 1.55 * dt;
  pitch = Math.max(-1.15, Math.min(1.15, pitch - viewSpeed(viewStick.y) * 1.05 * dt));
  let x = moveStick.x + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  let z = moveStick.y + Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const magnitude = Math.hypot(x, z);
  if (magnitude < .04) x = z = 0;
  else if (magnitude > 1) { x /= magnitude; z /= magnitude; }
  const previous = p;
  p = stepPlayer(p, x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw),
    dt, jumpRequested, world.surfaces, colliders);
  jumpRequested = false;
  if (p !== previous && (p.grounded || previous.grounded)) updateLocation();
  eye += (p.y + 1.65 - eye) * Math.min(1, dt * (p.grounded ? 15 : 23));
  camera.position.set(p.x, eye, p.z);
  camera.rotation.set(pitch, yaw, 0);
  drawMap();
 }
 else if(!entered){introTime+=dt;camera.position.set(5.1+Math.sin(introTime*.06)*.22,5.6,7.5);camera.lookAt(-1.1,2.7,-2.8)}
 const active=entered&&p.grounded&&!document.querySelector('#help-dialog[open], #music-dialog[open]');
 const magazineEngaged=magazineQuest.update(now,active&&!collection.celebrating);
 performer.update(now/1000,camera);
 if(daimi.object.visible)daimi.update(now/1000,camera);
 collection.update(now,active&&!magazineEngaged);
 renderer.render(scene,camera);frameCount++;if(now-lastMetric>1000){fps=Math.round(frameCount*1000/(now-lastMetric));frameCount=0;lastMetric=now;}}
// Small, read-only diagnostics to help validate mobile rendering and scene size.
const artworkPanels = [
  ['#intro-artwork', ''], ['#hud-artwork', ''],
  ['#dog-artwork', 'dog'], ['#role-artwork', 'roles'], ['#record-artwork', 'record'],
].map(([selector, group]) => ({ panel: $(selector), group }));
function updateArtworkProgress(overall) {
  for (const { panel, group } of artworkPanels) {
    const { percent, failed } = group ? artwork.progress(group) : overall;
    panel.hidden = percent === 100;
    panel.querySelector('progress').value = percent;
    const name = { dog: '呆米素材', roles: '影视角色素材', record: '唱片素材' }[group] ?? '花房素材';
    panel.querySelector('span').textContent = failed
      ? `${name}有部分加载失败 · ${percent}%`
      : `${name}继续加载中 · ${percent}%`;
  }
}

window.bloomDebug={build:VERSION,get offline(){return offline},artworkProgress:artwork.progress,get position(){return {...p,yaw,pitch}},get collected(){return collection.count},get hearts(){return hearts.items.map(h=>({id:h.id,footPosition:h.footPosition,collected:h.collected}))},get renderer(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps}},surfaces:world.surfaces,flowerCounts:flowers.counts,performer:performer.object.userData,
  get magazines() { return magazines.items.map(({ id, x, y, z, floorY, lit }) => ({ id, x, y, z, floorY, lit })); },
  get daimi() { return { visible: daimi.object.visible, position: dogSeat.toArray(), height: daimi.object.userData.height,
    view: daimi.object.userData.currentView, barkPlays: magazineQuest.barkPlays }; },
  get roles() { return magazineQuest.roleUnlocked ? roles.entries.map(({ id, x, y, z, floorY, received }) => ({ id, x, y, z, floorY, received })) : []; },
  get record() { return { unlocked: record.unlocked, claimed: record.claimed }; },
};
requestAnimationFrame(frame);
openingArtwork.start();
prepareOffline().then(result => { offline = result; });
function checkOpeningArtwork(ready) {
  if (!ready) loading.fail('人物或杂志尚未加载完整，请重新加载。');
  return ready;
}
Promise.all([performer.ready.then(checkOpeningArtwork), magazines.ready.then(checkOpeningArtwork)]).then(([performerReady, magazinesReady]) => {
  if (!performerReady || !magazinesReady) return;
  performer.update(performance.now() / 1000, camera);
  renderer.render(scene, camera);
  window.bloomReady = modelReady = loading.finish();
  if (!modelReady) return;
  updateArtworkProgress(artwork.progress());
  setTimeout(() => artwork.start(), 100);
});


