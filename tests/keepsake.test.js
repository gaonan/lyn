import test from 'node:test';
import assert from 'node:assert/strict';
import { keepsakeText, textLines } from '../dist/keepsake.js';

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
