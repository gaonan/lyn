const CUES = Object.fromEntries(['heart', 'magazine', 'role', 'record', 'celebration']
  .map(name => [name, `sounds/${name}.m4a`]));
CUES.barks = 'daimi/two-barks.m4a';

export function createRewardSounds(version) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context;
  const clips = new Map();
  const pending = new Set();

  function preload(cue, path) {
    if (clips.has(cue) || pending.has(cue)) return;
    pending.add(cue);
    fetch(`./assets/${path}?v=${version}`)
      .then(response => {
        if (!response.ok) throw new Error(`Could not load ${cue} sound`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(clip => clips.set(cue, clip))
      .catch(error => console.warn(error))
      .finally(() => pending.delete(cue));
  }

  function unlock() {
    if (!AudioContextClass) return;
    try {
      context ??= new AudioContextClass();
      for (const [cue, path] of Object.entries(CUES)) preload(cue, path);
      if (context.state !== 'running') context.resume().catch(() => {});
    } catch (error) {
      console.warn('Reward audio unavailable', error);
    }
  }

  function play(cue) {
    const clip = clips.get(cue);
    if (context?.state !== 'running' || !clip) return;
    const source = context.createBufferSource();
    source.buffer = clip;
    source.connect(context.destination);
    source.start();
    return source;
  }

  return { unlock, play };
}
