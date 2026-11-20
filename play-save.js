const SAVE_KEY = 'carnation7-play-save';
const GROUPS = ['hearts', 'magazines', 'roles'];

function readSave(storage) {
  try {
    const saved = JSON.parse(storage()?.getItem(SAVE_KEY));
    if (saved?.version !== 1 || !Number.isInteger(saved.seed) || saved.seed < 0 || saved.seed > 0xffffffff) return null;
    const position = saved.position;
    return {
      version: 1,
      seed: saved.seed,
      position: position && [position.x, position.y, position.z, position.yaw, position.pitch].every(Number.isFinite)
        ? position : null,
      ...Object.fromEntries(GROUPS.map(group => [group, Array.isArray(saved[group])
        ? [...new Set(saved[group].filter(id => typeof id === 'string'))] : []])),
      dogSeen: saved.dogSeen === true,
      dogGreeted: saved.dogGreeted === true,
      feedingOfferedHere: saved.feedingOfferedHere === true,
      invitationSeen: saved.invitationSeen === true,
      testRun: saved.testRun === true,
    };
  } catch { return null; }
}

export function createPlaySave(storage = () => globalThis.localStorage) {
  const state = readSave(storage) ?? {
    version: 1, seed: Math.floor(Math.random() * 0x100000000), position: null,
    hearts: [], magazines: [], roles: [], dogSeen: false, dogGreeted: false, invitationSeen: false, feedingOfferedHere: false, testRun: false,
  };
  function write(update) {
    const latest = readSave(storage);
    if (latest?.seed === state.seed) {
      for (const group of GROUPS) state[group] = [...new Set([...latest[group], ...state[group]])];
      state.position = latest.position ?? state.position;
      state.dogSeen ||= latest.dogSeen;
      state.dogGreeted ||= latest.dogGreeted;
      state.feedingOfferedHere = latest.feedingOfferedHere;
      state.invitationSeen ||= latest.invitationSeen;
      state.testRun ||= latest.testRun;
    }
    update(state);
    try { storage()?.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
  }
  write(() => {});
  return {
    state,
    random(group) {
      // Independent streams let each set of positions be reproduced on reload.
      let seed = state.seed ^ Math.imul(GROUPS.indexOf(group) + 1, 0x9e3779b9);
      return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
    },
    collect(group, ...ids) {
      write(saved => {
        saved[group] = [...new Set([...saved[group], ...ids])];
      });
    },
    mark(flag, value = true) { write(saved => { saved[flag] = value; }); },
    savePosition(position) { write(saved => { saved.position = position; }); },
  };
}
