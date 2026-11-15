import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createHearts } from '../dist/hearts.js';
import { chooseMagazineSpots } from '../dist/magazines.js';
import { chooseRoleSpots } from '../dist/roles.js';
import { createPlaySave } from '../dist/play-save.js';

test('a new page retains all collectible layouts, progress and the last safe position', () => {
  let data;
  const storage = () => ({ getItem: () => data, setItem: (_, value) => { data = value; } });
  const layout = save => ({
    hearts: createHearts(THREE, new THREE.Scene(), save.random('hearts')).items.map(({ id }) => id),
    magazines: chooseMagazineSpots(save.random('magazines')),
    roles: chooseRoleSpots(save.random('roles')),
  });
  const original = createPlaySave(storage);
  const initialLayout = layout(original);
  const otherTab = createPlaySave(storage);
  original.collect('hearts', 'stage-path');
  const position = { x: 7.6, y: 4.8, z: -5.76, yaw: Math.PI / 2, pitch: 0 };
  original.savePosition(position);
  otherTab.collect('magazines', 'magazine-9');
  otherTab.collect('roles', 'role-3');
  otherTab.mark('dogGreeted');
  const restored = createPlaySave(storage);
  assert.deepEqual(layout(restored), initialLayout);
  assert.deepEqual(restored.state.position, position);
  assert.deepEqual(restored.state.hearts, ['stage-path']);
  assert.deepEqual(restored.state.magazines, ['magazine-9']);
  assert.deepEqual(restored.state.roles, ['role-3']);
  assert.equal(restored.state.dogGreeted, true);
});

test('private browsing or unavailable storage leaves the session playable', () => {
  const save = createPlaySave(() => { throw new Error('storage is blocked'); });
  save.collect('hearts', 'stage-path');
  assert.deepEqual(save.state.hearts, ['stage-path']);
});
