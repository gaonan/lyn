import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { buildImportedPerformer } from '../dist/performer-gltf.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../dist/vendor/meshopt_decoder.module.js';

// Keep real Three scene graphs, mesh bounds, materials and transformations.
// Replace only the network/GLB parser boundary with a known parsed asset.
function asset({zUp=false,authored=false}={}) {
  const scene=new THREE.Group();scene.name='Authored glTF scene';
  const texture=new THREE.DataTexture(new Uint8Array(16).fill(190),2,2);
  texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.71,metalness:.08});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,zUp?1:6,zUp?6:1),material);
  // Deliberately offset the asset's geometry from its origin. This catches the
  // previous normalization bug: turning this mesh after centering moved it away.
  mesh.position.set(4,zUp?0:3,zUp?3:-2);scene.add(mesh);
  if(authored){scene.position.set(-3,5,1);scene.rotation.set(.10,.32,-.04);scene.scale.set(1.1,.9,1.2);}
  scene.updateMatrix();
  return {scene,mesh,texture,localMatrix:scene.matrix.clone()};
}
function fakeLoader(gltf) {
  return {load(_url,onLoad){queueMicrotask(()=>onLoad(gltf));}};
}
function close(actual,expected,label,tolerance=1e-7) {
  assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual}, expected ${expected}`);
}
function normalizedBounds(scene,performer) {
  scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(performer.object);
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  close(center.x,0,'horizontal centre');close(center.z,-1,'stage position');
  close(bounds.min.y,0,'boot contact with floor');close(size.y,1.92,'full figure height');
  return bounds;
}

test('the real GLTFLoader receives the local meshopt decoder before loading',async()=>{
  const gltf=asset(),loader=new GLTFLoader();let decoderAtLoad;
  loader.load=function(_url,onLoad){decoderAtLoad=this.meshoptDecoder;queueMicrotask(()=>onLoad(gltf));};
  const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader});
  assert.equal(await performer.ready,true);assert.equal(decoderAtLoad,MeshoptDecoder);
  await MeshoptDecoder.ready;assert.equal(MeshoptDecoder.supported,true);
});

test('offset imported mesh stays centred and grounded after a 0 or 180 degree turn',async()=>{
  for(const rotationY of [0,Math.PI]){
    const gltf=asset(),scene=new THREE.Scene();
    const performer=buildImportedPerformer(THREE,scene,{loader:fakeLoader(gltf),rotationY});
    assert.equal(await performer.ready,true);normalizedBounds(scene,performer);
  }
});

test('normalization preserves authored glTF transforms at both viewing orientations',async()=>{
  for(const rotationY of [0,Math.PI]){
    const gltf=asset({authored:true}),scene=new THREE.Scene();
    const performer=buildImportedPerformer(THREE,scene,{loader:fakeLoader(gltf),rotationY});
    assert.equal(await performer.ready,true);normalizedBounds(scene,performer);
    gltf.scene.updateMatrix();
    gltf.scene.matrix.elements.forEach((value,index)=>close(value,gltf.localMatrix.elements[index],'authored local transform'));
  }
});

test('explicit Z-up correction happens before height and ground normalization',async()=>{
  const gltf=asset({zUp:true}),scene=new THREE.Scene();
  const performer=buildImportedPerformer(THREE,scene,{loader:fakeLoader(gltf),upAxis:'Z',rotationY:Math.PI});
  assert.equal(await performer.ready,true);
  const bounds=normalizedBounds(scene,performer),size=bounds.getSize(new THREE.Vector3());
  close(size.x,.64,'width after Z-up correction');close(size.z,.32,'depth after Z-up correction');
});

test('ready waits for the asset and preserves its actual texture, UV and material settings',async()=>{
  const gltf=asset(),scene=new THREE.Scene();let finish;
  const performer=buildImportedPerformer(THREE,scene,{loader:{load(_url,onLoad){finish=onLoad;}}});
  assert.equal(performer.object.userData.textureStatus,'loading');
  assert.equal(performer.object.getObjectByName('Authored glTF scene'),undefined);
  finish(gltf);assert.equal(await performer.ready,true);
  assert.equal(performer.object.userData.textureStatus,'loaded');
  assert.equal(performer.object.getObjectByName('Authored glTF scene'),gltf.scene);
  assert.equal(gltf.mesh.material.map,gltf.texture);
  assert.equal(gltf.texture.colorSpace,THREE.SRGBColorSpace);assert.equal(gltf.texture.flipY,false);
  close(gltf.mesh.material.roughness,.71,'source roughness');close(gltf.mesh.material.metalness,.08,'source metalness');
  assert.equal(gltf.mesh.geometry.getAttribute('uv').count,gltf.mesh.geometry.getAttribute('position').count);
  assert.deepEqual(performer.object.userData.textures,[[2,2]]);
});

test('a failed asset request resolves false instead of enabling a supposedly loaded portrait',async t=>{
  t.mock.method(console,'error',()=>{});
  const loader={load(_url,_onLoad,_onProgress,onError){queueMicrotask(()=>onError(new Error('fixture: request failed')));}};
  const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader});
  assert.equal(await performer.ready,false);assert.equal(performer.object.userData.textureStatus,'error');
  assert.equal(performer.object.getObjectByName('Reconstructed performer'),undefined);
});

test('an empty glTF scene is rejected before dividing by its height',async t=>{
  t.mock.method(console,'error',()=>{});
  const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader:fakeLoader({scene:new THREE.Group()})});
  assert.equal(await performer.ready,false);assert.equal(performer.object.userData.textureStatus,'error');
});

test('missing or undecoded base-color images fail without placing a bare model in the scene',async t=>{
  t.mock.method(console,'error',()=>{});
  for(const image of [null,undefined,{width:0,height:2},{width:2,height:0},{width:NaN,height:2}]){
    const gltf=asset(),errors=[];
    if(image===null)gltf.mesh.material.map=null;else gltf.texture.image=image;
    const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader:fakeLoader(gltf),onError:error=>errors.push(error)});
    assert.equal(await performer.ready,false);assert.equal(performer.object.userData.textureStatus,'error');
    assert.match(performer.object.userData.error,/base-color texture/);
    assert.equal(performer.object.getObjectByName('Reconstructed performer'),undefined);
    assert.equal(errors.length,1);assert.ok(errors[0] instanceof Error);
  }
});

test('a decoded texture without the referenced UV channel is not reported as ready',async t=>{
  t.mock.method(console,'error',()=>{});
  for(const channel of [0,1]){
    const gltf=asset();gltf.texture.channel=channel;
    if(channel===0)gltf.mesh.geometry.deleteAttribute('uv');
    const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader:fakeLoader(gltf)});
    assert.equal(await performer.ready,false);assert.match(performer.object.userData.error,/UV|uv/);
  }
});

test('progress distinguishes unknown download size from completion and reports decoded readiness last',async()=>{
  const gltf=asset(),events=[];let onLoad,onProgress;
  const loader={load(_url,loaded,progress){onLoad=loaded;onProgress=progress;}};
  const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader,onProgress:fraction=>events.push(fraction)});
  onProgress({loaded:50,total:0});onProgress({loaded:50,total:100});
  assert.deepEqual(events,[null,.5]);assert.equal(performer.object.userData.textureStatus,'loading');
  onLoad(gltf);assert.equal(await performer.ready,true);
  assert.deepEqual(events,[null,.5,1]);assert.equal(performer.object.userData.progress,1);
});

test('a synchronous loader failure also resolves false and notifies the caller once',async t=>{
  t.mock.method(console,'error',()=>{});const errors=[];
  const loader={load(){throw new Error('fixture: parser unavailable');}};
  const performer=buildImportedPerformer(THREE,new THREE.Scene(),{loader,onError:error=>errors.push(error)});
  assert.equal(await performer.ready,false);assert.equal(errors.length,1);
  assert.equal(performer.object.userData.textureStatus,'error');
});
