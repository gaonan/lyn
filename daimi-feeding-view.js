const FEEDING_PHOTO = './assets/feeding/female-hand-photo.webp?v=20261113-r84';
let viewNumber = 0;
const LIMITS = [-1, -.58, -.18, .18, .58, 1];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Project the aiming fan between the dog and the photographed hand.
export function createFeedingView() {
  const id = `feeding-art-${++viewNumber}`;
  const dialog = document.createElement('dialog');
  dialog.id = 'daimi-feeding-dialog';
  dialog.setAttribute('aria-labelledby', 'feeding-title');
  dialog.innerHTML = `
    <div class="feeding-dimmer" aria-hidden="true"></div>
    <svg class="feeding-art" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-sausage" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#9b4133"/><stop offset=".26" stop-color="#d77e61"/>
          <stop offset=".48" stop-color="#efab83"/><stop offset=".75" stop-color="#d38262"/>
          <stop offset="1" stop-color="#a94d3d"/>
        </linearGradient>
        <linearGradient id="${id}-casing" x1="0" y1="0" x2="1" y2=".8">
          <stop stop-color="#f3c6a8"/><stop offset=".4" stop-color="#c98068"/>
          <stop offset=".8" stop-color="#a54e43"/><stop offset="1" stop-color="#f5c5a5"/>
        </linearGradient>
        <g id="${id}-photo" transform="rotate(48) translate(-130 -250)">
          <image class="feeding-hand-photo" width="1200" height="1006"/>
        </g>
        <clipPath id="${id}-upper-arm"><rect x="-800" y="-650" width="1600" height="1561"/></clipPath>
        <clipPath id="${id}-lower-arm"><rect x="-800" y="910" width="1600" height="100"/></clipPath>
        <clipPath id="${id}-bite"><path class="feeding-bite-clip"/></clipPath>
      </defs>
      <g class="feeding-fan">
        <g class="feeding-zones"></g>
        <path class="feeding-fan-outline"/>
        <path class="feeding-fan-inner"/>
        <g class="feeding-needle"><path class="feeding-needle-line"/><path class="feeding-needle-tip"/><circle class="feeding-needle-hub" r="4"/></g>
      </g>
      <g class="feeding-arm">
        <g class="feeding-arm-art">
          <g transform="rotate(-37)">
            <g class="feeding-food" clip-path="url(#${id}-bite)">
              <path d="M-15 12 C-15-6 15-6 15 12 L15 143 C15 154-15 154-15 143Z" fill="url(#${id}-sausage)" stroke="#a0523e" stroke-width="1.2"/>
              <path d="M-7 14 L-7 135" stroke="#ffe0b4" stroke-opacity=".35" stroke-width="3.5" stroke-linecap="round"/>
              <g fill="#a3503b" opacity=".28"><ellipse cx="5" cy="22" rx="1.3" ry="2"/><ellipse cx="-3" cy="53" rx="1.4" ry="1"/><ellipse cx="7" cy="84" rx="1" ry="1.8"/><ellipse cx="1" cy="119" rx="1.4" ry="1.4"/></g>
            </g>
            <!-- Half the casing is peeled down; the empty flaps remain after bite four. -->
            <path d="M-15 86 Q-6 94 1 87 L15 84 L15 145 Q9 155-9 151 L-15 141Z" fill="url(#${id}-casing)" stroke="#a25e4f" stroke-width="1"/>
            <path d="M-15 84 C-25 108-30 132-26 165 L-12 188 C-15 158-12 129-7 103Z" fill="#e8b69b" stroke="#b17260" stroke-width="1"/>
            <path d="M14 84 C24 111 30 140 25 173 L11 193 C16 157 8 130 6 106Z" fill="url(#${id}-casing)" stroke="#aa6859" stroke-width="1"/>
            <path d="M-5 91 C-10 126-3 153 5 180 L16 168 C2 139 7 116 8 93Z" fill="#f2ccb1" stroke="#bb8670" stroke-width=".9"/>
            <path d="M-7 149 L-1 157 L5 149" fill="none" stroke="#864d42" stroke-width="2"/>
          </g>
          <g class="feeding-photographed-arm" transform="translate(73 97) scale(.225)">
            <g class="feeding-forearm-extension">
              <use href="#${id}-photo" clip-path="url(#${id}-lower-arm)"/>
            </g>
            <use href="#${id}-photo" clip-path="url(#${id}-upper-arm)"/>
          </g>
        </g>
      </g>
    </svg>
    <button type="button" class="feeding-exit" aria-label="退出喂食"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5m4-11 4 4-4 4m-5-4h9"/></svg><span>退出</span></button>
    <div class="feeding-instruction" aria-live="polite"><span>呆米来根肠</span><p>瞄准绿色，点一下「喂」</p></div>
    <section class="feeding-card feeding-offer"><span class="feeding-card-mark" aria-hidden="true">♡</span><h2 id="feeding-title">给呆米来根肠</h2><div class="feeding-actions"><button type="button" class="feeding-primary feeding-offer-yes">给她来根肠</button><button type="button" class="feeding-offer-no">算了，已经是煤气罐了</button></div></section>
    <button type="button" class="feeding-feed">喂</button>
    <section class="feeding-card feeding-result" aria-live="polite"><p class="feeding-result-note"></p><h2 class="feeding-result-title"></h2><div class="feeding-actions"><button type="button" class="feeding-primary feeding-retry">手不够稳啊，再试试</button><button type="button" class="feeding-quit">我不喂了</button><button type="button" class="feeding-primary feeding-done">继续漫游</button></div></section>`;
  document.body.append(dialog);

  const query = selector => dialog.querySelector(selector);
  const zones = query('.feeding-zones');
  const colors = ['#d9665f', '#e8bd63', '#89bd80', '#e8bd63', '#d9665f'];
  const paths = colors.map(color => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', color);
    zones.append(path);
    return path;
  });
  const arm = query('.feeding-arm');
  const photo = query('.feeding-hand-photo');
  const forearm = query('.feeding-forearm-extension');
  const needleLine = query('.feeding-needle-line');
  const needleTip = query('.feeding-needle-tip');
  const hub = query('.feeding-needle-hub');
  const foodClip = query('.feeding-bite-clip');
  const feedButton = query('.feeding-feed');
  let phase = 'offer', value = 0, bites = 0, reach = 0, miss = 0;
  let layout;
  const point = number => ({ x: layout.mouthX + number * layout.fanWidth,
    y: layout.mouthY + number * number * layout.fanSag });
  // The fan stops short of the muzzle, so its colors do not paint over the face.
  const fanPoint = number => {
    const target = point(number);
    return { x: layout.start.x + (target.x - layout.start.x) * .82,
      y: layout.start.y + (target.y - layout.start.y) * .82 };
  };
  const coords = p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

  function updateNeedle() {
    if (!layout) return;
    const tip = fanPoint(value);
    const start = layout.start;
    const dx = tip.x - start.x, dy = tip.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance, uy = dy / distance;
    const end = { x: tip.x - ux * 12, y: tip.y - uy * 12 };
    const a = { x: end.x - uy * 5, y: end.y + ux * 5 };
    const b = { x: end.x + uy * 5, y: end.y - ux * 5 };
    needleLine.setAttribute('d', `M${coords(start)} L${coords(end)}`);
    needleTip.setAttribute('d', `M${coords(tip)} L${coords(a)} L${coords(b)}Z`);
    hub.setAttribute('cx', start.x);
    hub.setAttribute('cy', start.y);
  }
  function updateArm() {
    if (!layout) return;
    const tip = point(miss);
    if (miss) tip.x = clamp(tip.x, 18, layout.width - 155 * layout.scale);
    // Each bite advances the hand a little; the dog image stays completely still.
    const advance = (phase === 'eating' || phase === 'success') ? bites * 22 * layout.scale : 0;
    const x = layout.start.x + (tip.x - layout.start.x) * reach - advance * .602;
    const y = layout.start.y + (tip.y - layout.start.y) * reach - advance * .799;
    const tilt = miss * reach * 6;
    arm.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tilt.toFixed(2)}) scale(${layout.scale})`);
    // Stretch only the photographed lower forearm so the wrist and grip keep
    // their proportions while the nearer end stays beyond the bottom edge.
    const extra = Math.max(1, ((layout.height - y + 36) / layout.scale - 97 - 910 * .225) / 22.5);
    forearm.setAttribute('transform', `translate(0 910) scale(1 ${extra.toFixed(3)}) translate(0 -910)`);
  }
  function setLayout(input) {
    const width = input.viewportWidth || innerWidth, height = input.viewportHeight || innerHeight;
    const mouthX = input.mouthX ?? width * .5, mouthY = input.mouthY ?? height * .4;
    const dogWidth = input.dogWidth || Math.min(width * .28, height * .28);
    if (layout && Math.abs(layout.mouthX - mouthX) < .05 && Math.abs(layout.mouthY - mouthY) < .05
      && layout.width === width && layout.height === height && Math.abs(layout.dogWidth - dogWidth) < .05) return;
    const scale = clamp(Math.min(width / 690, height / 690), .5, 1.02);
    layout = { width, height, mouthX, mouthY, dogWidth, scale,
      fanWidth: Math.min(width * .30, Math.max(110, dogWidth * .96)),
      fanSag: Math.min(height * .12, dogWidth * .52),
      start: { x: Math.min(width - 38, mouthX + Math.min(width * .035, 45)),
        y: height * .65 } };
    query('.feeding-art').setAttribute('viewBox', `0 0 ${width} ${height}`);
    dialog.style.setProperty('--feeding-dog-x', `${mouthX}px`);
    dialog.style.setProperty('--feeding-dog-y', `${mouthY + dogWidth * .25}px`);
    dialog.style.setProperty('--feeding-spot-width', `${Math.max(115, dogWidth * .95)}px`);
    dialog.style.setProperty('--feeding-spot-height', `${Math.max(150, dogWidth * 1.7)}px`);
    for (let i = 0; i < paths.length; i++) {
      const left = LIMITS[i], right = LIMITS[i + 1];
      const steps = Array.from({ length: 10 }, (_, j) => fanPoint(left + (right - left) * j / 9));
      paths[i].setAttribute('d', `M${coords(layout.start)} L${steps.map(coords).join(' L')}Z`);
    }
    const arc = Array.from({ length: 41 }, (_, i) => fanPoint(-1 + i / 20));
    query('.feeding-fan-outline').setAttribute('d', `M${coords(layout.start)} L${arc.map(coords).join(' L')}Z`);
    query('.feeding-fan-inner').setAttribute('d', LIMITS.slice(1, -1).map(v => `M${coords(layout.start)} L${coords(fanPoint(v))}`).join(' '));
    const buttonX = clamp(layout.start.x - 70 * scale, 45, width - 46);
    const buttonY = clamp(layout.start.y + 22 * scale, 70, height - 78);
    feedButton.style.left = `${buttonX}px`;
    feedButton.style.top = `${buttonY}px`;
    updateNeedle();
    updateArm();
  }
  function setPhase(next) {
    phase = next;
    dialog.dataset.phase = next;
    const aiming = next === 'aim';
    if (aiming && !photo.hasAttribute('href')) photo.setAttribute('href', FEEDING_PHOTO);
    query('.feeding-offer').hidden = next !== 'offer';
    query('.feeding-result').hidden = !['miss', 'success'].includes(next);
    query('.feeding-instruction').hidden = next === 'offer' || next === 'miss' || next === 'success';
    feedButton.hidden = !aiming;
    feedButton.disabled = !aiming;
    query('.feeding-fan').style.opacity = aiming ? '1' : '0';
    arm.style.opacity = next === 'offer' ? '0' : '1';
    query('.feeding-retry').hidden = next !== 'miss';
    query('.feeding-quit').hidden = next !== 'miss';
    query('.feeding-done').hidden = next !== 'success';
    query('.feeding-result-title').textContent = next === 'success' ? '呆米吃饱啦' : '哎呀，喂偏了';
    query('.feeding-result-note').textContent = next === 'success' ? '四口香肠，一点小默契。' : '汪！汪！';
    query('.feeding-instruction p').textContent = aiming ? '瞄准绿色，点一下「喂」' : next === 'eating' ? `呆米正在吃第 ${Math.min(4, bites + 1)} 口` : '把手伸过去…';
    updateArm();
  }
  function setBites(count) {
    bites = clamp(Math.floor(count), 0, 4);
    const top = bites === 4 ? 156 : bites * 22;
    foodClip.setAttribute('d', bites === 0 ? 'M-20-8H20V157H-20Z'
      : `M-20 ${top} Q-12 ${top - 5} -5 ${top} Q2 ${top + 6} 8 ${top} Q14 ${top - 4} 20 ${top} V157H-20Z`);
    query('.feeding-food').style.opacity = bites === 4 ? '0' : '1';
    if (phase === 'eating') query('.feeding-instruction p').textContent = bites < 4 ? `呆米正在吃第 ${bites + 1} 口` : '最后一口，也吃完啦';
    updateArm();
  }
  setLayout({});
  setBites(0);
  setPhase('offer');
  return {
    dialog,
    offerButton: query('.feeding-offer-yes'), declineButton: query('.feeding-offer-no'),
    feedButton, retryButton: query('.feeding-retry'), quitButton: query('.feeding-quit'),
    doneButton: query('.feeding-done'), exitButton: query('.feeding-exit'),
    setPhase, setBites, setLayout,
    setNeedle(next) { value = clamp(next, -1, 1); updateNeedle(); },
    setReach(progress, signedMiss = 0) { reach = clamp(progress, 0, 1); miss = clamp(signedMiss, -1, 1); updateArm(); },
    destroy() { dialog.remove(); },
  };
}
