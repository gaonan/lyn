import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createHearts } from '../dist/hearts.js';
import { setupCollection } from '../dist/collection.js';

// These tests exercise both production modules. Only browser DOM/canvas and the
// clock are replaced: input events, proximity, collection state and animation
// updates all run through the real application code.
class Element extends EventTarget {
  constructor(id = '') {
    super(); this.id = id; this.hidden = false; this.style = {}; this.children = [];
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
    this._text = '';
  }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text; }
  append(child) { this.children.push(child); }
  setPointerCapture(id) { this.pointerCapture = id; }
  focus() { this.focused = true; }
  querySelector(selector) { return this.selectors?.get(selector) ?? null; }
}

function harness(t) {
  const document = new EventTarget(), window = new EventTarget(), byId = new Map();
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  const counter = new Element(); counter.textContent = '0';
  document.body = new Element('body');
  document.createElement = () => {
    const root = new Element();
    Object.defineProperty(root, 'innerHTML', {
      get: () => root.html,
      set(html) {
        root.html = html;
        for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
          const element = new Element(match[3]);
          element.hidden = /\bhidden\b/.test(match[2]);
          if (match[1] === 'canvas') element.getContext = () => context;
          byId.set(element.id, element);
        }
        byId.get('collect-heart').selectors = new Map([['.progress', new Element()]]);
      },
    });
    return root;
  };
  document.getElementById = id => byId.get(id) ?? null;
  document.querySelector = selector => selector === '#heart-counter b' ? counter : null;
  let clock = 0, serial = 0;
  const timers = new Map();
  const replacements = {
    document, window, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    performance: { now: () => clock }, navigator: { vibrate() {} },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: clock + delay, callback }); return id; },
  };
  const originals = new Map();
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const hearts = createHearts(THREE, new THREE.Scene());
  let player = { ...hearts.items[0].footPosition };
  const collection = setupCollection(hearts, () => player);
  const button = byId.get('collect-heart');
  function advance(milliseconds) {
    const target = clock + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      clock = due[1].at; timers.delete(due[0]); due[1].callback();
    }
    clock = target;
  }
  function frame(milliseconds = 0, active = true) { advance(milliseconds); collection.update(clock, active); }
  function pointer(type, pointerId = 1) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    button.dispatchEvent(event);
  }
  function standAt(item) { player = { ...item.footPosition }; frame(); }
  function holdFor(milliseconds) { pointer('pointerdown'); frame(milliseconds); }
  frame();
  return {
    hearts, collection, button, counter, document, byId, advance, frame, pointer, standAt, holdFor,
    moveTo(position) { player = position; frame(); },
  };
}

test('a nearby heart requires the full 2,000 ms of continuous holding', t => {
  const h = harness(t);
  assert.equal(h.button.hidden, false);
  h.pointer('pointerdown');
  h.frame(1999);
  assert.equal(h.collection.count, 0);
  assert.equal(h.hearts.items[0].collected, false);
  assert.equal(h.collection.holding, true);
  h.frame(1);
  assert.equal(h.collection.count, 1);
  assert.equal(h.hearts.items[0].collected, true);
  assert.equal(h.counter.textContent, '1');
  assert.equal(h.collection.holding, false);
});

test('releasing before two seconds cancels progress and a fresh hold starts at zero', t => {
  const h = harness(t);
  h.holdFor(1999); h.pointer('pointerup'); h.frame(1000);
  assert.equal(h.collection.count, 0);
  assert.equal(h.collection.holding, false);
  h.holdFor(1999);
  assert.equal(h.collection.count, 0);
  h.frame(1);
  assert.equal(h.collection.count, 1);
});

test('walking out of range cancels a hold even if the finger remains down', t => {
  const h = harness(t), heart = h.hearts.items[0];
  h.holdFor(1000);
  h.moveTo({ x: heart.footPosition.x + 20, y: heart.floorY, z: heart.footPosition.z });
  assert.equal(h.collection.holding, false);
  assert.equal(h.button.hidden, true);
  h.frame(2000); h.standAt(heart); h.frame(2000);
  assert.equal(h.collection.count, 0);
  assert.equal(heart.collected, false);
  h.holdFor(2000);
  assert.equal(h.collection.count, 1);
});

test('floor separation and pausing prevent collection', t => {
  const h = harness(t);
  // Going upward can legitimately enter another randomly selected heart's floor.
  // Below the lowest selected floor isolates vertical distance without depending
  // on which five positions this visit sampled.
  const heart = h.hearts.items.reduce((lowest, item) => item.floorY < lowest.floorY ? item : lowest);
  h.moveTo({ ...heart.footPosition, y: heart.floorY - 3.2 });
  assert.equal(h.button.hidden, true);
  h.holdFor(2000);
  assert.equal(h.collection.count, 0);
  h.standAt(heart); h.holdFor(1000); h.frame(1000, false);
  assert.equal(h.collection.holding, false);
  assert.equal(h.collection.count, 0);
});

test('a collected heart cannot increment the counter again', t => {
  const h = harness(t), heart = h.hearts.items[0];
  h.holdFor(2000);
  // A second press can arrive before the next frame clears the old nearby item.
  h.pointer('pointerdown'); h.frame(2000); h.pointer('pointerup');
  assert.equal(h.collection.count, 1);
  assert.equal(h.counter.textContent, '1');
  assert.equal(h.hearts.collect(heart.id), false);
  h.frame(600);
  assert.equal(heart.object.visible, false);
});

test('five unique hearts trigger the exact finale phrase and retain the 5 / 5 result', t => {
  const h = harness(t);
  assert.equal(new Set(h.hearts.items.map(item => item.id)).size, 5);
  for (const [index, heart] of h.hearts.items.entries()) {
    h.standAt(heart); h.holdFor(2000); h.pointer('pointerup');
    assert.equal(h.collection.count, index + 1);
    assert.equal(heart.collected, true);
  }
  assert.equal(h.counter.textContent, '5');
  assert.equal(h.byId.get('finale').hidden, true);
  h.frame(849);
  assert.equal(h.collection.celebrating, false);
  h.frame(1);
  assert.equal(h.collection.celebrating, true);
  assert.equal(h.byId.get('finale').hidden, false);
  assert.equal(h.document.body.classList.contains('celebrating'), true);
  assert.match(h.document.body.children[0].innerHTML, /<h2>该相逢的人<br>会相逢<\/h2>/);
  assert.equal(h.byId.get('continue-walk').focused, true);
  h.byId.get('continue-walk').onclick(); h.frame(16);
  assert.equal(h.collection.celebrating, false);
  assert.equal(h.byId.get('finale').hidden, true);
  assert.equal(h.counter.textContent, '5');
  assert.equal(h.collection.count, 5);
});
