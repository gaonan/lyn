const PERIOD_MS = 1300 / .9;
const MISS_PREVIEW_MS = 500;
export const FEEDING_LIMITS = Object.freeze({ green: .18, yellow: .58 });
export function feedingNeedle(elapsed) {
  return Math.sin(Math.max(0, elapsed) * Math.PI * 2 / PERIOD_MS - Math.PI / 2);
}
export function feedingZone(value) {
  if (!Number.isFinite(value)) return 'red';
  const distance = Math.abs(value);
  return distance <= FEEDING_LIMITS.green ? 'green' : distance <= FEEDING_LIMITS.yellow ? 'yellow' : 'red';
}

// One attempt owns its locked direction. Subsequent input cannot change the
// result while the reach, four bites, or miss feedback is in progress.
export function createFeedingRound() {
  let phase = 'aim', elapsed = 0, needle = feedingNeedle(0), locked = null;
  let zone = null, bites = 0, reach = 0;
  function tick(delta) {
    if (!Number.isFinite(delta) || delta < 0) return;
    elapsed += delta;
    if (phase === 'aim') needle = feedingNeedle(elapsed);
    if (phase === 'miss-preview' && elapsed >= MISS_PREVIEW_MS) {
      elapsed -= MISS_PREVIEW_MS;
      phase = 'reach';
    }
    if (phase === 'reach') {
      reach = Math.min(1, elapsed / 500);
      if (reach === 1) {
        elapsed -= 500;
        phase = zone === 'green' ? 'eating' : 'miss';
      }
    }
    if (phase === 'eating') {
      bites = Math.min(4, Math.floor(elapsed / 450));
      if (elapsed >= 2100) phase = 'success';
    }
  }
  return {
    tick,
    feed() {
      if (phase !== 'aim') return false;
      locked = needle;
      zone = feedingZone(locked);
      phase = zone === 'green' ? 'reach' : 'miss-preview';
      elapsed = 0;
      return true;
    },
    get state() { return { phase, needle, locked, zone, bites, reach }; },
  };
}
