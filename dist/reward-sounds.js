const CUES = ['heart', 'magazine', 'role', 'record', 'celebration'];

export function createRewardSounds(version) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context;
  const clips = new Map();

  function unlock() {
    if (!AudioContextClass) return;
    try {
      if (!context) {
        context = new AudioContextClass();
        for (const cue of CUES) {
          fetch(`./assets/sounds/${cue}.m4a?v=${version}`)
            .then(response => {
              if (!response.ok) throw new Error(`Could not load ${cue} sound`);
              return response.arrayBuffer();
            })
            .then(data => context.decodeAudioData(data))
            .then(clip => clips.set(cue, clip))
            .catch(error => console.warn(error));
        }
      }
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
