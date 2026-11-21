import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { buildArchitecture } from '../dist/architecture.js';
import { buildBotanicals } from '../dist/botanicals.js';
import { canRestorePosition, nextPosition, spawnPlayer, stepPlayer } from '../dist/navigation.js';
import { buildConcertPlatform, CONCERT_STAGE } from '../dist/concert-platform.js';
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
test('the relocated stage heart is reachable in front of the performer',()=>{reaches({x:0,y:0,z:5.5},{x:0,y:0,z:1.54},'stage heart');});
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

function simulate(start, frames, moveX, moveZ, jumpFrames, obstacles = colliders) {
  const trace = [spawnPlayer(start)];
  for (let frame = 0; frame < frames; frame++) {
    trace.push(stepPlayer(trace.at(-1), moveX, moveZ, 1/60, jumpFrames.includes(frame), surfaces, obstacles));
  }
  return trace;
}
test('jumping is faster than walking and a second press boosts height without a third jump', () => {
  const start = {x:0,y:0,z:5.5};
  const walking = simulate(start, 15, 0, -1, []);
  const jumping = simulate(start, 15, 0, -1, [0]);
  assert.ok(jumping.at(-1).z < walking.at(-1).z - .30);
  const peak = list => Math.max(...list.map(point => point.y));
  const single = simulate(start, 110, 0, 0, [0]);
  const double = simulate(start, 110, 0, 0, [0, 22]);
  const triple = simulate(start, 110, 0, 0, [0, 22, 35]);
  assert.ok(peak(double) > peak(single) + .7);
  assert.deepEqual(triple, double);
  assert.deepEqual(double.at(-1), {...start, velocityY:0, jumps:0, grounded:true, onProp:false});
});
test('two jumps can cross book-walk railings and land on lower levels', () => {
  for (const y of [2.4, 4.8]) {
    const path = simulate({x:0,y,z:-5.7}, 175, 0, 1, [0, 30]);
    assert.ok(path.some(point => point.z > -4.95 && point.y > y + .10), JSON.stringify(path.slice(18, 26)));
    assert.ok(path.some(point => point.y === 0 && point.grounded), JSON.stringify(path.at(-1)));
    assert.ok(path.every(point => point.y >= 0 && point.z < 8.91));
  }
});
test('jumping beneath the lounge cannot pass through its ceiling', () => {
  const path = simulate({x:5.8,y:0,z:5.2}, 100, 0, 0, [0, 22]);
  assert.ok(Math.max(...path.map(point=>point.y)) < 1.42);
  assert.equal(path.at(-1).y, 0);
});

test('concert removes only the lounge descent and allows walking or jumping off its open landing', () => {
  const room = buildArchitecture(THREE, new THREE.Scene());
  const originalSurfaces = room.surfaces, originalColliders = room.colliders;
  const flight = room.group.getObjectByName('Lounge stairs to the ground floor');
  const slope = originalSurfaces.find(s => s.xStart === 4.8 && s.yEnd === 0);
  assert.ok(flight.visible && slope && flight.children.length);
  assert.equal(room.railPaths.filter(p => p.concertHidden).length, 2);
  room.setConcert(true);
  assert.equal(flight.visible, false);
  assert.ok(!room.surfaces.includes(slope));
  assert.equal(room.surfaces.length, originalSurfaces.length - 1);
  assert.ok(room.colliders.length < originalColliders.length);
  for (const jump of [false, true]) {
    let p = spawnPlayer({x:4.93, y:3.2, z:7.86});
    for (let i=0; i<140; i++) {
      p=stepPlayer(p,i<70?-1:0,0,1/60,jump && i===0,room.surfaces,room.colliders);
    }
    assert.ok(p.grounded && p.y === 0 && p.x < 4.4, JSON.stringify(p));
  }
  let uphill = {x:-7.5, y:0, z:1.6};
  for (let i=0; i<140; i++) uphill=nextPosition(uphill,0,-.05,room.surfaces,room.colliders);
  assert.ok(Math.abs(uphill.y-2.4)<.01);
  room.setConcert(false);
  assert.equal(flight.visible, true);
  assert.equal(room.colliders, originalColliders);
  assert.equal(room.surfaces, originalSurfaces);
  assert.ok(room.surfaces.includes(slope));
});

test('only the round end of the concert stage blocks walking, jumping and checkpoint restoration', () => {
  const roomScene = new THREE.Scene();
  const room = buildArchitecture(THREE, roomScene);
  const flowers = buildBotanicals(THREE, roomScene, room.railPaths, { concertStage: CONCERT_STAGE });
  const deck = buildConcertPlatform(THREE, roomScene);
  room.setConcert(true);
  flowers.setConcert(true);
  const floors = [...room.surfaces, ...deck.surfaces];
  const barriers = [...room.colliders, ...flowers.colliders, deck.barrier];
  const { x, z, radius, y } = CONCERT_STAGE;
  const clearance = radius + .19;
  for (let i = 0; i < 8; i++) {
    const nx = Math.cos(i * Math.PI / 4), nz = Math.sin(i * Math.PI / 4);
    const start = { x: x + 2.8 * nx, y: i === 6 ? y : 0, z: z + 2.8 * nz };
    for (const jump of [false, true]) {
      let p = spawnPlayer(start);
      for (let frame = 0; frame < 140; frame++) {
        p = stepPlayer(p, -nx, -nz, 1 / 60, jump && (frame === 0 || frame === 22), floors, barriers);
        assert.ok(Math.hypot(p.x - x, p.z - z) >= clearance - 1e-7, 'stays outside the stage rim');
      }
      assert.ok(Math.hypot(p.x - x, p.z - z) < clearance + .06, 'can approach the rim from every side');
    }
  }
  assert.equal(canRestorePosition({ x, y, z }, floors, barriers), false);
  for (const point of [
    { x: x + 1.8, y: 0, z: z + 1.8 }, // inside the bounding square, outside the circle
    { x, y, z: z - clearance - .025 }, // the runway reaches the back of the circle
    { x: -3.3, y, z: -4.5 }, { x: 3.3, y, z: -4.5 },
  ]) assert.ok(canRestorePosition(point, floors, barriers), JSON.stringify(point));
  let p = spawnPlayer({ x: -2.5, y: 0, z: z + clearance + .015 });
  for (let frame = 0; frame < 143; frame++) p = stepPlayer(p, 1, 0, 1 / 60, false, floors, barriers);
  assert.ok(p.x > 2.49, 'can walk past the circle on a tangent');
});
