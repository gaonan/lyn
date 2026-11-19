import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordClaim } from '../dist/record-claim.js';

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function fixture(extra = {}) {
  const storage = memory(), session = memory();
  return { storage: () => storage, session: () => session, locks: undefined,
    makeId: () => 'a'.repeat(32), random: () => 0, sleep: async () => {}, ...extra };
}
const ok = number => new Response(JSON.stringify({ number }), { status: 200 });

test('a committed claim whose response was lost retries the same receipt, once per logical claim', async () => {
  const database = new Map(), calls = [];
  const client = createRecordClaim(fixture({ fetcher: async (_url, options) => {
    const id = JSON.parse(options.body).requestId;
    calls.push(id);
    if (!database.has(id)) database.set(id, database.size + 1);
    if (calls.length === 1) throw new TypeError('connection dropped after commit');
    return ok(database.get(id));
  } }));
  const [first, simultaneous] = await Promise.all([client.get(), client.get()]);
  assert.equal(first.number, 1);
  assert.deepEqual(first, simultaneous);
  assert.deepEqual(calls, ['a'.repeat(32), 'a'.repeat(32)]);
  assert.equal(database.size, 1);
});

test('a saved receipt survives reload and image failures without another network request', async () => {
  const options = fixture({ fetcher: async () => ok(187) });
  const first = await createRecordClaim(options).get();
  const reloaded = createRecordClaim({ ...options, fetcher: async () => { throw Error('must not fetch'); } });
  assert.deepEqual(await reloaded.get(), first);
});

test('a new keepsake after a successful photo receives a new number, while changing angle keeps its number', async () => {
  let identities = 0, calls = 0;
  const options = fixture({ makeId: () => (++identities).toString(16).padStart(32, '0'),
    fetcher: async () => ok(++calls) });
  const client = createRecordClaim(options);
  client.start();
  const first = await client.get();
  client.complete(first.requestId);
  assert.equal((await client.get()).number, 1, 'another camera angle is the same keepsake');
  const reopened = createRecordClaim(options);
  reopened.start();
  const second = await reopened.get();
  assert.equal(second.number, 2, 'a later explicit generation is a new keepsake');
  assert.notEqual(second.requestId, first.requestId);
  reopened.start();
  assert.equal((await reopened.get()).number, 2, 'an unfinished photo resumes on manual retry');
  assert.equal(calls, 2);
});

test('permanent rejection stops immediately while preserving the pending receipt', async () => {
  let calls = 0;
  const options = fixture({ fetcher: async () => { calls++; return new Response('', { status: 403 }); } });
  await assert.rejects(createRecordClaim(options).get(), error => error.status === 403 && !error.retryable);
  assert.equal(calls, 1);
  const resumed = createRecordClaim({ ...options, fetcher: async (_url, request) => {
    assert.equal(JSON.parse(request.body).requestId, 'a'.repeat(32)); return ok(9);
  } });
  assert.equal((await resumed.get()).number, 9);
});

test('server retry-after is respected and repeated failure has a bounded attempt count', async () => {
  let calls = 0; const delays = [];
  const options = fixture({ sleep: async ms => delays.push(ms), fetcher: async () => {
    calls++; return new Response('', { status: 503, headers: { 'Retry-After': '2' } });
  } });
  await assert.rejects(createRecordClaim(options).get(), error => error.status === 503);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [2000, 2000, 3200]);
  assert.equal(createRecordClaim(options).peek().requestId, 'a'.repeat(32));
});

test('a stalled request is aborted and its receipt is reused on the next attempt', async () => {
  let calls = 0;
  const client = createRecordClaim(fixture({ timeoutMs: 10, fetcher: async (_url, options) => {
    if (++calls > 1) return ok(22);
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
  } }));
  assert.equal((await client.get()).number, 22);
  assert.equal(calls, 2);
});

test('a pending request from the previous release is migrated instead of allocating a new identity', async () => {
  const options = fixture({ fetcher: async (_url, request) => {
    assert.equal(JSON.parse(request.body).requestId, 'f'.repeat(32)); return ok(12);
  } });
  options.session().setItem('carnation7-pending-record-request', 'f'.repeat(32));
  assert.equal((await createRecordClaim(options).get()).number, 12);
});

test('storage denial still keeps a stable in-memory receipt and rejects invalid successful responses', async () => {
  let calls = 0;
  const client = createRecordClaim(fixture({
    storage: () => { throw Error('blocked'); }, session: () => { throw Error('blocked'); },
    fetcher: async () => ++calls === 1 ? ok(-1) : ok(55),
  }));
  assert.equal((await client.get()).number, 55);
  assert.equal((await client.get()).number, 55);
  assert.equal(calls, 2);
});
