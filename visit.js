(() => {
  if (window.bloomLoading?.repairRequested || !globalThis.crypto?.getRandomValues) return;
  const endpoint = location.hostname === 'gaonan.github.io'
    ? 'https://lyn.lipopo.org/api/visit' : '/api/visit';
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  let visitorId;
  try {
    visitorId = localStorage.getItem('carnation7-visitor');
  } catch {}
  if (!/^[a-f0-9]{32}$/.test(visitorId)) {
    visitorId = newId();
    try { localStorage.setItem('carnation7-visitor', visitorId); } catch {}
  }
  const pageId = newId();
  const report = event => {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, pageId, event, v: 2 }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  };
  let opened = false;
  const pendingEvents = [];
  function recordOpening() {
    if (document.hidden || document.prerendering) return;
    document.removeEventListener('visibilitychange', recordOpening);
    document.removeEventListener('prerenderingchange', recordOpening);
    opened = true;
    report('open');
    for (const event of pendingEvents.splice(0)) report(event);
  }
  document.addEventListener('visibilitychange', recordOpening);
  document.addEventListener('prerenderingchange', recordOpening);
  recordOpening();
  for (const [signal, event] of [
    ['bloom-ready', 'ready'], ['bloom-load-failed', 'load-failed'],
    ['bloom-entered', 'enter'], ['bloom-collected', 'first-collection'],
  ]) {
    window.addEventListener(signal, () => {
      if (opened) report(event);
      else pendingEvents.push(event);
    }, { once: true });
  }
  const challengeEvents = new Set();
  window.addEventListener('bloom-challenge', ({ detail: event }) => {
    if (challengeEvents.has(event)) return;
    challengeEvents.add(event);
    if (opened) report(event);
    else pendingEvents.push(event);
  });
})();
