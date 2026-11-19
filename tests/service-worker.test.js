import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
function worker(fetcher, cached) {
  const listeners = {}, saved = [];
  vm.runInNewContext(source, {
    self: { registration: { scope: 'https://example.test/' },
      addEventListener: (name, callback) => { listeners[name] = callback; } },
    location: { origin: 'https://example.test' }, URL, Response, Headers,
    fetch: fetcher, setTimeout, clearTimeout,
    caches: { match: async () => cached?.clone(), open: async () => ({
      put: async (request, response) => saved.push([request.url, await response.text()]),
    }) },
  });
  return { saved, request(path, mode = 'cors', method = 'GET') {
    let response;
    const waits = [];
    listeners.fetch({ request: { url: `https://example.test${path}`, method, mode,
      referrer: '', headers: new Headers() },
    respondWith: value => { response = value; }, waitUntil: value => waits.push(value) });
    return response === undefined ? undefined : Promise.resolve(response).then(async value => {
      await Promise.all(waits); return value;
    });
  } };
}
test('versioned startup code is served from cache without another overseas round trip', async () => {
  let calls = 0;
  const sw = worker(async () => { calls++; return new Response('network'); }, new Response('cached app'));
  assert.equal(await (await sw.request('/app.js?v=20261120-r86')).text(), 'cached app');
  assert.equal(calls, 0);
});
test('an origin 502 still opens the previously cached flower room', async () => {
  const sw = worker(async () => new Response('bad gateway', { status: 502 }), new Response('flower room'));
  assert.equal(await (await sw.request('/', 'navigate')).text(), 'flower room');
  assert.equal(sw.saved.length, 0);
});
test('API and private statistics never use the service worker cache', () => {
  const sw = worker(async () => { throw Error('must not intercept'); }, new Response('cached'));
  assert.equal(sw.request('/api/record-number', 'cors', 'POST'), undefined);
  assert.equal(sw.request('/api/record-number'), undefined);
  assert.equal(sw.request('/stats/'), undefined);
});
test('repair and asset retries explicitly bypass the cache', async () => {
  const sw = worker(async () => new Response('fresh'), new Response('old'));
  assert.equal(await (await sw.request('/app.js?v=20261120-r86&asset-retry=1')).text(), 'fresh');
  assert.equal(await (await sw.request('/?repair=1', 'navigate')).text(), 'fresh');
});
