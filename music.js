import { MUSIC_TRACKS } from './music-tracks.js?v=20261120-r87';

let hlsScript;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsScript) {
    hlsScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/hls.min.js', import.meta.url).href;
      script.onload = () => resolve(window.Hls);
      script.onerror = () => { script.remove(); hlsScript = undefined; reject(new Error('HLS unavailable')); };
      document.head.append(script);
    });
  }
  return hlsScript;
}

async function resolveSource(track, { signal }) {
  const response = await fetch(track.resolveUrl, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Source unavailable');
  return response.json();
}

// Merely selecting an outfit or opening the menu never loads an audio source.
// Each explicit play request owns a generation, so an older HLS import or play
// promise cannot replace the track chosen by a later request.
export function createMusicPlayback(audio, {
  tracks = MUSIC_TRACKS, getHls = loadHls, getSource = resolveSource, onState = () => {},
  createObjectURL = file => URL.createObjectURL(file), revokeObjectURL = url => URL.revokeObjectURL(url),
} = {}) {
  let current = null, hls = null, localUrl = null, generation = 0;
  let loading = false, playing = false, wantsPlaying = false, ready = false, error = '';
  let metadataListener, sourceRequest, blocked = false, celebrationMutes = 0, previousMuted = false;
  let listenerHasChosen = false, stageIntroduced = false, cancelStageCue = null, stageRetry = null;
  const state = () => ({ trackId: current?.id ?? null, localName: current?.localName ?? '',
    playing, loading, wantsPlaying, ready, error });
  const notify = () => onState(state());

  function destroySource() {
    sourceRequest?.abort();
    sourceRequest = undefined;
    if (metadataListener) audio.removeEventListener('loadedmetadata', metadataListener);
    metadataListener = undefined;
    hls?.destroy();
    hls = null;
    audio.pause();
    playing = false;
    audio.removeAttribute('src');
    audio.load();
    if (localUrl) revokeObjectURL(localUrl);
    localUrl = null;
    ready = false;
  }
  function fail(token, message, gestureRetry = false) {
    if (token !== generation) return;
    blocked = gestureRetry;
    loading = false;
    playing = false;
    wantsPlaying = false;
    error = message;
    hls?.stopLoad();
    audio.pause();
    notify();
  }
  async function attemptPlay(token) {
    if (token !== generation || !wantsPlaying) return;
    try {
      await audio.play();
      if (token !== generation || !wantsPlaying) return;
      loading = false;
      error = '';
      blocked = false;
      notify();
    } catch (cause) {
      if (token !== generation || !wantsPlaying) return;
      const gestureRequired = cause?.name === 'NotAllowedError';
      fail(token, gestureRequired
        ? '音源已连接，请再点一次播放。'
        : '音源暂时无法播放。可以重试，或打开原现场。', gestureRequired);
    }
  }
  async function play(trackId, file) {
    stageRetry = null;
    if (current?.id === trackId && !file && (!error || blocked) && (ready || hls)) {
      wantsPlaying = true;
      error = '';
      hls?.startLoad();
      loading = !ready;
      notify();
      if (ready) await attemptPlay(generation);
      return;
    }
    const track = file ? { id: 'local', localName: file.name, kind: 'audio' }
      : tracks.find(item => item.id === trackId && item.available !== false);
    if (!track) return;
    const token = ++generation;
    wantsPlaying = false;
    destroySource();
    current = track;
    wantsPlaying = true;
    loading = true;
    error = '';
    blocked = false;
    notify();
    let media = track;
    if (track.resolveUrl) {
      const request = new AbortController();
      sourceRequest = request;
      try {
        const resolved = await getSource(track, { signal: request.signal });
        if (token !== generation || !wantsPlaying || request.signal.aborted) return;
        sourceRequest = undefined;
        if (typeof resolved?.url !== 'string' || !resolved.url.startsWith('https://')) throw new Error('Invalid media URL');
        const kind = resolved.kind || track.kind;
        if (!['audio', 'video', 'hls'].includes(kind)) throw new Error('Invalid media kind');
        media = { ...track, url: resolved.url, kind };
        current = media;
      } catch {
        if (token === generation && wantsPlaying && !request.signal.aborted) {
          sourceRequest = undefined;
          fail(token, '音源暂时无法连接。可以重试，或打开原现场。');
        }
        return;
      }
    }
    const url = file ? (localUrl = createObjectURL(file)) : media.url;
    if (!url) { fail(token, '音源暂时无法连接。可以重试，或打开原现场。'); return; }
    audio.loop = !Number.isFinite(track.end);
    const start = Number.isFinite(track.start) ? track.start : 0;
    if (start > 0) {
      metadataListener = () => {
        if (token === generation) audio.currentTime = start;
        metadataListener = undefined;
      };
      audio.addEventListener('loadedmetadata', metadataListener, { once: true });
    }
    if (media.kind !== 'hls' || audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = url;
      ready = true;
      await attemptPlay(token);
      return;
    }
    try {
      const Hls = await getHls();
      if (token !== generation || !wantsPlaying) return;
      if (!Hls?.isSupported()) throw new Error('Unsupported media');
      const instance = new Hls({ startPosition: start, maxBufferLength: 10,
        maxMaxBufferLength: 20, backBufferLength: 0 });
      hls = instance;
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (token !== generation || instance !== hls) return;
        ready = true;
        if (wantsPlaying) void attemptPlay(token);
      });
      instance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) fail(token, '现场音源暂时无法连接。可以重试，或打开原现场。');
      });
      instance.loadSource(url);
      instance.attachMedia(audio);
    } catch {
      fail(token, '此浏览器暂时无法播放该音源。可以重试、选择本机音频或打开原现场。');
    }
  }
  function noteSelection() {
    cancelStageCue?.();
    listenerHasChosen = true;
    stageRetry = null;
  }
  function pause() {
    noteSelection();
    wantsPlaying = false;
    loading = false;
    playing = false;
    if (sourceRequest) {
      generation++;
      sourceRequest.abort();
      sourceRequest = undefined;
    }
    hls?.stopLoad();
    audio.pause();
    notify();
  }
  audio.addEventListener('pause', () => {
    if (!audio.paused) return;
    playing = false;
    notify();
  });
  audio.addEventListener('playing', () => {
    if (audio.paused) return;
    playing = true;
    loading = false;
    error = '';
    notify();
  });
  audio.addEventListener('error', () => {
    blocked = false;
    if (current) fail(generation, '音源暂时无法连接。可以重试、选择本机音频或打开原现场。');
  });
  audio.addEventListener('timeupdate', () => {
    if (Number.isFinite(current?.end) && audio.currentTime >= current.end) {
      audio.currentTime = current.start || 0;
      if (wantsPlaying) void attemptPlay(generation);
    }
  });
  function muteTemporarily() {
    if (!celebrationMutes++) previousMuted = audio.muted;
    audio.muted = true;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      if (!--celebrationMutes) audio.muted = previousMuted;
    };
  }
  function prepareStageTrack(trackId) {
    if (stageIntroduced || listenerHasChosen || cancelStageCue) return null;
    // Start a fresh player's actual media element inside the entry tap. Keep it
    // silent through the countdown, then play the opening note at the reveal.
    const unmute = muteTemporarily();
    void play(trackId);
    let finished = false;
    const cue = {
      reveal() {
        if (finished) return false;
        finished = stageIntroduced = true;
        cancelStageCue = null;
        if (audio.readyState >= 1 && audio.currentTime > 0) audio.currentTime = 0;
        unmute();
        if (!wantsPlaying || audio.paused) void play(trackId);
        stageRetry = trackId;
        return true;
      },
      cancel() {
        if (finished) return;
        finished = true;
        cancelStageCue = null;
        generation++;
        wantsPlaying = loading = false;
        current = null;
        error = '';
        blocked = false;
        destroySource();
        unmute();
        notify();
      },
    };
    cancelStageCue = cue.cancel;
    return cue;
  }
  return {
    play(trackId, file) { noteSelection(); return play(trackId, file); },
    noteSelection, pause, prepareStageTrack, muteForCelebration: muteTemporarily, get state() { return state(); },
    start() { if (current && wantsPlaying && audio.paused) void play(current.id); },
    retryStageOnGesture() {
      if (stageRetry && current?.id === stageRetry && (blocked || (wantsPlaying && ready && audio.paused))) {
        void play(stageRetry);
      }
    },
  };
}

export function setupMusic() {
  const trigger = document.getElementById('music');
  const dialog = document.createElement('dialog');
  dialog.id = 'music-dialog';
  dialog.setAttribute('aria-labelledby', 'music-title');
  dialog.innerHTML = `<button class="close" aria-label="关闭音乐设置">×</button>
    <span class="eyebrow">花房音乐</span><h2 id="music-title">选择这一刻的歌</h2>
    <div class="music-tracks" role="group" aria-label="选择歌曲"></div>
    <div class="music-controls"><button id="play-live" class="primary">播放</button>
      <label class="audio-file">本机音频<input id="audio-file" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav"></label></div>
    <p id="music-status" role="status" aria-live="polite">点击播放后才会加载音源。</p>
    <p class="music-note">现场原声按需播放，建议在 Wi-Fi 下收听。</p>
    <a class="source-link" target="_blank" rel="noopener">查看原现场 ↗</a>`;
  const prompt = document.createElement('dialog');
  prompt.id = 'rain-music-dialog';
  prompt.setAttribute('aria-labelledby', 'rain-music-title');
  prompt.innerHTML = `<button class="close" aria-label="暂不播放，关闭询问">×</button>
    <span class="eyebrow">归期雨抄 · 白衣舞台</span><h2 id="rain-music-title">要播放《归期雨抄》吗？</h2>
    <p>刘宇宁 · 音乐缘计划3 现场</p><div class="music-prompt-actions">
      <button id="rain-music-play" class="primary">播放</button><button id="rain-music-skip" autofocus>暂不播放</button></div>`;
  const audio = document.createElement('video');
  audio.id = 'bgm-player';
  audio.setAttribute('aria-hidden', 'true');
  audio.tabIndex = -1;
  audio.playsInline = true;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.preload = 'none';
  audio.volume = .48;
  audio.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;pointer-events:none';
  document.body.append(dialog, prompt, audio);

  const status = dialog.querySelector('#music-status');
  const playButton = dialog.querySelector('#play-live');
  const sourceLink = dialog.querySelector('.source-link');
  let selected = MUSIC_TRACKS[0]?.id, closeOnPlaying = false;
  const rows = MUSIC_TRACKS.filter(track => track.available !== false).map(track => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'music-track';
    button.dataset.track = track.id;
    button.innerHTML = '<span class="music-track-copy"><b></b><small></small></span><span class="music-track-state" aria-hidden="true"></span>';
    button.querySelector('b').textContent = track.title;
    button.querySelector('small').textContent = track.subtitle;
    button.onclick = () => {
      playback.noteSelection();
      if (selected === track.id) return;
      const resume = playback.state.playing || playback.state.wantsPlaying;
      selected = track.id;
      render(playback.state);
      if (resume) startSelected();
    };
    dialog.querySelector('.music-tracks').append(button);
    return button;
  });
  function render(state) {
    trigger.classList.toggle('music-on', state.playing);
    const current = MUSIC_TRACKS.find(track => track.id === state.trackId);
    trigger.title = state.playing ? `音乐设置，正在播放《${current?.title || state.localName}》` : '音乐设置';
    trigger.setAttribute('aria-label', trigger.title);
    const track = MUSIC_TRACKS.find(item => item.id === selected);
    for (const row of rows) {
      const checked = row.dataset.track === selected;
      row.setAttribute('aria-pressed', String(checked));
      const playing = state.playing && row.dataset.track === state.trackId;
      row.querySelector('.music-track-state').textContent = playing ? '播放中' : checked ? '已选择' : '';
    }
    playButton.textContent = state.trackId === selected && state.playing ? '暂停'
      : state.trackId === selected && state.loading ? '取消加载'
      : state.error && state.trackId === selected ? '重试播放' : '播放';
    sourceLink.hidden = !track?.sourceUrl;
    if (track?.sourceUrl) sourceLink.href = track.sourceUrl;
    if (state.trackId !== selected) status.textContent = '点击播放后才会加载这首歌。';
    else if (state.error) status.textContent = state.error;
    else if (state.loading) status.textContent = '正在连接音源…';
    else if (state.playing) status.textContent = `正在播放：${current?.title || state.localName}`;
    else if (state.trackId) status.textContent = `已暂停：${current?.title || state.localName}`;
    else status.textContent = '点击播放后才会加载音源。';
    if (state.playing && closeOnPlaying) {
      closeOnPlaying = false;
      dialog.close();
    }
    if (state.error) closeOnPlaying = false;
  }
  const playback = createMusicPlayback(audio, { onState: render });
  function retryGardenAudio(event) {
    if (event.isTrusted && selected === 'garden' && event.target.closest?.('#world, #joystick, #look-joystick')) {
      playback.retryStageOnGesture();
    }
  }
  document.addEventListener('pointerup', retryGardenAudio);
  function startSelected() {
    closeOnPlaying = true;
    void playback.play(selected);
  }
  dialog.querySelector('.close').onclick = () => { closeOnPlaying = false; dialog.close(); };
  trigger.onclick = () => {
    if (prompt.open) prompt.close();
    closeOnPlaying = false;
    render(playback.state);
    if (!dialog.open) dialog.showModal();
  };
  playButton.onclick = () => {
    if (playback.state.trackId === selected && (playback.state.playing || playback.state.loading)) playback.pause();
    else startSelected();
  };
  dialog.querySelector('#audio-file').onchange = event => {
    const file = event.target.files[0];
    if (!file) return;
    selected = 'local';
    closeOnPlaying = true;
    void playback.play('local', file);
    event.target.value = '';
  };
  prompt.querySelector('.close').onclick = () => prompt.close();
  prompt.querySelector('#rain-music-skip').onclick = () => prompt.close();
  prompt.querySelector('#rain-music-play').onclick = () => {
    prompt.close();
    selected = 'rain';
    render(playback.state);
    if (!dialog.open) dialog.showModal();
    startSelected();
  };
  render(playback.state);
  return {
    start: playback.start,
    muteForCelebration: playback.muteForCelebration,
    prepareGardenEntrance() {
      const cue = playback.prepareStageTrack('garden');
      if (!cue) return null;
      return {
        reveal() {
          if (!cue.reveal()) return;
          selected = 'garden';
          render(playback.state);
        },
        cancel: cue.cancel,
      };
    },
    offerRainPlayback() {
      if (!MUSIC_TRACKS.some(track => track.id === 'rain' && track.available !== false)) return;
      if (playback.state.trackId === 'rain' && playback.state.playing) return;
      if (dialog.open) dialog.close();
      if (!prompt.open) {
        prompt.showModal();
        prompt.querySelector('#rain-music-skip').focus({ preventScroll: true });
      }
    },
  };
}
