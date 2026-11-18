import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createAtriumSky } from '../dist/atrium-sky.js';

function fixture() {
  const sky = createAtriumSky(THREE, new THREE.Scene());
  let time = 0;
  sky.update(time);
  return { sky, get time() { return time; }, advance(seconds) {
    const end = time + seconds;
    while (time < end) {
      time = Math.min(end, time + .01);
      sky.update(time);
    }
    return sky.state;
  }, jump(seconds) { time += seconds; sky.update(time); return sky.state; } };
}

test('night meteors start 8–10 seconds apart and finish after one second', () => {
  const f = fixture();
  let previousStart = 0;
  for (let event = 1; event <= 3; event++) {
    const start = f.advance(f.sky.state.meteor.nextIn + .001).meteor;
    assert.equal(start.active, true);
    assert.equal(start.count, event);
    assert.ok(start.progress >= 0 && start.progress < .02);
    const interval = f.time - previousStart;
    assert.ok(interval >= 8 && interval <= 10.02, `Interval ${interval}s`);
    previousStart = f.time;
    assert.equal(f.advance(.8).meteor.active, true);
    assert.equal(f.advance(.21).meteor.active, false);
  }
});

test('daylight suppresses meteors and switching back waits a full interval', () => {
  const f = fixture();
  f.sky.setNight(false);
  assert.equal(f.advance(35).meteor.count, 0);
  assert.equal(f.sky.state.meteor.active, false);
  f.sky.setNight(true);
  f.advance(.01);
  assert.equal(f.advance(7.8).meteor.active, false);
  assert.equal(f.advance(2.3).meteor.count, 1);
});

test('resuming a hidden tab discards the backlog and cancels a partial streak', () => {
  const f = fixture();
  f.advance(f.sky.state.meteor.nextIn + .2);
  assert.equal(f.sky.state.meteor.active, true);
  const resumed = f.jump(90).meteor;
  assert.equal(resumed.active, false);
  assert.equal(resumed.count, 1);
  assert.ok(resumed.nextIn >= 8 && resumed.nextIn <= 10);
  assert.equal(f.advance(7.8).meteor.count, 1);
});
