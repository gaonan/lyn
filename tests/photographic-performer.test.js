import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { buildPhotographicPerformer, photographicViewIndex, photographicFrame } from '../dist/performer-photo.js';
import { PERFORMER_VIEWS } from '../dist/performer-views.js';
import { DAIMI_VIEWS } from '../dist/daimi-views.js';

const near = (a, b, message, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} != ${b}`);
const radians = degrees => degrees * Math.PI / 180;
function controlledLoader(views = PERFORMER_VIEWS) {
  const requests = [];
  return { requests, load(url, loaded, _progress, failed) {
    const { width, height } = Object.values(views).find(view => url.split('?')[0] === view.url);
    const texture = new THREE.Texture({ width, height });
    requests.push({ url, loaded, failed, texture });
    return texture;
  } };
}
async function fixture(extra = {}) {
  const scene = new THREE.Scene(), loader = controlledLoader(extra.views);
  const performer = buildPhotographicPerformer(THREE, scene, { loader, views: PERFORMER_VIEWS, sway: false, ...extra });
  for (const r of loader.requests) r.loaded(r.texture);
  assert.equal(await performer.ready, true);
  const mesh = performer.object.getObjectByName('Photographic performer surface'), camera = new THREE.PerspectiveCamera();
  const look = (degrees, time) => { camera.position.set(Math.sin(radians(degrees)) * 2, 1.7, -1 + Math.cos(radians(degrees)) * 2); performer.update(time, camera); scene.updateMatrixWorld(true); };
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.basic.fragmentShader }; mesh.material.onBeforeCompile(shader);
  return { scene, loader, performer, mesh, camera, look, shader };
}

test('camera quadrants and wraparound choose front/right/back/left with a stable boundary band', () => {
  assert.deepEqual([0, 90, 180, -90, -180, 359].map(degrees => photographicViewIndex(radians(degrees))), [0, 1, 2, 3, 2, 0]);
  assert.equal(photographicViewIndex(radians(50), 0), 0);
  assert.equal(photographicViewIndex(radians(53), 0), 1);
  assert.equal(photographicViewIndex(radians(40), 1), 1);
  assert.equal(photographicViewIndex(radians(37), 1), 0);
  assert.equal(photographicViewIndex(radians(-179), 2), 2);
});

test('ready waits for all four decoded photos and versioned URLs, not just the first view', async () => {
  const loader = controlledLoader(), progress = [];
  const performer = buildPhotographicPerformer(THREE, new THREE.Scene(), { loader, views: PERFORMER_VIEWS, version: '20261113-r3', onProgress: p => progress.push(p) });
  assert.equal(loader.requests.length, 4);
  assert.ok(loader.requests.every(r => r.url.endsWith('?v=20261113-r3')));
  let resolved = false; performer.ready.then(() => { resolved = true; });
  for (const r of loader.requests.slice(0, 3)) r.loaded(r.texture);
  await Promise.resolve(); assert.equal(resolved, false);
  assert.equal(performer.object.getObjectByName('Photographic performer surface'), undefined);
  const last = loader.requests[3]; last.loaded(last.texture);
  assert.equal(await performer.ready, true); assert.equal(performer.object.userData.loadedViews, 4);
  assert.deepEqual(progress, [.25, .5, .75, 1]);
});

test('the front photo can open the garden while side and rear angles load independently', async t => {
  t.mock.method(console, 'warn', () => {});
  const loader = controlledLoader(), deferredLoader = controlledLoader();
  const performer = buildPhotographicPerformer(THREE, new THREE.Scene(), { loader, deferredLoader, views: PERFORMER_VIEWS });
  assert.equal(loader.requests.length, 1);
  assert.equal(deferredLoader.requests.length, 3);
  const [front] = loader.requests;
  front.loaded(front.texture);
  assert.equal(await performer.ready, true);
  const state = performer.object.userData;
  assert.equal(state.textureStatus, 'partial');
  const geometry = performer.object.getObjectByName('Photographic performer surface').geometry;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(2, 1.7, -1);
  performer.update(0, camera);
  assert.equal(state.currentView, 'front');
  const [right, back] = deferredLoader.requests;
  back.failed(new Error('404'));
  right.loaded(right.texture);
  performer.update(1, camera);
  assert.equal(state.currentView, 'right');
  assert.equal(state.loadedViews, 2);
  assert.equal(performer.object.getObjectByName('Photographic performer surface').geometry, geometry);
});

test('actual crop aspect ratios and asymmetric foot anchors stay correct in every view', async () => {
  const f = await fixture();
  near(f.performer.object.userData.frames.front.displayWidth, 1.92 * 538 / 1519, 'front source ratio');
  near(f.performer.object.userData.frames.right.displayWidth, 1.92 * 598 / 1514, 'right source ratio');
  let t = 0;
  for (const [name, angle] of [['front', 0], ['right', 90], ['back', 180], ['left', -90]]) {
    f.look(angle, t); f.look(angle, t + .3); t += 1;
    const frame = f.performer.object.userData.frames[name], fit = f.shader.uniforms.photoFromFit.value;
    const planeUAtFoot = (frame.anchorX - fit.y) / fit.x;
    near(f.performer.object.userData.commonLeft + planeUAtFoot * f.performer.object.userData.commonWidth, 0, `${name} foot x`);
    assert.equal(f.performer.object.userData.currentView, name);
    near(f.shader.uniforms.photoFromRect.value.y, 1 - frame.uv.y - frame.uv.height, `${name} top-left crop conversion`);
  }
});

test('Daimi stays on four fixed views with the whole silhouette inside the stool footprint', async () => {
  const f = await fixture({ views: DAIMI_VIEWS, height: .345, fixedViewPlanes: true });
  const facing = f.mesh.parent;
  for (const [angle, orientation, name] of [[30, 0, 'front'], [58, 90, 'right'],
    [123, 90, 'right'], [157, 180, 'back'], [241, 270, 'left'], [301, 270, 'left']]) {
    f.look(angle, angle);
    near(facing.rotation.y, radians(orientation), name);
    assert.equal(f.performer.object.userData.currentView, name);
    assert.equal(f.performer.object.userData.blend, 0);
    const frame = f.performer.object.userData.frames[name];
    for (const edge of [frame.left, frame.right]) {
      assert.ok(Math.abs(edge * Math.cos(facing.rotation.y)) < .365 / 2 - .008);
      assert.ok(Math.abs(.012 - edge * Math.sin(facing.rotation.y)) < .34 / 2 - .008);
    }
    near(f.mesh.geometry.boundingBox.min.y, 0, 'bottom edge remains on the seat');
  }
});

test('lengthens the singer below the waist by 10 cm with grounded feet and original upper body proportions', async () => {
  const f = await fixture({ lowerBodyExtension: .1 });
  const position = f.mesh.geometry.getAttribute('position');
  const uv = f.mesh.geometry.getAttribute('uv');
  near(position.getY(4), 0, 'feet');
  near(uv.getY(2), .58, 'waist uses the original photo row');
  near(position.getY(2), 1.92 * .58 + .1, 'raised waist');
  near(position.getY(0) - position.getY(2), 1.92 * .42, 'unchanged upper body height');
  near(position.getY(0), 2.02, 'new total height');
  near(f.performer.object.userData.frames.front.displayWidth, 1.92 * 538 / 1519, 'unchanged width');
});

test('cylindrical billboard follows horizontal camera direction and the breathing motion keeps feet at zero', async () => {
  const f = await fixture({ sway: true });
  for (const [angle, time] of [[0, 0], [90, .8], [180, 2], [-90, 3.7]]) {
    f.look(angle, time);
    const facing = f.performer.object.getObjectByName('Camera-facing photo');
    near(Math.sin(facing.rotation.y), Math.sin(radians(angle)), 'horizontal facing');
    near(Math.cos(facing.rotation.y), Math.cos(radians(angle)), 'horizontal facing');
    near(new THREE.Box3().setFromObject(f.performer.object).min.y, 0, 'foot floor');
    near(facing.rotation.x, 0, 'no camera-height tilt');
  }
});

test('one material crossfades views without duplicate planes and reverses smoothly', async () => {
  const f = await fixture({ fadeSeconds: .2 }); f.look(0, 0); f.look(90, 1); f.look(90, 1.1);
  near(f.shader.uniforms.photoBlend.value, .5, 'halfway blend');
  const fromBefore = f.shader.uniforms.photoFromMap.value, toBefore = f.shader.uniforms.photoToMap.value;
  f.look(0, 1.1);
  assert.equal(f.shader.uniforms.photoFromMap.value, toBefore); assert.equal(f.shader.uniforms.photoToMap.value, fromBefore);
  near(f.shader.uniforms.photoBlend.value, .5, 'reverse preserves current appearance');
  f.look(0, 1.21); assert.equal(f.performer.object.userData.currentView, 'front');
  let count = 0; f.performer.object.traverse(o => { if (o.isMesh) count++; }); assert.equal(count, 1);
  assert.equal(f.shader.fragmentShader.includes('#include <map_fragment>'), false);
  assert.match(f.shader.fragmentShader, /c\.rgb \* c\.a/);
});

test('day mode keeps untone-mapped photo color, night applies a mild linear tint, and edges/depth are configured', async () => {
  const f = await fixture(); const m = f.mesh.material;
  assert.equal(m.isMeshBasicMaterial, true); assert.equal(m.toneMapped, false); assert.equal(m.transparent, true);
  assert.equal(m.depthTest, true); assert.equal(m.depthWrite, true); assert.equal(m.premultipliedAlpha, true); assert.ok(m.alphaTest > 0);
  assert.deepEqual(m.color.toArray(), [1, 1, 1]);
  f.performer.setNight(true); assert.deepEqual(m.color.toArray(), [.68, .72, .78]);
  f.performer.setNight(false); assert.deepEqual(m.color.toArray(), [1, 1, 1]);
  for (const r of f.loader.requests) { assert.equal(r.texture.colorSpace, THREE.SRGBColorSpace); assert.equal(r.texture.premultiplyAlpha, false); assert.equal(r.texture.magFilter, THREE.NearestFilter); }
});

test('a missing view fails readiness once and disposes photos arriving after failure', async t => {
  t.mock.method(console, 'error', () => {});
  const loader = controlledLoader(), errors = []; let disposed = 0;
  const performer = buildPhotographicPerformer(THREE, new THREE.Scene(), { loader, onError: e => errors.push(e) });
  for (const r of loader.requests) r.texture.addEventListener('dispose', () => { disposed++; });
  loader.requests[0].loaded(loader.requests[0].texture);
  loader.requests[1].failed(new Error('404'));
  loader.requests[2].loaded(loader.requests[2].texture); loader.requests[3].loaded(loader.requests[3].texture);
  assert.equal(await performer.ready, false); assert.equal(errors.length, 1); assert.equal(disposed, 4);
  assert.equal(performer.object.userData.textureStatus, 'error'); assert.match(performer.object.userData.error, /right.*404/);
  assert.equal(performer.object.getObjectByName('Photographic performer surface'), undefined);
});

test('undecoded images and invalid crop metadata fail instead of stretching a substitute image', async t => {
  t.mock.method(console, 'error', () => {});
  assert.throws(() => photographicFrame(1024, 1536, { uv: { x: .8, width: .5 } }), /crop/);
  assert.throws(() => photographicFrame(1024, 1536, { width: 512 }), /dimensions/);
  const loader = controlledLoader(), performer = buildPhotographicPerformer(THREE, new THREE.Scene(), { loader });
  loader.requests[0].texture.image = { width: 0, height: 1536 }; loader.requests[0].loaded(loader.requests[0].texture);
  assert.equal(await performer.ready, false); assert.equal(performer.object.userData.textureStatus, 'error');
});
