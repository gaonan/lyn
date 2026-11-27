const ratingSyncInterval = 5 * 60 * 1000;

function ratingEstimate(score, snapshot) {
  if (!snapshot) return null;
  const { counts, ownScore } = snapshot;
  const others = counts.reduce((total, count) => total + count, 0) - Number(ownScore !== null);
  if (!others) return null;
  const below = counts.slice(0, score - 40).reduce((total, count) => total + count, 0)
    - Number(ownScore !== null && ownScore < score);
  return Math.round(100 * Math.sqrt(100 * below / others)) / 10;
}

function validRatingSnapshot(value) {
  if (!value || !Number.isSafeInteger(value.asOf)
    || !Array.isArray(value.counts) || value.counts.length !== 60
    || !value.counts.every(count => Number.isSafeInteger(count) && count >= 0)) return false;
  return value.ownScore === null || (Number.isInteger(value.ownScore)
    && value.ownScore >= 40 && value.ownScore <= 99 && value.counts[value.ownScore - 40] > 0);
}

function createRatingStats(onSnapshot) {
  const namespace = "carnation.halim-rating.v1.";
  const snapshotKey = namespace + "snapshot";
  const pendingKey = namespace + "pending";
  const attemptKey = namespace + "last-attempt";
  const visitorKey = "carnation7-visitor";
  const endpoint = location.hostname === "gaonan.github.io"
    ? "https://lyn.lipopo.org/api/palette-rating" : "/api/palette-rating";
  const memory = new Map();
  let timer;
  let sending = false;

  function read(key) {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch {}
    return memory.get(key);
  }

  function write(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function participantId() {
    // Reuse the browser's existing anonymous garden identifier, stored as plain text.
    let id = memory.get(visitorKey);
    try { id = localStorage.getItem(visitorKey) || id; } catch {}
    if (!/^[a-f0-9]{32}$/.test(id || "")) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem(visitorKey, id); } catch {}
    }
    memory.set(visitorKey, id);
    return id;
  }

  function snapshot() {
    const saved = read(snapshotKey);
    return validRatingSnapshot(saved) ? saved : null;
  }

  async function sync() {
    clearTimeout(timer);
    const entry = read(pendingKey);
    if (!entry || sending || navigator.onLine === false) return;
    const now = Date.now();
    const elapsed = now - (read(attemptKey) || 0);
    if (elapsed >= 0 && elapsed < ratingSyncInterval) {
      timer = setTimeout(sync, ratingSyncInterval - elapsed);
      return;
    }

    sending = true;
    write(attemptKey, now);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ participantId: participantId(), score: entry.score }),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const next = await response.json();
      if (!validRatingSnapshot(next)) return;
      if (next.asOf >= (snapshot()?.asOf ?? 0)) {
        write(snapshotKey, next);
        onSnapshot();
      }
      if (read(pendingKey)?.score === entry.score) write(pendingKey, null);
    } catch {
      // Preserve the previous snapshot and the newest unsent score.
    } finally {
      clearTimeout(deadline);
      sending = false;
      if (read(pendingKey) && navigator.onLine !== false) {
        timer = setTimeout(sync, Math.max(0, now + ratingSyncInterval - Date.now()));
      }
    }
  }

  window.addEventListener("online", sync);
  window.addEventListener("pageshow", sync);
  window.addEventListener("storage", event => {
    if (event.key === snapshotKey) onSnapshot();
  });
  return {
    queue(score) {
      write(pendingKey, { score });
      sync();
    },
    snapshot,
  };
}
