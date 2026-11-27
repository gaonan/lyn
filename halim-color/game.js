const looks = [
  { id: "striped", name: "玄素", tone: "#25252b", parts: ["外套深色", "外套浅纹", "马甲", "直筒裤", "皮鞋"] },
  { id: "ivory", name: "白羽", tone: "#e1dbd3", parts: ["外套", "长裤", "羽帽", "皮鞋"] },
  { id: "scarlet", name: "红韶", tone: "#b41f31", parts: ["长外套", "长裤", "衬衣", "领带", "皮鞋"] },
  { id: "ink", name: "黑曜", tone: "#282630", parts: ["长外套", "长裤", "绯红里衬", "马甲", "皮鞋"] },
  { id: "peach", name: "桃雾", tone: "#d88f82", parts: ["上衣", "长裤", "皮鞋"] },
  { id: "denim", name: "洗蓝", tone: "#23567d", parts: ["牛仔外套", "牛仔裤", "长靴"] },
];
const fabricFinishes = new Map([
  ["mist-blue", { label: "雾海蓝渐变", colors: ["#bed1dd", "#7698ae", "#365b7c"] }],
  ["rose-violet", { label: "烟霞紫渐变", colors: ["#e1bcb9", "#af829b", "#665477"] }],
  ["celadon-green", { label: "青瓷绿渐变", colors: ["#c8d7b9", "#83a58d", "#426860"] }],
  ["amber-rose", { label: "茶霞棕渐变", colors: ["#e4c5a7", "#bd8c73", "#774f56"] }],
  ["starlight-gold", { label: "星光金", colors: ["#79521e", "#cba04c", "#ffe5a5"], metal: "gold" }],
  ["bright-silver", { label: "亮银", colors: ["#586579", "#bcc6d0", "#f5f8ff"], metal: "silver" }],
]);
const swatches = [
  ["黄河琉璃", "#d9ae84"], ["荔色", "#8f292c"], ["麦绿", "#acb8a4"], ["青冥", "#3d5779"],
  ["正青", "#8da19b"], ["姜红", "#d6aaa4"], ["官绿", "#274d22"], ["紫罗兰", "#6c5fa0"],
  ...Array.from(fabricFinishes, ([key, finish]) => [finish.label, key]),
];
const asset = name => (window.halimAssets || {})[name] || "assets/" + name;
const byId = id => document.getElementById(id);
const canvas = byId("body");
const width = canvas.width;
const height = canvas.height;
const ctx = canvas.getContext("2d");
const figure = document.createElement("canvas");
figure.width = width;
figure.height = height;
const figurePainter = figure.getContext("2d");
const fittedFigure = document.createElement("canvas");
fittedFigure.width = width;
fittedFigure.height = height;
const fittedPainter = fittedFigure.getContext("2d");
const stage = document.querySelector(".stage");
const fabricGlints = byId("fabric-glints");
let goldGlintKey = "";
const angleFog = byId("angle-fog");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const scale = byId("scale");
const controls = [...document.querySelectorAll("#base-color, #pattern-color, #scale, #patterns button, #restore-part")];
const defaultPaint = { color: null, pattern: "original", thread: "#e9d6b2", scale: 100 };
const storageKey = "carnation.halim-color.v2";
const oldStorageKey = "carnation.halim-color.v1";
const oldPartOrder = { denim: [0, 1, 3], scarlet: [0, 1, 2, 2, 3], peach: [0, 1, 3] };
const patterns = ["original", "check", "plaid", "stripe"];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const rgb = color => color.match(/\w\w/g).map(pair => parseInt(pair, 16));
const isColor = value => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const isEdited = paint => Boolean(paint.color) || paint.pattern !== "original";
let drafts = {};
const histories = {};
let wallView;
if (new URLSearchParams(location.search).get("from-wall") === "1") {
  try { wallView = JSON.parse(sessionStorage.getItem("carnation7-palette-wall-view")); } catch {}
}
let selected = looks[0], part = 0, angle = wallView?.angle === "front" ? "front" : "side", comparing = false;
let shownAngle = angle, fogAnimation, angleSwapTimer;
let active = null, loadVersion = 0, frame = 0;
const cache = new Map();
let facesPromise;
const colorPicker = createColorPicker((key, color, firstEdit) => changePaint({ [key]: color }, firstEdit));

try {
  const current = localStorage.getItem(storageKey);
  const saved = JSON.parse(current || localStorage.getItem(oldStorageKey) || "{}");
  for (const look of looks) {
    const source = saved.drafts?.[look.id];
    drafts[look.id] = look.parts.map((_, index) => {
      const stored = source?.[current ? index : oldPartOrder[look.id]?.[index] ?? index];
      return {
        color: isColor(stored?.color) || fabricFinishes.has(stored?.color) ? stored.color : null,
        pattern: patterns.includes(stored?.pattern) ? stored.pattern : "original",
        thread: isColor(stored?.thread) ? stored.thread : defaultPaint.thread,
        scale: Number.isFinite(stored?.scale) ? clamp(stored.scale, 65, 185) : 100
      };
    });
  }
  selected = looks.find(look => look.id === saved.selected) || selected;
} catch {
  drafts = {};
}

function saveDraft() {
  try { localStorage.setItem(storageKey, JSON.stringify({ drafts, selected: selected.id })); } catch {}
}

function status(message) { byId("status").textContent = message; }

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(name));
    img.src = asset(name);
  });
}

function loadFaces() {
  facesPromise ??= Promise.all([loadImage("face-front.png"), loadImage("face-side.png")]).catch(error => {
    facesPromise = null;
    throw error;
  });
  return facesPromise;
}

async function loadLook(look) {
  if (cache.has(look.id)) return cache.get(look.id);
  const [body, mask, [front, side]] = await Promise.all([
    loadImage(look.id + ".png"), loadImage(look.id + "-mask.png"), loadFaces()
  ]);
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const reader = buffer.getContext("2d", { willReadFrequently: true });
  drawFittedBody(reader, body, look.id, width, height);
  const original = reader.getImageData(0, 0, width, height);
  reader.clearRect(0, 0, width, height);
  reader.imageSmoothingEnabled = false;
  drawFittedBody(reader, mask, look.id, width, height);
  const maskPixels = reader.getImageData(0, 0, width, height).data;
  const ids = new Uint8Array(width * height);
  const bins = look.parts.map(() => new Uint32Array(256));
  const counts = look.parts.map(() => 0);
  const rowBounds = look.parts.map(() => [height, 0]);
  const unit = width / 800;
  for (let pixel = 0; pixel < ids.length; pixel++) {
    const i = pixel * 4;
    if (original.data[i + 3] < 8) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const atlasX = (x + .5) / unit;
    const atlasY = sourceClothingY(look.id, y + .5, height) / unit;
    const slot = footwearPixel(look.id, atlasX, atlasY, original.data, i)
      ? look.parts.length : garmentPart(look.id, atlasX, atlasY, original.data[i],
        original.data[i + 1], original.data[i + 2], Math.round(maskPixels[i] / 50));
    if (!slot) {
      softenHandSkin(original.data, i, atlasX, atlasY);
      continue;
    }
    if (slot > look.parts.length) continue;
    if (look.id === "ivory" && slot === 3
      && isIvoryNeck(original.data, i, x, y, unit)) continue;
    ids[pixel] = slot;
    const value = Math.round(luma(original.data[i], original.data[i + 1], original.data[i + 2]));
    bins[slot - 1][value]++;
    counts[slot - 1]++;
    const bounds = rowBounds[slot - 1];
    bounds[0] = Math.min(bounds[0], y);
    bounds[1] = Math.max(bounds[1], y);
  }
  drapeTrouserHems(original, ids, look.id, look.parts.length);
  const measures = bins.map((values, slot) => {
    function quantile(q) {
      const stop = counts[slot] * q;
      let running = 0;
      for (let value = 0; value < 256; value++) {
        running += values[value];
        if (running >= stop) return value;
      }
      return 0;
    }
    const mid = quantile(.5);
    const [top, bottom] = rowBounds[slot];
    return { mid, spread: Math.max(25, quantile(.9) - quantile(.1)), top, bottom };
  });
  const hats = look.id === "ivory" ? {
    front: drawIvoryHat(original, ids, "front"),
    side: drawIvoryHat(original, ids, "side")
  } : null;
  const heads = {
    front: fitHead(front, look.id, "front", hats?.front.original || original),
    side: fitHead(side, look.id, "side", hats?.side.original || original)
  };
  const sole = opaqueEdge(original, true);
  const placement = standingPlacement(look.id, heads.side.crown, sole, width);
  const feet = placement.y + (sole + 1) * placement.scale;
  const model = { original, ids, measures, heads, placement, feet, hats, output: ctx.createImageData(width, height) };
  if (cache.size >= 2) cache.delete(cache.keys().next().value);
  cache.set(look.id, model);
  return model;
}

function press(group, value) {
  for (const button of group.children) button.setAttribute("aria-pressed", String(button.value === String(value)));
}

function makeButton(label, value, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.value = value;
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function looksUI() {
  const holder = byId("looks");
  for (const look of looks) {
    const button = makeButton(look.name, look.id, "look", () => selectLook(look));
    const preview = document.createElement("span");
    preview.className = "look-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.style.setProperty("--preview", 'url("' + asset(look.id + "-thumb.png") + '")');
    button.prepend(preview);
    holder.append(button);
  }
  const palette = byId("palette");
  for (const [label, color] of swatches) {
    const button = makeButton("", color, "swatch", () => changePaint({ color }));
    button.title = label;
    button.setAttribute("aria-label", label);
    const finish = fabricFinishes.get(color);
    button.style.setProperty("--swatch", finish?.colors[1] || color);
    if (finish) {
      const [start, middle, end] = finish.colors;
      const gleam = finish.metal
        ? `radial-gradient(circle at 68% 28%, ${end} 0 1px, transparent 2.5px),
           radial-gradient(circle at 34% 66%, ${end} 0 .8px, transparent 2px), `
        : "";
      const gradient = finish.metal
        ? `linear-gradient(142deg, ${start}, ${middle} 26%, ${end} 46%, ${middle} 65%, ${start})`
        : `linear-gradient(160deg, ${start}, ${middle}, ${end})`;
      button.style.setProperty("--swatch-image", gleam + gradient);
    }
    palette.append(button);
  }
}

function syncControls() {
  const paint = drafts[selected.id][part];
  press(byId("looks"), selected.id);
  press(byId("parts"), part);
  press(byId("patterns"), paint.pattern);
  press(byId("angles"), angle);
  press(byId("palette"), paint.color);
  byId("compare").setAttribute("aria-pressed", String(comparing));
  byId("compare").textContent = comparing ? "回到涂色" : "看原色";
  const pickerColor = fabricFinishes.get(paint.color)?.colors[1] || paint.color || selected.tone;
  colorPicker.sync({ color: pickerColor, thread: paint.thread }, selected.id + ":" + part, {
    color: Boolean(active),
    thread: Boolean(active && paint.pattern !== "original" && part !== selected.parts.length - 1)
  });
  scale.value = paint.scale;
  byId("pattern-settings").hidden = paint.pattern === "original";
  byId("pattern-section").hidden = part === selected.parts.length - 1;
  controls.forEach(control => { control.disabled = !active; });
  byId("restore-part").disabled = !active || !isEdited(paint);
  byId("undo").disabled = !active || !histories[selected.id]?.length;
  byId("reset").disabled = !active || !drafts[selected.id].some(isEdited);
  byId("save").disabled = !active;
  byId("compare").disabled = !active;
}

async function selectLook(look) {
  stopAngleFog();
  shownAngle = angle;
  const version = ++loadVersion;
  selected = look;
  active = null;
  part = 0;
  comparing = false;
  drafts[look.id] ||= look.parts.map(() => ({ ...defaultPaint }));
  byId("stage-name").textContent = look.name;
  byId("parts").replaceChildren(...look.parts.map((name, index) =>
    makeButton(name, index, "", () => selectPart(index))));
  ctx.clearRect(0, 0, width, height);
  fabricGlints.replaceChildren();
  goldGlintKey = "";
  syncControls();
  status("正在铺开布料…");
  try {
    const model = await loadLook(look);
    if (version !== loadVersion) return;
    active = model;
    syncControls();
    saveDraft();
    render();
    status("点衣料或用布片按钮，选一处开始。");
  } catch {
    if (version !== loadVersion) return;
    status("这套服装暂时没加载出来，点服装卡片重试。");
  }
}

function selectPart(index) {
  part = index;
  syncControls();
}

function checkpoint() {
  const list = histories[selected.id] ||= [];
  list.push(drafts[selected.id].map(paint => ({ ...paint })));
  if (list.length > 35) list.shift();
}

function changePaint(patch, remember = true) {
  if (!active) return;
  const paint = drafts[selected.id][part];
  if (Object.keys(patch).every(key => paint[key] === patch[key])) return;
  if (remember) checkpoint();
  Object.assign(paint, patch);
  comparing = false;
  syncControls();
  saveDraft();
  queueRender();
}

function blendAmount(type, x, y, pitch, fold) {
  const warp = x + fold * pitch * .16 + (y - height * .49) * (x - width * .5) * .00013;
  const weft = y + (x - width * .5) ** 2 * .00045 + fold * pitch * .055;
  const dist = line => Math.abs(line / pitch - Math.round(line / pitch));
  const vertical = dist(warp);
  if (type === "stripe") return clamp((.09 - vertical) * 17, 0, .66);
  const horizontal = dist(weft);
  if (type === "check") return clamp((.105 - Math.min(vertical, horizontal)) * 12, 0, .52)
    + (vertical < .08 && horizontal < .08 ? .15 : 0);
  return (vertical < .19 ? .25 : 0) + (horizontal < .19 ? .25 : 0)
    + (vertical < .041 || horizontal < .041 ? .17 : 0);
}

function currentMaterials() {
  return active.hats?.[shownAngle] || active;
}

function syncGoldGlints(paints, ids, portrait) {
  const slots = comparing ? 0 : paints.reduce((mask, paint, index) =>
    paint.color === "starlight-gold" ? mask | (1 << index) : mask, 0);
  const key = slots ? `${selected.id}:${shownAngle}:${slots}` : "";
  if (key === goldGlintKey) return;
  goldGlintKey = key;
  if (!slots) {
    fabricGlints.replaceChildren();
    return;
  }

  const points = [];
  for (let row = 18; row < height - 18; row += 31) {
    for (let column = 18; column < width - 18; column += 29) {
      const seed = Math.imul((column ^ Math.imul(row, 83047)) >>> 0, 0x45d9f3b) >>> 0;
      const x = column + (seed & 15) - 7;
      const y = row + ((seed >>> 7) & 15) - 7;
      const pixel = y * width + x;
      const slot = ids[pixel];
      if (!slot || !(slots & (1 << (slot - 1)))) continue;
      if (ids[pixel - 6] !== slot || ids[pixel + 6] !== slot
        || ids[pixel - width * 6] !== slot || ids[pixel + width * 6] !== slot) continue;
      if (x >= portrait.left && x < portrait.left + portrait.layer.width
        && y >= portrait.top && y < portrait.top + portrait.layer.height) continue;
      points.push({ x, y, seed });
    }
  }
  points.sort((a, b) => a.seed - b.seed);
  const placement = active.placement;
  fabricGlints.replaceChildren(...points.slice(0, 15).map(({ x, y, seed }) => {
    const row = y - y % fittedRowHeight;
    const fittedWidth = fittedFigureWidth(selected.id, shownAngle, row, height);
    const fittedX = width / 2 + (x - width / 2) * fittedWidth;
    const glint = document.createElement("i");
    glint.style.setProperty("--x", `${(placement.x + fittedX * placement.scale) / width * 100}%`);
    glint.style.setProperty("--y", `${(placement.y + y * placement.scale) / height * 100}%`);
    glint.style.setProperty("--size", `${4 + ((seed >>> 8) & 3)}px`);
    glint.style.setProperty("--d", `${3.2 + ((seed >>> 16) & 15) * .15}s`);
    glint.style.setProperty("--delay", `${-((seed >>> 23) & 31) * .14}s`);
    return glint;
  }));
}

function render() {
  frame = 0;
  if (!active) return;
  const materials = currentMaterials();
  const paint = drafts[selected.id];
  const fabric = comparing || !paint.some(isEdited) ? materials.original : tintFabric(paint, materials);
  figurePainter.putImageData(fabric, 0, 0);
  const portrait = active.heads[shownAngle];
  const { layer, left, top } = portrait;
  figurePainter.drawImage(layer, left, top);
  if (selected.id === "ink" && shownAngle === "front") finishInkFrontCollar(figurePainter, fabric);

  const source = fitFigure(fittedPainter, figure, selected.id, shownAngle);
  const { x, y, scale } = active.placement;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, x, y, width * scale, height * scale);
  syncGoldGlints(paint, materials.ids, portrait);
}

function gradientRows(colors, top, bottom) {
  const stops = colors.map(rgb);
  const rows = new Float32Array(height * 3);
  const span = Math.max(1, bottom - top);
  for (let y = 0; y < height; y++) {
    const position = clamp((y - top) / span, 0, 1) * 2;
    const segment = Math.min(1, Math.floor(position));
    const blend = position - segment;
    for (let channel = 0; channel < 3; channel++) {
      const start = stops[segment][channel];
      rows[y * 3 + channel] = start + (stops[segment + 1][channel] - start) * blend;
    }
  }
  return rows;
}

function metalSparkle(x, y, metal) {
  const cell = Math.imul(x >> 3, 73856093) ^ Math.imul(y >> 3, 19349663);
  const seed = Math.imul(cell ^ (cell >>> 15), 0x45d9f3b) >>> 0;
  const chance = seed & 255;
  if (chance > (metal === "gold" ? 120 : 56)) return 0;
  const dx = Math.abs((x & 7) - (2 + ((seed >>> 9) & 3)));
  const dy = Math.abs((y & 7) - (2 + ((seed >>> 15) & 3)));
  if (dx + dy === 0) return chance < 20 ? .96 : .75;
  if (chance < 20 && (dx === 0 || dy === 0) && dx + dy < 4) {
    return .68 - .15 * (dx + dy);
  }
  return dx + dy <= 2 ? .23 / (dx + dy) : 0;
}

function tintFabric(paints, { original, ids }) {
  const { measures, output } = active;
  const inks = paints.map((paint, slot) => {
    if (!isEdited(paint)) return null;
    const finish = fabricFinishes.get(paint.color);
    const color = paint.color ? rgb(finish?.colors[1] || paint.color) : null;
    const { top, bottom } = measures[slot];
    const gradient = finish && !finish.metal ? gradientRows(finish.colors, top, bottom) : null;
    const highlight = finish?.metal ? rgb(finish.colors[2]) : null;
    const thread = rgb(paint.thread);
    const pitch = (paint.pattern === "plaid" ? 49 : 24) * paint.scale / 100;
    return { ...paint, ...measures[slot], color, thread, pitch, gradient, highlight, metal: finish?.metal };
  });
  const source = original.data;
  const pixels = output.data;
  pixels.set(source);
  for (let p = 0; p < ids.length; p++) {
    const ink = inks[ids[p] - 1];
    if (!ink) continue;
    const i = p * 4;
    const value = luma(source[i], source[i + 1], source[i + 2]);
    const fold = clamp((value - ink.mid) / ink.spread, -1.55, 1.55);
    const x = p % width, y = Math.floor(p / width);
    const amount = ink.pattern === "original" ? 0 : blendAmount(ink.pattern, x, y, ink.pitch, fold);
    const detail = value - ink.mid;
    const band = ink.metal ? clamp(1 - Math.abs(x / width - .47 - (y / height - .52) * .24) / .27, 0, 1) : 0;
    const grain = ink.metal ? ((Math.imul(p ^ (p >>> 7), 0x27d4eb2d) >>> 25) / 127 - .5) * .22 : 0;
    const softerGold = ink.metal === "gold";
    const shimmer = ink.metal ? Math.max(metalSparkle(x, y, ink.metal), .23 * band ** 3) * (softerGold ? .7 : 1) : 0;
    let lighting = Math.max(.11, 1 + (ink.gradient ? .42 : .54) * fold);
    if (ink.metal) lighting = softerGold
      ? clamp(.76 + .32 * fold + .34 * band ** 2 + grain, .38, 1.22)
      : clamp(.78 + .38 * fold + .47 * band ** 2 + grain, .38, 1.38);
    for (let channel = 0; channel < 3; channel++) {
      const base = ink.gradient ? ink.gradient[y * 3 + channel] : ink.color?.[channel];
      const shade = ink.color
        ? base * lighting + detail * .21 + (source[i + channel] - value) * .21
        : source[i + channel];
      const reflected = ink.highlight ? shade * (1 - shimmer) + ink.highlight[channel] * shimmer : shade;
      const dyedThread = ink.thread[channel] * Math.max(.08, 1 + .62 * fold) + detail * .24;
      const fiber = (p % 3 === 0 ? -2 : 1) * amount;
      pixels[i + channel] = reflected * (1 - amount) + dyedThread * amount + fiber;
    }
  }
  return output;
}

function queueRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function connectLiveInput(input, key, parse) {
  let editing = false;
  input.addEventListener("input", () => {
    if (!active) return;
    if (!editing) checkpoint();
    editing = true;
    changePaint({ [key]: parse(input.value) }, false);
  });
  input.addEventListener("change", () => {
    changePaint({ [key]: parse(input.value) }, !editing);
    editing = false;
  });
  input.addEventListener("blur", () => { editing = false; });
}

canvas.addEventListener("click", event => {
  if (!active) return;
  const rect = canvas.getBoundingClientRect();
  const placement = active.placement;
  const y = Math.floor(((event.clientY - rect.top) * height / rect.height - placement.y) / placement.scale);
  if (y < 0 || y >= height) return;
  const row = y - y % fittedRowHeight;
  const fittedWidth = fittedFigureWidth(selected.id, shownAngle, row, height);
  const fittedX = ((event.clientX - rect.left) * width / rect.width - placement.x) / placement.scale;
  const x = Math.floor(width / 2 + (fittedX - width / 2) / fittedWidth);
  if (x < 0 || x >= width) return;
  const hit = currentMaterials().ids[y * width + x];
  if (hit) selectPart(hit - 1);
});
byId("patterns").addEventListener("click", event => {
  if (event.target instanceof HTMLButtonElement) changePaint({ pattern: event.target.value });
});
connectLiveInput(scale, "scale", Number);
byId("restore-part").addEventListener("click", () => changePaint(defaultPaint));
byId("undo").addEventListener("click", () => {
  const previous = histories[selected.id]?.pop();
  if (!previous) return;
  drafts[selected.id] = previous;
  comparing = false;
  syncControls();
  saveDraft();
  queueRender();
  status("已撤销刚才的修改。");
});
byId("reset").addEventListener("click", () => {
  checkpoint();
  drafts[selected.id] = selected.parts.map(() => ({ ...defaultPaint }));
  comparing = false;
  syncControls();
  saveDraft();
  queueRender();
  status("已还原这整套的原色与布纹。");
});
byId("compare").addEventListener("click", () => {
  comparing = !comparing;
  syncControls();
  queueRender();
});

function stopAngleFog() {
  clearTimeout(angleSwapTimer);
  fogAnimation?.cancel();
  fogAnimation = null;
}

function showSelectedAngle() {
  shownAngle = angle;
  if (active) queueRender();
}

byId("angles").addEventListener("click", event => {
  if (!(event.target instanceof HTMLButtonElement) || event.target.value === angle) return;
  stopAngleFog();
  angle = event.target.value;
  press(byId("angles"), angle);
  if (shownAngle === angle) return;
  if (!active || reducedMotion.matches) {
    showSelectedAngle();
    return;
  }
  const duration = 2000;
  fogAnimation = angleFog.animate([
    { opacity: 0, transform: "translateX(-13%) scale(.93)", easing: "ease-in-out" },
    { opacity: .98, transform: "translateX(0) scale(1)", offset: .45 },
    { opacity: .98, transform: "translateX(2%) scale(1.03)", offset: .55, easing: "ease-out" },
    { opacity: 0, transform: "translateX(14%) scale(1.10)" }
  ], duration);
  angleSwapTimer = setTimeout(showSelectedAngle, duration / 2);
});
reducedMotion.addEventListener("change", () => {
  if (!reducedMotion.matches) return;
  stopAngleFog();
  showSelectedAngle();
});

const stageBackdrops = {
  carnation: "scene-carnation-walkway.jpg", secret: "scene-secret.jpg", warm: "scene-warm-halo.webp"
};
const goldPoints = [[14,27,2],[25,58,1],[33,16,2],[35,71,1],[20,45,2],[75,29,2],
  [83,53,1],[88,67,2],[68,18,1],[77,76,2],[58,25,1],[61,69,1],
  [11,63,1],[22,19,1],[28,81,2],[41,49,1],[65,40,2],[81,15,1],[92,36,2],[73,56,1]];
const sceneImage = byId("scene-image");
const dust = byId("gold-dust");
for (const [i, [x, y, radius]] of goldPoints.entries()) {
  const spark = document.createElement("i");
  spark.style.setProperty("--x", x + "%");
  spark.style.setProperty("--y", y + "%");
  spark.style.setProperty("--r", (radius + 1) + "px");
  spark.style.setProperty("--d", (7 + i % 6) + "s");
  spark.style.setProperty("--delay", -(i * .73 % 9) + "s");
  spark.style.setProperty("--drift", (i % 2 ? 16 : -13) + "px");
  dust.append(spark);
}

function setStage(mode) {
  const filename = stageBackdrops[mode];
  sceneImage.hidden = !filename;
  if (filename && sceneImage.getAttribute("src") !== asset(filename)) sceneImage.src = asset(filename);
  stage.dataset.light = mode;
}

function paintStage(painter, width, height, feetY) {
  const mode = stage.dataset.light;
  const sky = getComputedStyle(stage);
  const glow = painter.createRadialGradient(width / 2, height * .43, 52, width / 2, height * .50, width * .81);
  glow.addColorStop(0, sky.getPropertyValue("--haze").trim());
  glow.addColorStop(1, sky.getPropertyValue("--base").trim());
  painter.fillStyle = glow;
  painter.fillRect(0, 0, width, height);
  const backdropReady = !sceneImage.hidden && sceneImage.complete && sceneImage.naturalWidth;
  if (backdropReady && mode === "warm") {
    painter.save();
    painter.globalCompositeOperation = "screen";
    painter.globalAlpha = .83;
    painter.drawImage(sceneImage, 0, 0, width, height);
    painter.restore();
  } else if (backdropReady) {
    const focus = mode === "secret" ? .79 : .66;
    const boxHeight = mode === "secret" ? feetY / focus : height;
    const cover = Math.max(width / sceneImage.naturalWidth, boxHeight / sceneImage.naturalHeight);
    const w = sceneImage.naturalWidth * cover;
    const h = sceneImage.naturalHeight * cover;
    painter.drawImage(sceneImage, (width - w) / 2, (boxHeight - h) * focus, w, h);
  }
  if (mode === "warm") {
    painter.fillStyle = "#ffe59c86";
    for (const [x, y, radius] of goldPoints) {
      painter.beginPath();
      painter.arc(x / 100 * width, y / 100 * height, radius, 0, Math.PI * 2);
      painter.fill();
    }
  }
}

byId("light").addEventListener("change", event => setStage(event.target.value));
const stageSelect = byId("light");
if (Array.from(stageSelect.options).some(option => option.value === wallView?.light)) {
  stageSelect.value = wallView.light;
}
setStage(stageSelect.value);

function captureFilmStage() {
  const shot = document.createElement("canvas");
  shot.width = 1504;
  shot.height = 704;
  const painter = shot.getContext("2d");
  const imageHeight = shot.height * .87;
  const imageWidth = imageHeight * width / height;
  const left = (shot.width - imageWidth) / 2;
  const feetY = shot.height - 15;
  const top = feetY - imageHeight * active.feet / height;
  paintStage(painter, shot.width, shot.height, feetY);
  painter.drawImage(canvas, left, top, imageWidth, imageHeight);
  return shot;
}

byId("save").addEventListener("click", async () => {
  if (!active) return;
  if (!sceneImage.hidden) await sceneImage.decode().catch(() => {});
  if (!active) return;
  if (frame) cancelAnimationFrame(frame);
  render();
  const keepsake = byId("record-finale");
  if (keepsake) {
    if (!keepsake.open) document.dispatchEvent(new CustomEvent("palette-keepsake", { detail: captureFilmStage() }));
    return;
  }
  const print = document.createElement("canvas");
  print.width = 1000;
  print.height = 1400;
  const painter = print.getContext("2d");
  const imageWidth = 850, imageHeight = 1275, left = 75, top = 60;
  paintStage(painter, print.width, print.height, top + imageHeight * standingFloor / height);
  painter.fillStyle = "#fff2e3";
  painter.font = '36px "Microsoft YaHei", sans-serif';
  painter.fillText(selected.name, 45, 65);
  painter.drawImage(canvas, left, top, imageWidth, imageHeight);
  const filename = selected.name + (comparing ? "-原色" : "-留影") + ".png";
  print.toBlob(blob => {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    status("已保存舞台留影。");
  });
});

looksUI();
selectLook(selected);
