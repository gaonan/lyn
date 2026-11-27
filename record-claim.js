const CLAIM_KEY = 'carnation7-record-claim';
const LEGACY_KEY = 'carnation7-pending-record-request';
const validId = value => /^[0-9a-f]{32}$/.test(value);
const validNumber = value => Number.isSafeInteger(value) && value > 0;
export const formatRecordNumber = number => `No.${String(number).padStart(6, '0')}`;

export class ClaimError extends Error {
  constructor(message, { status = 0, retryable = true, retryAfter = 0 } = {}) {
    super(message);
    Object.assign(this, { status, retryable, retryAfter });
  }
}

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    checkCancelled(signal);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

// Persist the receipt before rendering an image. Retrying this request never
// consumes another number, even when the original response was lost in transit.
export function createRecordClaim({
  storage = () => globalThis.localStorage,
  session = () => globalThis.sessionStorage,
  fetcher = (...args) => globalThis.fetch(...args),
  endpoint = globalThis.location?.hostname === 'gaonan.github.io'
    ? 'https://lyn.lipopo.org/api/record-number' : '/api/record-number',
  locks = globalThis.navigator?.locks,
  random = Math.random,
  makeId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join(''),
  sleep = waitForRetry,
  timeoutMs = 15000,
  attempts = 4,
  scope,
} = {}) {
  const receiptKey = scope ? `${CLAIM_KEY}:${scope}` : CLAIM_KEY;
  const pendingKey = scope ? `${LEGACY_KEY}:${scope}` : LEGACY_KEY;
  let current, inFlight;
  function read() {
    if (current) return current;
    try {
      const saved = JSON.parse(storage()?.getItem(receiptKey));
      if (saved?.version === 1 && validId(saved.requestId)) {
        return current = { version: 1, requestId: saved.requestId,
          ...(validNumber(saved.number) ? { number: saved.number, completed: saved.completed === true } : {}) };
      }
    } catch {}
    return current;
  }
  function save(receipt) {
    current = receipt;
    try { storage()?.setItem(receiptKey, JSON.stringify(receipt)); } catch {}
    // Also preserve a pending request when persistent storage is unavailable.
    try { session()?.setItem(pendingKey, receipt.requestId); } catch {}
    return receipt;
  }
  async function claim(onProgress, signal) {
    checkCancelled(signal);
    let receipt = read();
    if (!receipt) {
      let legacy;
      try { legacy = session()?.getItem(pendingKey); } catch {}
      receipt = save({ version: 1, requestId: validId(legacy) ? legacy : makeId() });
    }
    if (validNumber(receipt.number)) return receipt;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      checkCancelled(signal);
      onProgress?.(attempt, attempts);
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      let failure;
      try {
        const response = await fetcher(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: receipt.requestId }),
          credentials: 'omit', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) {
          const delay = response.headers.get('Retry-After');
          const seconds = /^\d+$/.test(delay ?? '') ? Number(delay)
            : Math.max(0, (Date.parse(delay) - Date.now()) / 1000) || 0;
          throw new ClaimError('领取请求暂未完成', {
            status: response.status,
            retryable: [408, 425, 429].includes(response.status) || response.status >= 500,
            retryAfter: Math.min(15000, seconds * 1000),
          });
        }
        const data = await response.json();
        checkCancelled(signal);
        if (!validNumber(data.number)) throw new ClaimError('编号响应不完整');
        return save({ ...receipt, number: data.number, completed: false });
      } catch (error) {
        checkCancelled(signal);
        failure = error instanceof ClaimError ? error : new ClaimError('暂时无法连接编号服务');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      if (!failure.retryable || attempt === attempts) throw failure;
      await sleep(Math.max(failure.retryAfter, 800 * 2 ** (attempt - 1) + random() * 500), signal);
    }
  }
  return {
    peek: read,
    start() {
      const receipt = read();
      // A successful photo ends this attempt. A later explicit generation is
      // a new keepsake and receives a new number; failures resume the pending one.
      if (receipt?.completed) save({ version: 1, requestId: makeId() });
    },
    complete(requestId) {
      const receipt = read();
      if (receipt?.requestId === requestId && validNumber(receipt.number)) {
        save({ ...receipt, completed: true });
      }
    },
    get(onProgress, signal) {
      if (!inFlight || inFlight.signal?.aborted) {
        const flight = { signal };
        const task = () => claim(onProgress, signal);
        flight.promise = Promise.resolve().then(() => locks?.request
          ? locks.request(receiptKey, task) : task()).finally(() => {
          if (inFlight === flight) inFlight = undefined;
        });
        inFlight = flight;
      }
      return inFlight.promise;
    },
  };
}
