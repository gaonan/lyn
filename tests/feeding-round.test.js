import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedingRound, feedingZone, feedingNeedle } from '../dist/feeding-round.js';

test('the center succeeds and both sides preserve symmetric yellow and red boundaries', () => {
  for (const sign of [-1, 1]) {
    assert.equal(feedingZone(sign * .18), 'green');
    assert.equal(feedingZone(sign * .1801), 'yellow');
    assert.equal(feedingZone(sign * .58), 'yellow');
    assert.equal(feedingZone(sign * .5801), 'red');
  }
  assert.equal(feedingZone(NaN), 'red');
  assert.equal(feedingNeedle(0), -1);
  assert.ok(Math.abs(feedingNeedle(325 / .9)) < 1e-12);
  assert.equal(feedingNeedle(650 / .9), 1);
});
test('a successful click locks once, reaches the dog, and consumes exactly four bites', () => {
  const game = createFeedingRound();
  game.tick(325 / .9);
  assert.equal(game.feed(), true);
  assert.equal(game.state.zone, 'green');
  assert.equal(game.feed(), false);
  game.tick(499);
  assert.equal(game.state.phase, 'reach');
  game.tick(1);
  assert.equal(game.state.phase, 'eating');
  for (let bite = 1; bite <= 4; bite++) {
    game.tick(450);
    assert.equal(game.state.bites, bite);
    assert.equal(game.state.phase, 'eating');
  }
  game.tick(300);
  assert.equal(game.state.phase, 'success');
  assert.equal(game.state.bites, 4);
});
test('yellow and red misses hold their click position for half a second before reaching', () => {
  for (const [elapsed, expectedZone] of [[0, 'red'], [200, 'yellow'], [450, 'yellow'], [650, 'red']]) {
    const game = createFeedingRound();
    game.tick(elapsed / .9);
    game.feed();
    const { locked, zone } = game.state;
    assert.equal(zone, expectedZone);
    assert.equal(game.state.phase, 'miss-preview');
    game.tick(499);
    assert.equal(game.state.phase, 'miss-preview');
    assert.equal(game.state.needle, locked);
    assert.equal(game.state.reach, 0);
    assert.equal(game.feed(), false);
    game.tick(1);
    assert.equal(game.state.phase, 'reach');
    game.tick(500);
    assert.equal(game.state.phase, 'miss');
    assert.equal(game.feed(), false);
    game.tick(3000);
    assert.equal(game.state.locked, locked);
    assert.equal(game.state.bites, 0);
  }
});
