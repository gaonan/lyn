import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicPlayback } from '../dist/music.js';

const tracks = [
  { id: 'live', title: '原现场', kind: 'hls', url: 'https://example.com/live.m3u8', start: 10, end: 20 },
  { id: 'rain', title: '归期雨抄', kind: 'audio', url: 'https://example.com/rain.m4a' },
];
class Audio extends EventTarget {
  paused = true; muted = false; currentTime = 0; sources = []; playCalls = 0; nativeHls = false;
  get src() { return this.currentSource || ''; }
  set src(value) { this.currentSource = value; this.sources.push(value); }
  removeAttribute(name) { if (name === 'src') this.currentSource = ''; }
  load() {}
  canPlayType() { return this.nativeHls ? 'maybe' : ''; }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  play() {
    this.playCalls++;
    if (this.failure) { const error = this.failure; this.failure = undefined; return Promise.reject(error); }
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
}
function fakeHls() {
  const instances = [];
  class Hls {
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static isSupported() { return true; }
    handlers = new Map(); destroyed = false; stopped = false;
    constructor() { instances.push(this); }
    on(type, callback) { this.handlers.set(type, callback); }
    loadSource(url) { this.url = url; }
    attachMedia(audio) { this.audio = audio; }
    startLoad() { this.stopped = false; }
    stopLoad() { this.stopped = true; }
    destroy() { this.destroyed = true; }
    emit(type, value) { this.handlers.get(type)?.(type, value); }
  }
  return { Hls, instances };
}

test('music waits for explicit playback and a deliberate pause survives start()', async () => {
  const audio = new Audio();
  const player = createMusicPlayback(audio, { tracks });
  player.start();
  assert.deepEqual(audio.sources, []);
  assert.equal(audio.playCalls, 0);
  await player.play('rain');
  assert.deepEqual(audio.sources, [tracks[1].url]);
  assert.equal(player.state.playing, true);
  player.pause();
  player.start();
  assert.equal(audio.playCalls, 1);
  assert.equal(player.state.playing, false);
  await player.play('rain');
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.sources.length, 1, 'Resume retains the current source');
});

test('rapid pause and resume stay consistent when native media events arrive late', async () => {
  class DelayedAudio extends Audio {
    events = [];
    pause() {
      const changed = !this.paused;
      this.paused = true;
      if (changed) this.events.push('pause');
    }
    play() {
      this.playCalls++;
      this.paused = false;
      this.events.push('playing');
      return Promise.resolve();
    }
    emitNext(type) {
      const index = this.events.indexOf(type);
      assert.ok(index >= 0, `No queued ${type} event`);
      this.events.splice(index, 1);
      this.dispatchEvent(new Event(type));
    }
  }
  const audio = new DelayedAudio(), player = createMusicPlayback(audio, { tracks });
  await player.play('rain');
  audio.emitNext('playing');
  assert.equal(player.state.playing, true);
  player.pause();
  assert.equal(player.state.playing, false, 'Pause updates the UI before its queued media event');
  await player.play('rain');
  assert.equal(audio.playCalls, 2, 'The immediate next action resumes playback');
  audio.emitNext('playing');
  audio.emitNext('pause');
  assert.equal(player.state.playing, true, 'An old pause cannot mark resumed audio as paused');
  player.pause();
  audio.dispatchEvent(new Event('playing'));
  assert.equal(player.state.playing, false, 'An old playing event cannot undo a newer pause');
});

test('a late HLS import cannot replace a newer song selection', async () => {
  const audio = new Audio(), { Hls, instances } = fakeHls();
  let resolve;
  const deferred = new Promise(done => { resolve = done; });
  const player = createMusicPlayback(audio, { tracks, getHls: () => deferred });
  const oldRequest = player.play('live');
  await player.play('rain');
  resolve(Hls);
  await oldRequest;
  assert.equal(player.state.trackId, 'rain');
  assert.equal(audio.src, tracks[1].url);
  assert.equal(instances.length, 0);
});

test('switching away destroys HLS, ignores its later callbacks, and the original clip loops within its bounds', async () => {
  const audio = new Audio(), { Hls, instances } = fakeHls();
  const player = createMusicPlayback(audio, { tracks, getHls: async () => Hls });
  await player.play('live');
  const live = instances[0];
  live.emit('manifest');
  await Promise.resolve();
  audio.currentTime = 20;
  audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(audio.currentTime, 10);
  await player.play('rain');
  assert.equal(live.destroyed, true);
  live.emit('error', { fatal: true });
  live.emit('manifest');
  assert.equal(player.state.trackId, 'rain');
  assert.equal(player.state.error, '');
  assert.equal(player.state.playing, true);
});

test('local object URLs are released when another source replaces the file', async () => {
  const audio = new Audio(), revoked = [];
  const player = createMusicPlayback(audio, { tracks,
    createObjectURL: file => 'blob:' + file.name, revokeObjectURL: url => revoked.push(url) });
  await player.play('local', { name: 'one.m4a' });
  await player.play('local', { name: 'two.m4a' });
  assert.deepEqual(revoked, ['blob:one.m4a']);
  await player.play('rain');
  assert.deepEqual(revoked, ['blob:one.m4a', 'blob:two.m4a']);
});

test('a blocked play request reports the error and the same selected song can be retried', async () => {
  const audio = new Audio();
  audio.failure = Object.assign(new Error('A user gesture is required'), { name: 'NotAllowedError' });
  const player = createMusicPlayback(audio, { tracks });
  await player.play('rain');
  assert.match(player.state.error, /再点一次播放/);
  assert.equal(player.state.playing, false);
  await player.play('rain');
  assert.equal(player.state.error, '');
  assert.equal(player.state.playing, true);
});

test('overlapping celebration sounds restore the original music mute state once', () => {
  const audio = new Audio(), player = createMusicPlayback(audio, { tracks });
  const first = player.muteForCelebration(), second = player.muteForCelebration();
  first();
  assert.equal(audio.muted, true);
  second();
  second();
  assert.equal(audio.muted, false);
  audio.muted = true;
  player.muteForCelebration()();
  assert.equal(audio.muted, true);
});

test('a source resolver is lazy, can be retried, and does not resolve again for a browser gesture retry', async () => {
  const audio = new Audio();
  const sourceTracks = [{ id: 'rain', kind: 'video', resolveUrl: 'https://example.com/api/music-source?track=rain' }];
  let requests = 0;
  const player = createMusicPlayback(audio, { tracks: sourceTracks, getSource: async () => {
    if (++requests === 1) throw new Error('Temporary upstream failure');
    return { url: 'https://media.example.com/rain.mp4', kind: 'video' };
  } });
  assert.equal(requests, 0);
  assert.deepEqual(audio.sources, []);
  await player.play('rain');
  assert.match(player.state.error, /可以重试/);
  audio.failure = Object.assign(new Error('Needs gesture'), { name: 'NotAllowedError' });
  await player.play('rain');
  assert.equal(requests, 2);
  assert.equal(audio.sources.length, 1);
  assert.match(player.state.error, /再点一次播放/);
  await player.play('rain');
  assert.equal(requests, 2, 'Retry uses the already attached media within the new user gesture');
  assert.equal(audio.sources.length, 1);
  assert.equal(player.state.playing, true);
});

test('a stale resolved source cannot replace a newer song', async () => {
  const audio = new Audio();
  let resolve, signal;
  const deferred = new Promise(done => { resolve = done; });
  const player = createMusicPlayback(audio, { tracks: [...tracks,
    { id: 'resolved', kind: 'video', resolveUrl: 'https://example.com/source' }],
    getSource: (_track, options) => { signal = options.signal; return deferred; } });
  const old = player.play('resolved');
  await player.play('rain');
  assert.equal(signal.aborted, true);
  resolve({ url: 'https://media.example.com/old.mp4', kind: 'video' });
  await old;
  assert.equal(player.state.trackId, 'rain');
  assert.deepEqual(audio.sources, [tracks[1].url]);
});

test('canceling source resolution prevents late autoplay and allows a fresh request', async () => {
  const audio = new Audio(), requests = [];
  const player = createMusicPlayback(audio, { tracks: [{ id: 'rain', kind: 'video', resolveUrl: 'https://example.com/source' }],
    getSource: (_track, { signal }) => new Promise(resolve => requests.push({ resolve, signal })) });
  const first = player.play('rain');
  player.pause();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve({ url: 'https://media.example.com/canceled.mp4', kind: 'video' });
  await first;
  assert.deepEqual(audio.sources, []);
  assert.equal(player.state.playing, false);
  assert.equal(player.state.error, '');
  const second = player.play('rain');
  assert.equal(requests.length, 2);
  requests[1].resolve({ url: 'https://media.example.com/fresh.mp4', kind: 'video' });
  await second;
  assert.equal(audio.src, 'https://media.example.com/fresh.mp4');
  assert.equal(player.state.playing, true);
});
