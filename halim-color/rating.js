function setupPaletteRating({ currentLook, finishes, save }) {
  const dialog = document.querySelector("#palette-rating");
  const digits = [...dialog.querySelectorAll(".rating-reel > span")];
  const message = dialog.querySelector("#rating-message");
  const note = dialog.querySelector("#rating-note");
  const standing = dialog.querySelector("#rating-percentile");
  const announce = dialog.querySelector("#rating-announcement");
  const keep = dialog.querySelector("#rating-save");
  const actions = dialog.querySelector(".rating-actions");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const revealTime = 2400;
  const comments = {
    balanced: "主色和细节呼应得自然，也能融入舞台。",
    layers: "试试把最亮的颜色留给一处，内外层和鞋会更有层次。",
  };
  let shownScore;
  let frame;
  let reveal;
  const stats = createRatingStats(showEstimate);

  function display(value, animate = false) {
    const text = String(value).padStart(2, "0");
    for (let index = 0; index < digits.length; index++) {
      const digit = digits[index];
      if (digit.textContent === text[index]) continue;
      digit.textContent = text[index];
      if (animate) {
        digit.getAnimations().forEach(animation => animation.cancel());
        digit.animate([
          { transform: "translateY(38%)", opacity: .44 },
          { transform: "translateY(0)", opacity: 1 },
        ], { duration: 110, easing: "ease-out" });
      }
    }
  }

  function showEstimate() {
    if (!dialog.open || shownScore === undefined) return;
    const estimate = ratingEstimate(shownScore, stats.snapshot());
    standing.hidden = estimate === null;
    standing.textContent = estimate === null ? "" : "你的搭配超过约 " + estimate + "% 的同担";
  }

  function stop() {
    cancelAnimationFrame(frame);
    clearTimeout(reveal);
    shownScore = undefined;
  }

  function finish(result) {
    const high = result.score >= 80;
    dialog.dataset.phase = high ? "congratulations" : "result";
    display(result.score, !motion.matches);
    announce.textContent = result.score + " 分。";
    message.textContent = high ? "恭喜，配色很出彩！" : "再试一试，你会搭出更协调的一套。";
    const comment = comments[result.note];
    note.hidden = !comment;
    note.textContent = comment || "";
    shownScore = result.score;
    showEstimate();
    actions.hidden = false;
    window.dispatchEvent(new CustomEvent('bloom-palette', { detail: 'rate' }));
  }

  function rate() {
    stop();
    const result = scorePalette(currentLook(), finishes);
    dialog.showModal();
    dialog.dataset.phase = "rolling";
    announce.textContent = "";
    note.hidden = standing.hidden = actions.hidden = true;
    message.textContent = "正在评估配色…";

    if (motion.matches) {
      finish(result);
    } else {
      const start = performance.now();
      let next = start;
      display(70);
      function roll(now) {
        const progress = Math.min(1, (now - start) / revealTime);
        if (progress >= 1) return;
        if (now >= next) {
          display(40 + Math.floor(Math.random() * 60), true);
          next = now + 47 + 185 * progress ** 2.7;
        }
        frame = requestAnimationFrame(roll);
      }
      frame = requestAnimationFrame(roll);
      reveal = setTimeout(() => {
        cancelAnimationFrame(frame);
        if (dialog.open) finish(result);
      }, revealTime);
    }
    stats.queue(result.score);
  }

  document.querySelector("#rate").addEventListener("click", rate);
  dialog.addEventListener("close", () => {
    if (!dialog.open) stop();
  });
  dialog.querySelector("#rating-again").addEventListener("click", () => dialog.close());
  keep.addEventListener("click", () => {
    dialog.close();
    save();
  });
}
