// The original head sprites share a 1024 × 1536 grid. Fit each angle to its collar.
const headFits = {
  ivory:   { front: [497, 257, 1.11], side: [498, 255, 1.11] },
  ink:     { front: [512, 256, 1.17], side: [512, 259, 1.15] },
  peach:   { front: [510, 250, 1.17], side: [510, 258, 1.15] },
  denim:   { front: [512, 261, 1.125], side: [509, 259, 1.115] },
  scarlet: { front: [511, 251, 1.15], side: [510, 250, 1.14] },
  striped: { front: [512, 259, 1.145], side: [511, 257, 1.135] }
};

// Lift the two shorter silhouettes from their thighs and keep their shoes on the floor.
const legLift = { ink: .024, peach: .027 };

function bodyLift(look, height) {
  return Math.round((legLift[look] || 0) * height);
}

function drawFittedBody(painter, sprite, look, width, height) {
  const lift = bodyLift(look, height);
  if (!lift) {
    painter.drawImage(sprite, 0, 0, width, height);
    return;
  }
  const thigh = Math.round(height * .47);
  const hem = Math.round(height * .953);
  const sourceScale = sprite.naturalHeight / height;
  painter.drawImage(sprite, 0, 0, sprite.naturalWidth, thigh * sourceScale, 0, -lift, width, thigh);
  painter.drawImage(sprite, 0, thigh * sourceScale, sprite.naturalWidth, (hem - thigh) * sourceScale,
    0, thigh - lift, width, hem - thigh + lift);
  painter.drawImage(sprite, 0, hem * sourceScale, sprite.naturalWidth, (height - hem) * sourceScale,
    0, hem, width, height - hem);
}

function smoothstep(start, end, value) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

const shoulderReduction = { ink: .08, striped: .09 };
const frontFaceReduction = .04;
const fittedRowHeight = 2;
// Side-view chin, collarbone and shortening, on the 800 × 1200 figure.
const sideNecks = {
  striped: [194, 259, 11], ivory: [193, 258, 14], scarlet: [181, 223, 7],
  ink: [174, 237, 11], peach: [170, 237, 10], denim: [190, 238, 8]
};

function fittedFigureWidth(look, angle, row, height) {
  const shoulders = shoulderReduction[look];
  if (!shoulders) return 1;
  const y = (row + fittedRowHeight / 2) / height;
  const face = angle === "front" ? frontFaceReduction : 0;
  const upperBody = face + (shoulders - face) * smoothstep(.145, .23, y);
  return 1 - upperBody * (1 - smoothstep(.29, .47, y));
}

function fitFigure(painter, source, look, angle) {
  const { width, height } = source;
  const neck = angle === "side" ? sideNecks[look] : null;
  const shoulders = shoulderReduction[look];
  if (!shoulders && !neck) return source;
  painter.clearRect(0, 0, width, height);
  const unit = height / 1200;
  const [chin, collarbone, shortening] = neck || [0, 0, 0];
  // Move the whole head and hat together, then shorten the exposed neck down to the collarbone.
  const fittedY = row => neck
    ? Math.round(row + shortening * unit * (1 - smoothstep(chin, collarbone, row / unit))) : row;
  const end = Math.ceil((shoulders ? height * .47 : collarbone * unit) / fittedRowHeight) * fittedRowHeight;
  for (let row = 0; row < end; row += fittedRowHeight) {
    const fittedWidth = shoulders ? width * fittedFigureWidth(look, angle, row, height) : width;
    const y = fittedY(row);
    painter.drawImage(source, 0, row, width, fittedRowHeight,
      (width - fittedWidth) / 2, y, fittedWidth, fittedY(row + fittedRowHeight) - y);
  }
  painter.drawImage(source, 0, end, width, height - end,
    0, end, width, height - end);
  return painter.canvas;
}

// The shared anchors keep the four hatless silhouettes the same height.
const standingTop = 53;
const standingFloor = 1188;

function opaqueEdge(image, fromBottom = false) {
  const { width, height, data } = image;
  for (let row = 0; row < height; row++) {
    const y = fromBottom ? height - row - 1 : row;
    let solid = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= 120 && ++solid >= 4) return y;
    }
  }
  return 0;
}

function standingPlacement(look, crown, sole, width) {
  if (look === "ivory") return { x: 0, y: 0, scale: 1 };
  const unit = width / 800;
  const top = standingTop * unit;
  const floor = standingFloor * unit;
  const scale = (floor - top) / (sole - crown);
  return { x: width * (1 - scale) / 2, y: floor - sole * scale, scale };
}

// Hat measurements use the same 800 × 1200 grid as the garment sprite.
const originalBrim = { x: 372, y: 148, halfWidth: 116, halfDepth: 59, angle: .14 };
const ivoryHatLift = 21;
const ivoryBrims = {
  front: { x: 388, y: 151 - ivoryHatLift, halfWidth: 116, halfDepth: 57, angle: 0 },
  side: { x: 387, y: 158 - ivoryHatLift, halfWidth: 116, halfDepth: 60, angle: -.27 }
};
const turnedFeathers = { x: 384, y: 126, angle: -19 * Math.PI / 180, width: .99, depth: .91 };

function isIvoryNeck(data, byte, x, y, unit) {
  return x >= 358 * unit && x <= 421 * unit && y >= 173 * unit
    && data[byte] - data[byte + 1] > 9
    && data[byte + 1] - data[byte + 2] > 6
    && data[byte] - data[byte + 2] > 20;
}

function drawIvoryHat(body, ids, angle) {
  const { width, height, data } = body;
  const unit = width / 800;
  const matteHeight = Math.ceil(218 * unit);
  const hatHeight = Math.ceil(242 * unit);
  const feather = document.createElement("canvas");
  feather.width = width;
  feather.height = matteHeight;
  const featherPainter = feather.getContext("2d");
  const strands = featherPainter.createImageData(width, matteHeight);
  const torso = featherPainter.createImageData(width, height);
  torso.data.set(data);
  const originalCos = Math.cos(originalBrim.angle);
  const originalSin = Math.sin(originalBrim.angle);

  for (let y = 0; y < matteHeight; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3] || isIvoryNeck(data, i, x, y, unit)) continue;
      const sourceX = x / unit;
      const sourceY = y / unit;
      if (sourceY < 215 && ids[i / 4] !== 1) torso.data[i + 3] = 0;
      if (sourceX < 326 || (sourceY > 145 && sourceX < 493)) continue;
      const dx = sourceX - originalBrim.x;
      const dy = sourceY - originalBrim.y;
      const fromBrim = Math.hypot((originalCos * dx + originalSin * dy) / originalBrim.halfWidth,
        (-originalSin * dx + originalCos * dy) / originalBrim.halfDepth);
      strands.data.set(data.subarray(i, i + 3), i);
      const oldBrimTop = 82 + .0015 * (sourceX - 342) ** 2 + .08 * (sourceX - 342);
      const aboveOldRim = 1 - smoothstep(oldBrimTop - 2, oldBrimTop + 2, sourceY);
      const plume = Math.max(aboveOldRim, smoothstep(486, 501, sourceX));
      strands.data[i + 3] = data[i + 3] * smoothstep(.96, 1.035, fromBrim) * plume;
    }
  }
  featherPainter.putImageData(strands, 0, 0);

  const hat = document.createElement("canvas");
  hat.width = width;
  hat.height = hatHeight;
  const painter = hat.getContext("2d", { willReadFrequently: true });
  // Keep the plume tips inside the frame while moving their attachment with the brim.
  const featherTop = angle === "side" ? 5 : 18;
  const featherRoot = angle === "side" ? 102 : 96;
  painter.translate(0, featherTop * unit);
  painter.scale(1, 1 - ivoryHatLift / (featherRoot - featherTop));
  painter.translate(0, -featherTop * unit);
  if (angle === "side") {
    const projection = turnedFeathers;
    painter.translate(projection.x * unit, projection.y * unit);
    painter.rotate(projection.angle);
    painter.scale(projection.width, projection.depth);
    painter.drawImage(feather, -381 * unit, -107 * unit);
  } else {
    painter.drawImage(feather, 13 * unit, 12 * unit);
  }
  painter.resetTransform();

  // Paint a closed oval under the face, using the old fabric where it is intact.
  const brim = ivoryBrims[angle];
  const cosine = Math.cos(brim.angle);
  const sine = Math.sin(brim.angle);
  const verticalRadius = Math.hypot(sine * brim.halfWidth, cosine * brim.halfDepth) * 1.008;
  const topOfBrim = Math.max(0, Math.floor((brim.y - verticalRadius) * unit));
  const oval = document.createElement("canvas");
  oval.width = width;
  oval.height = hatHeight;
  const ovalPainter = oval.getContext("2d");
  const fabric = ovalPainter.createImageData(width, hatHeight);
  for (let y = topOfBrim; y < hatHeight; y++) {
    const dy = (y + .5) / unit - brim.y;
    for (let x = Math.floor(256 * unit); x < Math.ceil(518 * unit); x++) {
      const dx = (x + .5) / unit - brim.x;
      const u = (cosine * dx + sine * dy) / brim.halfWidth;
      const v = (-sine * dx + cosine * dy) / brim.halfDepth;
      const radius = Math.hypot(u, v);
      const coverage = 1 - smoothstep(.987, 1.008, radius);
      if (!coverage) continue;

      const ox = u * originalBrim.halfWidth;
      const oy = v * originalBrim.halfDepth;
      const sx = Math.round((originalBrim.x + originalCos * ox - originalSin * oy) * unit);
      const sy = Math.round((originalBrim.y + originalSin * ox + originalCos * oy) * unit);
      const index = (sy * width + sx) * 4;
      const rim = 19 * smoothstep(.88, .95, radius);
      const grain = ((x * 7 + y * 13) % 9 - 4) * .48;
      const lining = 209 + 6 * u - 12 * v + rim + grain;
      const source = isIvoryNeck(data, index, sx, sy, unit) ? 0 : data[index + 3] / 255;
      const weave = smoothstep(.3, .94, source) * .64;
      const i = (y * width + x) * 4;
      fabric.data[i] = lining * (1 - weave) + data[index] * weave;
      fabric.data[i + 1] = (lining - 3) * (1 - weave) + data[index + 1] * weave;
      fabric.data[i + 2] = (lining - 6) * (1 - weave) + data[index + 2] * weave;
      fabric.data[i + 3] = coverage * 255;
    }
  }
  ovalPainter.putImageData(fabric, 0, 0);
  painter.drawImage(oval, 0, 0);

  const projection = painter.getImageData(0, 0, width, hatHeight).data;
  const materials = ids.map(id => id === 3 ? 0 : id);
  if (angle === "side") matchIvoryNeckTone(torso, materials, unit);
  for (let p = 0; p < projection.length / 4; p++) {
    const alpha = p * 4 + 3;
    if (projection[alpha] > 15 && torso.data[alpha] < 32) materials[p] = 3;
  }
  oval.height = height;
  oval.getContext("2d").putImageData(torso, 0, 0);
  oval.getContext("2d").globalCompositeOperation = "destination-over";
  oval.getContext("2d").drawImage(hat, 0, 0);
  return { original: oval.getContext("2d").getImageData(0, 0, width, height), ids: materials };
}

function matchIvoryNeckTone({ width, data }, materials, unit) {
  // The starting torso has a head-shaped opening. Extend nearby neck texture underneath
  // the turned jaw so the white brim cannot show through the portrait fade.
  const neckEdges = [[180, 371, 413], [187, 366, 417], [194, 361, 420], [203, 358, 421], [211, 358, 421]];
  const source = data.slice(0, Math.ceil(225 * unit) * width * 4);
  for (let y = Math.floor(180 * unit); y < Math.ceil(292 * unit); y++) {
    const height = (y + .5) / unit;
    const blend = smoothstep(184, 204, height) * (1 - smoothstep(245, 292, height));
    const left = seamAt(neckEdges, height, 1);
    const right = seamAt(neckEdges, height, 2);
    for (let x = Math.ceil(358 * unit); x <= Math.floor(421 * unit); x++) {
      const pixel = y * width + x;
      const i = pixel * 4;
      if (materials[pixel]) continue;
      const skin = data[i + 3] && isIvoryNeck(data, i, x, y, unit);
      if (height < 216) {
        const inset = Math.min((x + .5) / unit - left, right - (x + .5) / unit);
        const coverage = smoothstep(-.7, .9, inset) * smoothstep(180, 187, height)
          * (1 - smoothstep(198, 216, height));
        const sampleX = Math.min(Math.round(414 * unit), Math.max(Math.round(366 * unit), x));
        const sampleY = Math.floor((208 + (height - 180) * .28) * unit);
        const sample = (sampleY * width + sampleX) * 4;
        const added = coverage * source[sample + 3] / 255;
        if (added && isIvoryNeck(source, sample, sampleX, sampleY, unit)) {
          const retained = data[i + 3] / 255 * (1 - added);
          const alpha = retained + added;
          for (let channel = 0; channel < 3; channel++) {
            data[i + channel] = (data[i + channel] * retained + source[sample + channel] * added) / alpha;
          }
          data[i + 3] = alpha * 255;
        }
      }
      if (!skin && (!data[i + 3] || !isIvoryNeck(data, i, x, y, unit))) continue;
      const highlight = Math.max(0, luma(data[i], data[i + 1], data[i + 2]) - 151) * .38;
      data[i] += (2 - highlight) * blend;
      data[i + 1] -= (3 + highlight) * blend;
      data[i + 2] -= (6 + highlight) * blend;
    }
  }
}

function brimOpening(angle, x, y, unit) {
  const brim = ivoryBrims[angle];
  const dx = x / unit - brim.x;
  const dy = y / unit - brim.y;
  const cosine = Math.cos(brim.angle);
  const sine = Math.sin(brim.angle);
  const u = cosine * dx + sine * dy;
  const v = -sine * dx + cosine * dy;
  const lip = -.84 * brim.halfDepth + .00145 * u * u;
  return smoothstep(lip - 2.0, lip + 2.0, v);
}

// Upper edges of the visible shoe leather on the 800 × 1200 sprites.
const footwearEdges = {
  ivory: [
    [[270, 1185], [277, 1174], [289, 1168], [302, 1170], [313, 1177], [320, 1186]],
    [[446, 1186], [455, 1175], [470, 1169], [481, 1169], [491, 1177], [497, 1187]]
  ],
  scarlet: [
    [[280, 1184], [295, 1156], [307, 1142], [318, 1136], [328, 1135],
      [337, 1137], [343, 1141], [350, 1146], [356, 1151], [362, 1157], [369, 1177]],
    [[412, 1180], [432, 1157], [443, 1146], [454, 1139], [464, 1135],
      [473, 1136], [481, 1139], [487, 1144], [492, 1151], [500, 1160], [510, 1184]]
  ],
  peach: [
    [[275, 1184], [286, 1157], [302, 1144], [314, 1145], [334, 1156], [354, 1170], [368, 1186]],
    [[436, 1183], [448, 1163], [466, 1150], [483, 1147], [496, 1154], [514, 1173], [522, 1186]]
  ],
  ink: [
    [[269, 1181], [286, 1154], [301, 1137], [316, 1136], [332, 1147], [343, 1162], [355, 1182]],
    [[425, 1183], [435, 1159], [452, 1142], [478, 1137], [491, 1141], [503, 1159], [518, 1182]]
  ]
};

const denimBootRims = [
  [[292, 998], [300, 997], [306, 995], [313, 997], [322, 998], [328, 996], [333, 992],
    [338, 990], [344, 990], [350, 993], [355, 996], [359, 998], [365, 997], [370, 997]],
  [[411, 1003], [418, 1002], [425, 1000], [432, 1000], [440, 1000], [446, 999], [451, 996],
    [457, 994], [462, 997], [468, 999], [472, 1001], [477, 997], [481, 997], [486, 1001], [492, 1001]]
];

const stripedShoeRims = [
  [[286, 1146], [294, 1145], [300, 1142], [307, 1141], [314, 1140], [322, 1138],
    [329, 1137], [337, 1139], [346, 1141], [354, 1142], [362, 1143]],
  [[424, 1147], [432, 1145], [438, 1144], [445, 1142], [452, 1140], [460, 1139],
    [467, 1138], [475, 1139], [484, 1140], [492, 1143], [500, 1145]]
];

function footwearPixel(look, x, y, data, byte) {
  if (y < (look === "denim" ? 987 : 1126)) return false;
  if (look === "denim" || look === "striped") {
    const rims = look === "denim" ? denimBootRims : stripedShoeRims;
    return y >= seamAt(rims[x < 400 ? 0 : 1], x, 1);
  }
  if (look === "scarlet" && data[byte] > 91 && data[byte] - data[byte + 1] > 48) return false;
  if (look === "peach" && data[byte] > 123 && data[byte] - data[byte + 1] > 23) return false;
  for (const edge of footwearEdges[look] || []) {
    if (x < edge[0][0] || x > edge[edge.length - 1][0]) continue;
    for (let i = 1; i < edge.length; i++) {
      const [right, high] = edge[i];
      if (x > right) continue;
      const [left, low] = edge[i - 1];
      return y >= low + (high - low) * (x - left) / (right - left);
    }
  }
  return false;
}

// Right cheek traced from the approved side portrait, in the original sprite's grid.
const sideCheek = [
  [136, 547.5], [141, 549.2], [147, 549.8], [151, 550.0], [156, 549.4], [160, 550.8], [164, 552.0],
  [168, 553.0], [173, 553.4], [184, 553.8], [191, 553.5],
  [199, 552.2], [208, 551.3], [213, 550.0], [219, 545.7], [224, 543.8]
];

function restoreSideCheek(image, offsetX, offsetY, scale) {
  const { width, height, data } = image;
  const source = data.slice();
  let segment = 1;

  for (let y = 0; y < height; y++) {
    const portraitY = (y + .5 - offsetY) / scale;
    if (portraitY <= 136 || portraitY >= 224) continue;
    while (portraitY > sideCheek[segment][0]) segment++;
    const [y1, x1] = sideCheek[segment - 1];
    const [y2, x2] = sideCheek[segment];
    const tracedX = x1 + (x2 - x1) * (portraitY - y1) / (y2 - y1);
    const tracedEdge = offsetX + tracedX * scale;
    const weight = smoothstep(136, 145, portraitY) * (1 - smoothstep(212, 224, portraitY));
    const row = y * width * 4;
    const scanStart = Math.max(0, Math.floor(offsetX + 538 * scale));
    let solidEdge = Math.min(width - 1, Math.ceil(offsetX + 559 * scale));
    while (solidEdge > scanStart && source[row + solidEdge * 4 + 3] < 235) solidEdge--;
    if (solidEdge === scanStart) continue;

    const cheekStart = Math.max(scanStart, Math.floor(Math.min(solidEdge, tracedEdge) - 5 * scale));
    const rim = Math.min(width - 1, Math.ceil(Math.max(solidEdge, tracedEdge) + 3 * scale));
    for (let x = cheekStart; x <= rim; x++) {
      const i = row + x * 4;
      const alpha = 1 - smoothstep(tracedEdge - .58, tracedEdge + .58, x + .5);
      const withinCheek = Math.min(1, (x - cheekStart) / (tracedEdge - cheekStart));
      const sample = cheekStart + (solidEdge - cheekStart) * withinCheek;
      const a = Math.floor(sample);
      const f = sample - a;
      const added = alpha * weight;
      const retained = source[i + 3] / 255 * (1 - weight);
      const coverage = added + retained;
      data[i + 3] = coverage * 255;
      if (coverage === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const start = row + a * 4 + channel;
        const tone = source[start] * (1 - f) + source[start + 4] * f;
        data[i + channel] = (tone * added + source[i + channel] * retained) / coverage;
      }
    }
  }
}

// Clear the pale matte only where it meets the outside of the hair silhouette.
function clearHairMatte(image, offsetX, offsetY, scale, front) {
  const { width, height, data } = image;
  const source = data.slice();
  for (let y = 0; y < height; y++) {
    const portraitY = (y + .5 - offsetY) / scale;
    if (portraitY > (front ? 155 : 200)) break;
    const sideRim = front ? 0 : smoothstep(150, 156, portraitY) * (1 - smoothstep(192, 200, portraitY));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = source[i + 3];
      if (!alpha) continue;
      const portraitX = (x + .5 - offsetX) / scale;
      const rearRim = portraitX < 446 ? sideRim : 0;
      if (portraitY > 155 && !rearRim) continue;
      if (!front && portraitY > 121 && portraitX > 529) continue;
      if (portraitY > (front ? 123 : 118) && portraitX > (front ? 467 : 460)
        && portraitX < (front ? 552 : 545)) continue;
      const luminance = .26 * source[i] + .55 * source[i + 1] + .19 * source[i + 2];
      if (luminance < 63) continue;

      let distance = 10;
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) {
            distance = Math.min(distance, Math.hypot(dx, dy));
            continue;
          }
          const at = ((y + dy) * width + x + dx) * 4;
          if (source[at + 3] < 54) {
            distance = Math.min(distance, Math.hypot(dx, dy));
          }
        }
      }
      const outerFringe = smoothstep(67, 143, luminance) * (1 - smoothstep(1, 5, distance));
      const trappedMatte = smoothstep(118, 169, luminance) * (1 - smoothstep(5.5, 9.5, distance));
      const rearMatte = rearRim * smoothstep(69, 124, luminance) * (1 - smoothstep(2, 5, distance));
      const remove = Math.max(portraitY <= 155 ? Math.max(outerFringe, trappedMatte) : 0, rearMatte);
      data[i + 3] = alpha * (1 - remove);
      if (remove > 0) {
        const residualMatte = Math.min(.34, remove * .46);
        for (let c = 0; c < 3; c++) data[i + c] *= 1 - residualMatte;
      }
    }
  }
}

function fitHead(sprite, look, angle, body) {
  const front = angle === "front";
  const ivorySide = look === "ivory" && !front;
  const [centerX, centerY, zoom] = headFits[look][angle];
  const anchorX = front ? 512 : 506;
  const anchorY = 225;
  const scale = body.width / 1024;
  const originX = (centerX - anchorX * zoom) * scale;
  const lift = bodyLift(look, body.height);
  const originY = (centerY - anchorY * zoom) * scale - lift;
  const size = zoom * scale;
  const margin = front ? 0 : Math.ceil(12 * size);
  const left = Math.floor(originX + 405 * size) - margin;
  const top = Math.floor(originY + 59 * size) - margin;
  const right = Math.ceil(originX + 586 * size) + margin;
  const bottom = Math.ceil(originY + 264 * size) + margin;
  const layer = document.createElement("canvas");
  layer.width = right - left;
  layer.height = bottom - top;
  const painter = layer.getContext("2d", { willReadFrequently: true });
  painter.drawImage(sprite, originX - left, originY - top, 1024 * size, 1536 * size);
  const image = painter.getImageData(0, 0, layer.width, layer.height);
  clearHairMatte(image, originX - left, originY - top, size, front);
  if (!front) restoreSideCheek(image, originX - left, originY - top, size);
  const head = image.data;
  const pixels = head.slice();
  const cloth = body.data;
  // Match the head's final pose when sampling neck skin and cutting around the collar.
  const tilt = front ? 0 : 8 * Math.PI / 180;
  const cosine = Math.cos(tilt), sine = Math.sin(tilt);
  const neckX = centerX * scale - left;
  const neckY = centerY * scale - lift - top;
  const unit = body.width / 800;

  for (let y = 0; y < layer.height; y++) {
    const sourceY = (top + y + .5 - originY) / size;
    for (let x = 0; x < layer.width; x++) {
      const i = (y * layer.width + x) * 4;
      // Keep the chin and its shadow intact while tapering the skin below the jaw.
      const sourceX = (left + x + .5 - originX) / size;
      const fromChin = sourceX - (front ? 513 : 531);
      const jaw = (front ? 236 : 226) - .27 * Math.abs(fromChin) - .0018 * fromChin ** 2;
      const underJaw = sourceY - jaw;
      const taper = (look === "ink" ? .12 : .07) * smoothstep(6, 23, underJaw);
      if (taper) {
        const sample = Math.max(0, Math.min(layer.width - 1, x + (sourceX - anchorX) * taper * size));
        const start = Math.floor(sample);
        const a = (y * layer.width + start) * 4;
        const b = (y * layer.width + Math.ceil(sample)) * 4;
        const t = sample - start;
        const alpha = pixels[a + 3] * (1 - t) + pixels[b + 3] * t;
        head[i + 3] = alpha;
        if (alpha > 0) {
          for (let channel = 0; channel < 3; channel++) {
            head[i + channel] = (pixels[a + channel] * pixels[a + 3] * (1 - t)
              + pixels[b + channel] * pixels[b + 3] * t) / alpha;
          }
        }
      }
      if (head[i + 3] === 0) continue;
      const dx = x + .5 - neckX;
      const dy = y + .5 - neckY;
      const bodyX = front ? left + x + .5 : left + neckX + dx * cosine - dy * sine;
      const bodyY = front ? top + y + .5 : top + neckY + dx * sine + dy * cosine;
      const pixel = (Math.floor(bodyY) * body.width + Math.floor(bodyX)) * 4;
      const red = cloth[pixel], green = cloth[pixel + 1], blue = cloth[pixel + 2];
      const bodyAlpha = cloth[pixel + 3] / 255;
      const skin = bodyAlpha * smoothstep(6, 24, red - blue)
        * smoothstep(-2, 18, red - green) * smoothstep(-1, 18, green - blue);
      if (ivorySide) {
        // Match the two skin tones in the overlap while keeping the jaw's contact shadow.
        const portraitLuma = luma(head[i], head[i + 1], head[i + 2]);
        const neckLuma = luma(red, green, blue);
        const shadow = 14 * (1 - smoothstep(4, 24, underJaw));
        const correction = Math.max(0, neckLuma - portraitLuma - shadow)
          * smoothstep(-7, 10, underJaw) * skin;
        head[i] += correction * .86;
        head[i + 1] += correction;
        head[i + 2] += correction * 1.07;
      }
      // Blend sampled skin color across the upper neck while carrying the original throat detail.
      const tint = skin * (front ? .66 * smoothstep(6, 23, underJaw) : .74 * smoothstep(-2, 34, underJaw));
      head[i] += (red - head[i]) * tint;
      head[i + 1] += (green - head[i + 1]) * tint;
      head[i + 2] += (blue - head[i + 2]) * tint;
      let fade = smoothstep(front ? 6 : 1, front ? 24 : 37, underJaw);
      if (ivorySide) {
        // Overlap with real neck skin can end earlier. Keep the portrait opaque over the hat brim.
        const overNeck = smoothstep(.30, .78, skin);
        const softEdge = smoothstep(14, 36, underJaw);
        fade = softEdge + (smoothstep(-1, 21, underJaw) - softEdge) * overNeck;
        fade += (1 - fade) * smoothstep(203, 223, bodyY / unit);
      }
      head[i + 3] *= 1 - fade * (.45 + .55 * Math.max(skin, bodyAlpha * (1 - skin)));

      if (look === "ink") {
        const collarY = (bodyY + lift) / unit;
        const collarX = bodyX / unit;
        const inset = Math.min(collarX - seamAt(inkNeckOpening, collarY, 1),
          seamAt(inkNeckOpening, collarY, 2) - collarX);
        const collarFade = front ? smoothstep(-1, 13, underJaw) : smoothstep(5, 17, underJaw);
        head[i + 3] *= 1 - collarFade * (1 - smoothstep(-1.2, 1.2, inset));
      }

      if (look === "scarlet" && sourceY >= 208) {
        const collarY = (bodyY + lift) / scale;
        const darkCollar = 1 - smoothstep(55, 111, Math.max(red, green, blue));
        const redLapel = smoothstep(54, 80, red - green);
        const collarEdge = smoothstep(227, 244, collarY) * (1 - smoothstep(309, 329, collarY));
        const belowChin = smoothstep(1, 8, underJaw);
        head[i + 3] *= 1 - belowChin * collarEdge * smoothstep(.15, .72, bodyAlpha)
          * Math.max(darkCollar, redLapel);
      }

      if (front && look === "ivory") {
        head[i + 3] *= brimOpening(angle, left + x + .5, top + y + .5, body.width / 800);
      }
    }
  }

  painter.putImageData(image, 0, 0);
  if (front) return { layer, left, top, crown: top + opaqueEdge(image) };

  const portrait = document.createElement("canvas");
  portrait.width = layer.width;
  portrait.height = layer.height;
  const rotated = portrait.getContext("2d", { willReadFrequently: true });
  // Anchor at the collar so the head tilts without separating from the neckline.
  rotated.translate(neckX, neckY);
  rotated.rotate(tilt);
  rotated.drawImage(layer, -neckX, -neckY);
  rotated.resetTransform();
  const posed = rotated.getImageData(0, 0, portrait.width, portrait.height);
  if (look === "ivory") {
    for (let y = 0; y < portrait.height; y++) {
      for (let x = 0; x < portrait.width; x++) {
        const alpha = (y * portrait.width + x) * 4 + 3;
        posed.data[alpha] *= brimOpening(angle, left + x + .5, top + y + .5, body.width / 800);
      }
    }
    rotated.putImageData(posed, 0, 0);
  }
  return { layer: portrait, left, top, crown: top + opaqueEdge(posed) };
}
