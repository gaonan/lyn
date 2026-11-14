import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cheekColors, matchFaceLighting } from '../dist/portrait-color.js';

const size = 100;
const zones = [[.30, .50, .09, .08], [.70, .50, .09, .08]];
const fill = (left, right) => {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set(i % size < size / 2 ? left : right, i * 4);
  return pixels;
};

test('cheek matching corrects cold and warm light independently while retaining fine detail', () => {
  const source = fill([128, 105, 144, 255], [220, 155, 90, 255]);
  const reference = fill([178, 151, 136, 255], [215, 179, 153, 255]);
  const target = cheekColors(reference, size, zones);
  const eyes = (size * 27 + 31) * 4;
  source.set([8, 7, 7, 255], eyes);
  const outside = (size * 30 + 21) * 4;
  source.set([80, 90, 100, 0], outside);
  const before = cheekColors(source, size, zones);
  matchFaceLighting(source, size, before, target);
  const after = cheekColors(source, size, zones);
  for (const [i, expected] of target.entries()) {
    for (const property of ['light', 'red', 'blue']) {
      const initialError = Math.abs(before[i][property] - expected[property]);
      assert.ok(Math.abs(after[i][property] - expected[property]) < initialError * .75);
    }
  }
  assert.ok(source[eyes] < 35);
  assert.deepEqual(source.slice(outside, outside + 4), Uint8ClampedArray.of(80, 90, 100, 0));
});

test('transparent or clearly unusable sample regions do not trigger a guessed correction', () => {
  const source = fill([250, 250, 250, 255], [0, 0, 0, 0]);
  const before = source.slice();
  const samples = cheekColors(source, size, zones);
  assert.deepEqual(samples, [null, null]);
  matchFaceLighting(source, size, samples, [{ x: .3, light: 150, red: 22, blue: -20 }, null]);
  assert.deepEqual(source, before);
});
