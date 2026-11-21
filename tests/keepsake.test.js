import test from 'node:test';
import assert from 'node:assert/strict';
import { keepsakeText, setupKeepsake, textLines } from '../dist/keepsake.js';

test('the note is limited to fifty user-visible characters without splitting emoji', () => {
  const family = '👩‍👩‍👦';
  assert.equal(keepsakeText('花'.repeat(49) + family + '!'), '花'.repeat(49) + family);
  assert.equal(keepsakeText('一\r\n二'), '一\n二');
});
test('a note wraps to the available width and retains deliberate line breaks', () => {
  const ctx = { measureText: text => ({width: text.length * 10}) };
  assert.deepEqual(textLines(ctx, '康乃馨\n邀请你常来停歇', 40), ['康乃馨', '邀请你常', '来停歇']);
});

test('Chinese closing punctuation stays with the preceding characters', () => {
  const ctx = { measureText: text => ({width: text.length * 10}) };
  assert.deepEqual(textLines(ctx, '康乃馨。常来', 30), ['康乃馨。', '常来']);
});

test('closing and reopening a keepsake starts a new attempt with its own button lock', async t => {
  const priorDocument = globalThis.document;
  globalThis.document = {};
  t.after(() => {
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  });
  const dialog = new EventTarget();
  const elements = new Map();
  dialog.querySelector = selector => {
    if (!elements.has(selector)) {
      const element = new EventTarget();
      element.removeAttribute = name => { delete element[name]; };
      elements.set(selector, element);
    }
    return elements.get(selector);
  };
  const decodes = [];
  dialog.querySelector('.keepsake-album').decode = () => new Promise(done => decodes.push(done));
  const open = setupKeepsake(dialog, { setMessage() {} }, () => {}, { open() {}, refresh() {} }, false);
  const button = dialog.querySelector('#make-keepsake');
  const start = () => {
    dialog.open = true;
    open();
    button.dispatchEvent(new Event('click'));
  };

  start();
  assert.equal(button.disabled, true);
  dialog.open = false;
  dialog.dispatchEvent(new Event('close'));
  assert.equal(button.disabled, false);
  start();
  assert.equal(decodes.length, 2);
  decodes[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.disabled, true);
  decodes[1]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.disabled, false);
});
