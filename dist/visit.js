(() => {
  if (!globalThis.crypto?.getRandomValues) return;
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
      body: JSON.stringify({ visitorId, pageId, event }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  };
  function recordOpening() {
    if (document.hidden || document.prerendering) return;
    document.removeEventListener('visibilitychange', recordOpening);
    document.removeEventListener('prerenderingchange', recordOpening);
    report('open');
  }
  document.addEventListener('visibilitychange', recordOpening);
  document.addEventListener('prerenderingchange', recordOpening);
  recordOpening();
  window.addEventListener('bloom-entered', () => report('enter'), { once: true });
})();
