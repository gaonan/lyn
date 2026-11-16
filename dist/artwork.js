// Keep background artwork from taking all available connections on mobile.
export function createArtworkQueue(loader, report, { concurrency = 4 } = {}) {
  const groups = new Map();
  const waiting = [];
  let active = 0;
  let started = false;
  let onIdle;
  const idle = new Promise(resolve => { onIdle = resolve; });
  const inFlight = new Map();

  function progress(group) {
    const entries = group ? [groups.get(group)] : [...groups.values()];
    const total = entries.reduce((sum, item) => sum + item.total, 0);
    const ready = entries.reduce((sum, item) => sum + item.ready, 0);
    const failed = entries.some(item => item.failed);
    return { percent: total ? Math.floor(100 * ready / total) : 100, failed };
  }

  function pump() {
    while (started && active < concurrency && waiting.length) {
      const job = waiting.shift();
      active++;
      attempt(job, true);
    }
    if (started && active === 0) onIdle();
  }

  function attempt(job, retry) {
    let done = false;
    const timer = setTimeout(() => settle(), 18000);
    function settle(texture) {
      if (done) {
        texture?.dispose();
        return;
      }
      done = true;
      clearTimeout(timer);
      if (!texture && retry) {
        setTimeout(() => attempt(job, false), 350);
        return;
      }
      active--;
      if (texture) {
        try { job.success(texture); } finally { complete(); }
      } else {
        try { job.error(new Error('Artwork could not load: ' + job.url)); } finally { complete(); }
      }
    }
    function complete() {
      report(progress());
      pump();
    }
    const url = retry ? job.url : job.url + (job.url.includes('?') ? '&' : '?') + 'asset-retry=' + Date.now();
    try {
      loader.load(url, settle, undefined, () => settle());
    } catch {
      settle();
    }
  }

  return {
    progress,
    start() {
      started = true;
      report(progress());
      pump();
      return idle;
    },
    loaderFor(name) {
      const group = { total: 0, ready: 0, failed: false };
      groups.set(name, group);
      function load(url, success, _onProgress, error) {
        group.total++;
        const existing = inFlight.get(url);
        if (existing) {
          existing.push({ success, error, group });
          return;
        }
        const listeners = [{ success, error, group }];
        inFlight.set(url, listeners);
        waiting.push({
          url,
          success(texture) {
            inFlight.delete(url);
            for (const [index, item] of listeners.entries()) {
              item.group.ready++;
              item.success(index ? texture.clone() : texture);
            }
          },
          error(reason) {
            inFlight.delete(url);
            for (const item of listeners) {
              item.group.failed = true;
              item.error(reason);
            }
          },
        });
        pump();
      }
      return {
        load,
        loadAsync(url) {
          return new Promise((resolve, reject) => load(url, resolve, undefined, reject));
        },
      };
    },
  };
}
