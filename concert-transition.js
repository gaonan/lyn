import { drawSupporterEtching } from './concert-audience.js?v=20261121-r90';

const TAU = Math.PI * 2;

function clampUnit(t) {
  return Math.min(1, Math.max(0, t));
}

function smooth(t) {
  t = clampUnit(t);
  return t * t * (3 - 2 * t);
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function layer(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

function makeCurtain(width, height, entering) {
  // Update a low-resolution veil and draw the foreground petals at display resolution.
  const scale = 330 / Math.max(width, height);
  const veil = layer(Math.round(width * scale), Math.round(height * scale));
  const w = veil.canvas.width, h = veil.canvas.height;
  const random = seededRandom(0x76934a);
  const noise = Float32Array.from({ length: 4096 }, random);
  function cloud(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const a = (iy & 63) * 64, b = ((iy + 1) & 63) * 64;
    const l = ix & 63, r = (ix + 1) & 63;
    const upper = noise[a + l] + fx * (noise[a + r] - noise[a + l]);
    const lower = noise[b + l] + fx * (noise[b + r] - noise[b + l]);
    return upper + fy * (lower - upper);
  }

  const frame = veil.createImageData(w, h);
  const edge = new Uint16Array(w * h);
  const feather = Uint8Array.from({ length: 256 }, (_, i) => {
    const x = i / 255;
    return Math.round(255 * (.22 * smooth(x / .68) + .78 * smooth((x - .19) / .81)));
  });
  for (let i = 0; i < edge.length; i++) {
    const column = (i % w) / (w - 1);
    const x = entering ? column : 1 - column;
    const y = Math.floor(i / w) / (h - 1);
    const curl = cloud(x * 4.6 + y * 2 + .8, y * 3.2 + 9);
    const folds = cloud(x * 9.6 + curl * 2, y * 9.7 - curl * 3.7);
    const billow = .65 * curl + .35 * folds;
    const diagonal = y - .5;
    const arrival = .19 + .61 * x + .14 * (billow - .5) + .12 * diagonal;
    edge[i] = Math.round(1024 * Math.min(.864, Math.max(.138, arrival)));
    const ribs = .5 + .5 * Math.sin(x * 31 - y * 14 + 4 * curl);
    const foldLight = smooth((billow + .105 * ribs - .25) / .66);
    const radial = Math.max(0, 1 - Math.hypot((column - .47) * 1.45, (y - .53) * 1.5));
    const visibleTint = foldLight * (.45 + .55 * radial);
    frame.data[4 * i] = 11 + (entering ? 42 : 31) * visibleTint;
    frame.data[4 * i + 1] = 7 + 12 * visibleTint;
    frame.data[4 * i + 2] = 15 + (entering ? 26 : 33) * visibleTint;
  }

  return function drawVeil(ctx, progress, closing) {
    const front = Math.round(1024 * progress);
    for (let i = 0; i < edge.length; i++) {
      const featherIndex = Math.max(0, Math.min(255, front - edge[i] + 128));
      frame.data[4 * i + 3] = closing ? feather[featherIndex] : 255 - feather[featherIndex];
    }
    veil.putImageData(frame, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(veil.canvas, 0, 0, width, height);
  };
}

function makePetal(colors) {
  const ctx = layer(96, 64);
  ctx.translate(48, 32);
  ctx.scale(40, 40);
  const silhouette = new Path2D(
    'M-.92 .08 C-.61 -.06 -.33 -.54 .20 -.48 Q.32 -.56 .42 -.43 Q.54 -.50 .60 -.35 ' +
    'Q.77 -.41 .80 -.27 Q.98 -.28 .91 -.10 Q1.03 -.03 .92 .08 Q1.01 .25 .80 .28 ' +
    'Q.82 .43 .62 .39 C.25 .57 -.38 .32 -.92 .08Z',
  );
  const color = ctx.createLinearGradient(-.6, .42, .65, -.42);
  colors.forEach((stop, i) => color.addColorStop(i / (colors.length - 1), stop));
  ctx.fillStyle = color;
  ctx.fill(silhouette);
  ctx.save();
  ctx.clip(silhouette);
  ctx.fillStyle = '#200c24';
  ctx.globalAlpha = .48;
  ctx.fill(new Path2D('M-.92 .10 Q.26 -.17 .88 -.29 Q.54 -.05 .98 .10 Q.09 .05 -.92 .10Z'));
  ctx.strokeStyle = '#ffd2bb';
  ctx.globalAlpha = .30;
  ctx.lineWidth = .019;
  ctx.stroke(new Path2D('M-.76 .11 Q.12 .25 .73 .26 M-.32 .09 Q.14 -.02 .59 -.33 M.27 .16 Q.55 .08 .83 -.08'));
  ctx.restore();
  return ctx.canvas;
}

function makePetals(width, height, entering) {
  const random = seededRandom(entering ? 0x1932cc : 0x986ad3);
  const blooms = [
    makePetal(['#38192d', '#a64e70', '#e48c9a']),
    makePetal(['#42142d', '#863251', '#c56b80']),
    makePetal(['#261833', '#6f456c', '#aa7198']),
  ];
  const short = Math.min(width, height);
  const petals = Array.from({ length: 39 }, (_, i) => {
    const depth = random() ** 2;
    return {
      depth,
      image: blooms[i % blooms.length],
      y: (i + random()) / 39,
      offset: random() - .5,
      phase: random() * TAU,
      speed: .84 + random() * .36,
      size: short * (.009 + .040 * depth),
      alpha: .24 + .50 * depth,
    };
  }).sort((a, b) => a.depth - b.depth);
  const direction = entering ? 1 : -1;
  return function drawPetals(ctx, progress, t, closing) {
    const fade = smooth(t / .27) * smooth((1 - t) / .31);
    if (!fade) return;
    for (const petal of petals) {
      const phase = petal.phase + t * (3.0 + 2.6 * petal.depth) + (closing ? 0 : Math.PI);
      const spread = width * (.18 + petal.depth * .53);
      const leading = (progress - .20 - .19 * petal.y) / .64;
      const x = width / 2 + direction * ((leading - .5) * width * petal.speed + petal.offset * spread);
      const drift = (.03 + .08 * petal.depth) * (t - .25);
      const y = height * (petal.y + Math.sin(phase) * .035 - drift);
      const turn = .54 * Math.sin(phase + .7) - .35 * direction;
      const face = .25 + .75 * Math.abs(Math.cos(phase));
      const size = petal.size;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(turn);
      ctx.globalAlpha = fade * petal.alpha * (closing ? 1 : .76);
      ctx.drawImage(petal.image, -size * .68, -size * .45 * face, size * 1.36, size * .9 * face);
      ctx.restore();
    }
  };
}

function makeEmblem() {
  // Tint the same engraved handshake mask used to render the lightsticks.
  const etching = layer(256, 256);
  etching.fillStyle = '#000';
  etching.fillRect(0, 0, 256, 256);
  drawSupporterEtching(etching);
  const mask = etching.getImageData(0, 0, 256, 256);
  for (let i = 0; i < mask.data.length; i += 4) mask.data[i + 3] = mask.data[i];
  etching.putImageData(mask, 0, 0);
  etching.globalCompositeOperation = 'source-in';
  const gilding = etching.createLinearGradient(43, 35, 186, 211);
  gilding.addColorStop(0, '#a96b37');
  gilding.addColorStop(.32, '#d9a96b');
  gilding.addColorStop(.74, '#f8d290');
  gilding.addColorStop(1, '#b97b40');
  etching.fillStyle = gilding;
  etching.fillRect(0, 0, 256, 256);
  return etching.canvas;
}

function makeStageArt(ctx, width, height, entering) {
  const drawVeil = makeCurtain(width, height, entering);
  const drawPetals = makePetals(width, height, entering);
  const emblem = makeEmblem();
  const short = Math.min(width, height);
  const radius = Math.min(short * .136, 126);
  const ring = ctx.createLinearGradient(-radius, -radius * .72, radius * .67, radius);
  ring.addColorStop(0, '#d8a36a');
  ring.addColorStop(.41, '#694735');
  ring.addColorStop(.75, '#aa754d');
  ring.addColorStop(1, '#ffe1a4');
  const glow = ctx.createRadialGradient(0, radius * .72, 0, 0, radius * .52, radius * 1.5);
  glow.addColorStop(0, 'rgba(247,166,95,.17)');
  glow.addColorStop(.69, 'rgba(188,103,65,.060)');
  glow.addColorStop(1, 'rgba(153,77,50,0)');
  return function draw(progress, closing, t) {
    drawVeil(ctx, progress, closing);
    const engraving = closing && entering ? smooth((t - .49) / .24) : 0;
    if (engraving > 0) {
      ctx.save();
      ctx.translate(width / 2, height * .48);
      const turn = 1 - engraving;
      ctx.rotate(-.10 * turn);
      ctx.scale(1 - .20 * turn, 1 - .04 * turn);
      ctx.globalAlpha = engraving * .95;
      ctx.fillStyle = glow;
      ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
      ctx.strokeStyle = ring;
      ctx.lineWidth = Math.max(.9, radius * .016);
      ctx.beginPath();
      ctx.arc(0, 0, radius * .94, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= .31;
      ctx.beginPath();
      ctx.arc(0, 0, radius * .886, Math.PI * .06, Math.PI * 1.84);
      ctx.stroke();
      ctx.globalAlpha = engraving * .90;
      ctx.drawImage(emblem, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
    drawPetals(ctx, progress, t, closing);
    const black = closing ? smooth((t - .80) / .20) : smooth(1 - t / .30);
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, width, height);
    }
  };
}

function animate(duration, draw) {
  return new Promise(resolve => {
    let start;
    function frame(now) {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      draw(smooth(t), t);
      if (t === 1) resolve();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

export async function sweepStageFog(canvas, reducedMotion, changeScene, { entering = true, onReveal } = {}) {
  const scale = Math.min(1, 1280 / Math.max(innerWidth, innerHeight));
  const width = canvas.width = reducedMotion ? 1 : Math.max(16, Math.round(innerWidth * scale));
  const height = canvas.height = reducedMotion ? 1 : Math.max(16, Math.round(innerHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    await changeScene();
    onReveal?.();
    return;
  }
  function blackFrame(alpha) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }
  const draw = reducedMotion ? null : makeStageArt(ctx, width, height, entering);

  canvas.hidden = false;
  try {
    await animate(reducedMotion ? 140 : entering ? 1370 : 1070, (p, t) => {
      if (draw) draw(smooth(t / .78), true, t);
      else blackFrame(p);
    });
    // Render the stage only after a fully opaque frame has appeared onscreen.
    await new Promise(resolve => requestAnimationFrame(resolve));
    await changeScene();
    if (!reducedMotion) await new Promise(resolve => setTimeout(resolve, 170));
    onReveal?.();
    await animate(reducedMotion ? 150 : entering ? 600 : 1020, (p, t) => {
      if (entering || !draw) blackFrame(1 - p);
      else draw(p, false, t);
    });
  } finally {
    canvas.hidden = true;
  }
}
