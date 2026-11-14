import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { buildArchitecture } from '../dist/architecture.js';
import { buildBotanicals } from '../dist/botanicals.js';
import { nextPosition } from '../dist/navigation.js';
import { chooseMagazineSpots, magazineInReach } from '../dist/magazines.js';
import { chooseRoleSpots, roleInReach } from '../dist/roles.js';
import { RECORD_POSITION, recordInReach } from '../dist/record.js';

// Only decorative canvas painting is stubbed; the actual room and flower
// geometry factories supply every floor and collision box used in these tests.
const canvasContext = new Proxy({
  getImageData: () => ({data:new Uint8ClampedArray(256*256*4)}),
  createRadialGradient: () => ({addColorStop(){}}),
  createLinearGradient: () => ({addColorStop(){}}),
}, {get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>canvasContext})};
const scene=new THREE.Scene();
const world=buildArchitecture(THREE,scene);
const plants=buildBotanicals(THREE,scene,world.railPaths);
const surfaces=world.surfaces,colliders=[...world.colliders,...plants.colliders];
function walk(p,x,z){const distance=Math.hypot(x-p.x,z-p.z),steps=Math.max(1,Math.ceil(distance/.025)),dx=(x-p.x)/steps,dz=(z-p.z)/steps;for(let i=0;i<steps;i++)p=nextPosition(p,dx,dz,surfaces,colliders);return p;}
function reaches(p,target,note){const q=walk(p,target.x,target.z);assert.ok(Math.hypot(q.x-target.x,q.z-target.z)<.06,`${note}: blocked at ${JSON.stringify(q)}, expected ${JSON.stringify(target)}`);assert.ok(Math.abs(q.y-target.y)<.03,`${note}: height ${q.y}, expected ${target.y}`);return q;}
// Photo-based route: low book walk -> intermediate right lounge -> higher book
// walk -> left turning stair -> highest book walk. No full upper U galleries.
const route=[
 {x:-5,y:0,z:5.8}, {x:-7.6,y:0,z:5.8}, {x:-7.6,y:0,z:1.9},
 {x:-7.6,y:2.4,z:-5.7}, {x:-3.6,y:2.4,z:-5.7}, {x:0,y:2.4,z:-5.7},
 {x:5.4,y:2.4,z:-5.7}, {x:5.4,y:3.2,z:-1.62}, {x:7.6,y:3.2,z:-1.62},
 {x:7.6,y:4.8,z:-5.7}, {x:7.2,y:4.8,z:-5.7}, {x:0,y:4.8,z:-5.7},
 {x:-7.6,y:4.8,z:-5.7}, {x:-7.6,y:7.2,z:.95}, {x:-5.7,y:7.2,z:.95},
 {x:-5.7,y:7.2,z:-5.7}, {x:-7.6,y:7.2,z:-5.7}, {x:0,y:7.2,z:-5.7},
];
test('walks all photo-based stair links including lower and upper book walks, with flower collisions',()=>{let p={x:0,y:0,z:6};for(let i=0;i<route.length;i++)p=reaches(p,route[i],`ascending ${i+1}`);});
test('descends every route without clipping or teleporting',()=>{let p={...route.at(-1)};for(let i=route.length-2;i>=0;i--)p=reaches(p,route[i],`descending ${i+1}`);reaches(p,{x:0,y:0,z:6},'back to ground');});
test('reaches stage-path and window-aisle collectible candidates around the flower banks',()=>{reaches({x:0,y:0,z:6},{x:0,y:0,z:2.1},'stage heart');let p=reaches({x:0,y:0,z:6},{x:6,y:0,z:6},'right aisle entrance');reaches(p,{x:6,y:0,z:2.5},'window heart');});
test('descends from the window-side short stair past the sofa, turns right and reaches the stage floor', () => {
  let p = {x:7.6,y:4.8,z:-5.7};
  const steps = [
    {x:7.6,y:3.2,z:-.85},
    {x:7.28,y:3.2,z:.12},
    {x:7.28,y:3.2,z:4.83},
    {x:7.28,y:3.2,z:6.4},
    {x:6.35,y:3.2,z:6.4},
    {x:6.35,y:3.2,z:7.87},
    {x:-1.48,y:0,z:7.87},
    {x:-1.48,y:0,z:6},
    {x:0,y:0,z:6},
    {x:0,y:0,z:2.1},
  ];
  for (const [i, target] of steps.entries()) p = reaches(p, target, `descent ${i+1}`);
});
test('upper-left collectible is reachable on the turn landing',()=>{reaches({x:-7.6,y:7.2,z:.95},{x:-7.6,y:7.2,z:.9},'upper-left heart');});
test('book-walk railings stop the player entering the atrium',()=>{for(const y of [2.4,4.8,7.2]){const p=walk({x:0,y,z:-5.7},0,-4.5);assert.ok(p.z<=-5.31,JSON.stringify(p));assert.equal(p.y,y);}});
test('lounge inner railing stops the player crossing its edge',()=>{const p=walk({x:5.4,y:3.2,z:2.7},3.8,2.7);assert.ok(p.x>=5.01,JSON.stringify(p));assert.equal(p.y,3.2);});
test('ground wall and stage stool block movement while leaving room alongside', () => {
  const wall = walk({x:0,y:0,z:7.9},0,10);
  assert.ok(wall.z < 8.8);
  const stopped = walk({x:1,y:0,z:0},1,-1.6);
  assert.ok(stopped.z > -1.26 && stopped.z < -1.20, JSON.stringify(stopped));
  reaches({x:.45,y:0,z:0},{x:.45,y:0,z:-2.2},'clear aisle beside narrow stool');
});
test('crossing below the right lounge never jumps to its floor',()=>{reaches({x:5.6,y:0,z:2.5},{x:6,y:0,z:2.5},'below lounge');});

test('the back-wall record can be reached on foot from the entrance', () => {
  const start = { x: 0, y: 0, z: 5.5 };
  assert.equal(recordInReach(start), false);
  const aisle = reaches(start, { x: RECORD_POSITION.x, y: 0, z: 5.5 }, 'record aisle');
  const byWall = reaches(aisle, { x: RECORD_POSITION.x, y: 0, z: 8.15 }, 'record');
  assert.equal(recordInReach(byWall), true);
  assert.equal(recordInReach({ ...byWall, y: 3.2 }), false);
});

test('every randomized magazine spot is reachable on the correct level', () => {
  const starts = new Map();
  let ground = { x: 0, y: 0, z: 5.5 };
  ground = reaches(ground, { x: 6.2, y: 0, z: 5.5 }, 'right entrance');
  ground = reaches(ground, { x: 6.2, y: 0, z: -5.87 }, 'ground book wall');
  starts.set(0, ground);
  let bookWalk = { x: 0, y: 0, z: 6 };
  for (const [i, target] of route.slice(0, 4).entries()) {
    bookWalk = reaches(bookWalk, target, `book walk approach ${i}`);
  }
  starts.set(2.4, bookWalk);
  for (const roll of [0, .999]) {
    const spots = chooseMagazineSpots(() => roll).map(spot => ({ ...spot, illuminate() {} }));
    assert.equal(spots.length, 11);
    assert.equal(spots.filter(spot => spot.floorY === 0).length, 6);
    assert.equal(spots.filter(spot => spot.floorY === 2.4).length, 5);
    for (const spot of spots) {
      const start = starts.get(spot.floorY);
      const player = reaches(start, { x: spot.x, y: spot.floorY, z: start.z }, 'reach magazine');
      assert.equal(magazineInReach(spots, player), spot);
      assert.equal(magazineInReach(spots, { ...player, y: player.y + .4 }), null);
      assert.equal(magazineInReach([{ ...spot, lit: true }], player), null);
    }
  }
});

test('all randomized role portrait positions are reachable with the current stairs and colliders', () => {
  const starts = new Map();
  let player = { x: 0, y: 0, z: 5.5 };
  player = reaches(player, { x: 6.2, y: 0, z: 5.5 }, 'right entrance');
  starts.set(0, reaches(player, { x: 6.2, y: 0, z: -5.87 }, 'ground book wall'));
  player = { x: 0, y: 0, z: 6 };
  for (const [i, target] of route.entries()) {
    player = reaches(player, target, `role book walk approach ${i}`);
    if (player.z < -5.5 && !starts.has(player.y)) starts.set(player.y, player);
  }
  for (const random of [0, .5, .999]) {
    const spots = chooseRoleSpots(() => random);
    assert.equal(spots.length, 12);
    for (const floorY of [0, 2.4, 4.8, 7.2]) {
      const onFloor = spots.filter(spot => spot.floorY === floorY);
      assert.equal(onFloor.length, 3);
      for (const spot of onFloor) {
        const start = starts.get(spot.floorY);
        const atPortrait = reaches(start, { x: spot.x, y: spot.floorY, z: start.z }, 'reach role portrait');
        assert.equal(roleInReach(spots, atPortrait), spot);
        assert.equal(roleInReach(spots, { ...atPortrait, y: atPortrait.y + .5 }), null);
        assert.equal(roleInReach([{ ...spot, received: true }], atPortrait), null);
      }
    }
  }
});
