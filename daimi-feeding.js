import { createFeedingView } from './daimi-feeding-view.js?v=20261121-r90';
import { createFeedingRound } from './feeding-round.js?v=20261121-r90';

export function setupDaimiFeeding(options) {
  const view = createFeedingView();
  let round = null, phase = 'closed', frame = 0, last = 0, generation = 0;
  let cameraActive = false, attempts = 0, barkPlays = 0, feedbackPending = false;
  let source, media, finishSound, previousFocus, enteringUntil = 0;

  function stopSound() {
    finishSound?.();
    finishSound = undefined;
    try { source?.stop(); } catch {}
    source = undefined;
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); media = undefined; }
  }
  function barks() {
    stopSound();
    return new Promise(resolve => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        finishSound = undefined;
        resolve();
      };
      const timer = setTimeout(done, 4500);
      finishSound = done;
      source = options.rewardSounds.play('barks');
      if (source) {
        barkPlays++;
        source.addEventListener('ended', done, { once: true });
        return;
      }
      media = new Audio(options.barkURL);
      media.preload = 'auto';
      media.addEventListener('ended', done, { once: true });
      media.addEventListener('error', done, { once: true });
      media.play().then(() => { if (!finished) barkPlays++; }, done);
    });
  }
  function paint() {
    if (!round) return;
    const state = round.state;
    view.setLayout(options.layout());
    view.setNeedle(state.locked ?? state.needle);
    view.setBites(state.bites);
    view.setReach(state.reach, state.zone === 'green' ? 0 : state.locked ?? 0);
    if (state.phase === 'miss') {
      if (!feedbackPending) {
        feedbackPending = true;
        const token = generation;
        barks().then(() => {
          if (token !== generation || !view.dialog.open) return;
          phase = 'miss';
          view.setPhase('miss');
          view.retryButton.focus({ preventScroll: true });
        });
      }
    } else if (state.phase !== phase) {
      phase = state.phase;
      view.setPhase(phase);
      if (phase === 'success') {
        options.rewardSounds.play('celebration');
        view.doneButton.focus({ preventScroll: true });
      }
    }
  }
  function animate(now) {
    frame = 0;
    if (!view.dialog.open || !round) return;
    if (!document.hidden) {
      round.tick(last ? Math.min(64, now - last) : 0);
      paint();
      if (phase === 'aim' && view.feedButton.disabled && now >= enteringUntil) {
        view.feedButton.disabled = false;
        view.feedButton.focus({ preventScroll: true });
      }
    }
    last = document.hidden ? 0 : now;
    frame = requestAnimationFrame(animate);
  }
  function start() {
    generation++;
    stopSound();
    feedbackPending = false;
    options.rewardSounds.unlock();
    if (!cameraActive) {
      cameraActive = true;
      options.startCamera();
      document.body.classList.add('daimi-feeding');
    }
    round = createFeedingRound();
    phase = 'aim';
    attempts++;
    enteringUntil = performance.now() + 500;
    view.setPhase(phase);
    view.feedButton.disabled = true;
    paint();
    last = 0;
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function cleanUp() {
    generation++;
    cancelAnimationFrame(frame);
    frame = last = 0;
    stopSound();
    round = null;
    phase = 'closed';
    document.body.classList.remove('daimi-feeding');
    if (cameraActive) { cameraActive = false; options.endCamera(); }
    options.pause();
    if (previousFocus?.isConnected && !previousFocus.hidden) previousFocus.focus({ preventScroll: true });
  }
  function close() { if (view.dialog.open) view.dialog.close(); }
  view.offerButton.onclick = start;
  for (const button of [view.declineButton, view.quitButton, view.doneButton, view.exitButton].filter(Boolean)) button.onclick = close;
  view.retryButton.onclick = start;
  view.feedButton.onclick = () => {
    if (!round || phase !== 'aim' || document.hidden) return;
    const now = performance.now();
    if (now < enteringUntil) return;
    round.tick(last ? Math.min(64, now - last) : 0);
    last = now;
    if (round.feed()) paint();
  };
  view.dialog.addEventListener('close', cleanUp);
  view.dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('visibilitychange', () => { last = 0; });
  return {
    offer() {
      if (view.dialog.open || document.querySelector('dialog[open]')) return false;
      previousFocus = document.activeElement;
      options.pause();
      phase = 'offer';
      view.setPhase(phase);
      view.dialog.showModal();
      view.offerButton.focus({ preventScroll: true });
      return true;
    },
    get open() { return view.dialog.open; },
    get cameraActive() { return cameraActive; },
    get state() { return { ...(round?.state ?? {}), phase, attempts, barkPlays, feedbackPending }; },
    close,
  };
}
