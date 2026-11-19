import { keepsakeText, paintCreatorCredit, shareImage, textLines } from './keepsake.js?v=20261120-r86';

const WIDTH = 2048;
const BASE_HEIGHT = 640;
const UPPER_BAND = 88;
const CEILING_BANDS = 368;
const HEIGHT = BASE_HEIGHT + UPPER_BAND + CEILING_BANDS;
const TOP_ROW = [
  [870, 37, 149], [1388, 32, 172], [467, 45, 170], [1788, 38, 177],
  [257, 29, 174], [1192, 52, 163], [1579, 44, 172], [54, 47, 173],
  [1034, 37, 135], [673, 30, 165],
];
// These positions keep clear of the descending stairs, album and personal plaque.
const LOWER_POSITIONS = [
  [888, 275, 130], [1386, 342, 165], [466, 53, 164], [1796, 226, 180],
  [1040, 285, 143], [1590, 52, 174], [673, 182, 163], [1190, 350, 177],
  [54, 43, 174], [1389, 38, 156], [864, 200, 149], [1774, 449, 181],
  [1212, 236, 148], [670, 37, 171], [1593, 345, 168], [1037, 35, 133],
  [1380, 553, 180], [258, 34, 171], [1582, 242, 176], [666, 113, 172],
  [1045, 190, 136], [1800, 36, 183], [63, 96, 163], [1403, 108, 158],
  [875, 119, 149], [1192, 142, 169], [1597, 128, 175], [1823, 104, 160],
  [265, 92, 155], [1052, 376, 129], [868, 49, 148], [1033, 112, 139],
  [1392, 239, 174], [1600, 558, 178], [1190, 62, 163], [1790, 325, 175],
];
const BACK_UPPER = [
  [51, 82, 185], [305, 178, 195], [548, 288, 183], [804, 69, 174],
  [1057, 189, 190], [1280, 276, 189], [1542, 88, 187], [1797, 169, 191],
  [68, 277, 176], [290, 72, 183], [564, 194, 190], [795, 286, 192],
  [1038, 79, 177], [1301, 170, 184], [1527, 276, 197], [1815, 73, 174],
  [39, 185, 188], [317, 283, 179], [537, 83, 194], [816, 163, 180],
  [1048, 295, 174], [1287, 65, 199], [1554, 187, 179], [1789, 290, 193],
];
const BACK_LOWER = LOWER_POSITIONS.flatMap(([x, y, width], index) => {
  const position = [x, y + UPPER_BAND, width];
  const top = index % 3 === 0 ? TOP_ROW[index / 3] : undefined;
  return top ? [position, top] : [position];
});
const SIDE_LOWER = [
  [39, 138, 149], [388, 49, 158], [218, 335, 151], [572, 253, 162],
  [31, 459, 154], [390, 355, 160], [208, 58, 153], [575, 570, 166],
  [46, 241, 142], [392, 480, 152], [213, 154, 158], [572, 76, 156],
  [29, 49, 158], [382, 240, 158], [208, 550, 150], [569, 371, 167],
  [35, 352, 147], [400, 578, 151], [221, 442, 147], [577, 468, 162],
  [47, 568, 144], [384, 151, 159], [216, 250, 151], [577, 157, 165],
];
const SIDE_UPPER = [
  [44, 79, 152], [218, 166, 153], [380, 283, 159], [572, 69, 162],
  [32, 183, 155], [204, 285, 156], [396, 78, 148], [572, 187, 168],
  [47, 278, 150], [215, 73, 155], [386, 188, 154], [581, 284, 163],
];
// Toward the right the upper stair slopes down and the lower rail slopes up.
const BETWEEN_STAIRS = [
  [799, 371, 137], [958, 515, 130], [1115, 470, 134], [1280, 633, 131],
  [788, 594, 142], [952, 407, 139], [1110, 685, 140], [1275, 549, 136],
  [795, 810, 134], [962, 625, 132], [1120, 575, 131], [1287, 710, 124],
  [793, 481, 139], [956, 820, 133], [801, 703, 136], [950, 725, 138],
];

function interleave(first, second) {
  return first.flatMap((slot, index) => index < second.length ? [slot, second[index]] : [slot])
    .concat(second.slice(first.length));
}

const liftCanvas = ([x, y, width]) => [x, y + CEILING_BANDS, width];
// Spread small selections across the full visible surface as well.
const BACK_POSITIONS = interleave(BACK_LOWER.map(liftCanvas), BACK_UPPER);
const SIDE_POSITIONS = interleave(SIDE_LOWER.map(liftCanvas), interleave(BETWEEN_STAIRS, SIDE_UPPER));
const CAPACITY = BACK_POSITIONS.length + SIDE_POSITIONS.length;
const INK = ['#ffda98', '#dbe6c3', '#f3cfc8', '#e0d5ee', '#f9e8be'];
const WALL_FONT = '"Kaiti SC", STKaiti, KaiTi, "Songti SC", "Noto Serif SC", serif';

export function buildWallProjection(T, scene) {
  // Both walls share the same scale and leave open floor space around the corner.
  const planeHeight = 5.43 * HEIGHT / BASE_HEIGHT;
  const centerY = .12 + planeHeight / 2;
  const back = { pixels: WIDTH, width: 17.36, x: 0, z: 8.908, yaw: Math.PI, slots: BACK_POSITIONS };
  const side = { pixels: 1463, width: 12.35, x: -8.893, z: 2.61, yaw: Math.PI / 2, slots: SIDE_POSITIONS };
  function createMap(surface, scale = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(surface.pixels * scale);
    canvas.height = Math.ceil(HEIGHT * scale);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    return map;
  }
  function paintSurface(surface, notes) {
    if (!surface.panel && !notes.length) return;
    if (!surface.panel) {
      const map = createMap(surface);
      const panel = new T.Mesh(new T.PlaneGeometry(surface.width, planeHeight), new T.MeshBasicMaterial({
        map, transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending,
      }));
      panel.name = 'Projected visitor messages';
      panel.position.set(surface.x, centerY, surface.z);
      panel.rotation.y = surface.yaw;
      scene.add(panel);
      surface.panel = panel;
    }
    surface.notes = notes;
    surface.panel.visible = notes.length > 0;
    paintText(surface, surface.panel.material.map, 1);
  }
  function paintText(surface, map, scale) {
    const ctx = map.image.getContext('2d');
    ctx.clearRect(0, 0, map.image.width, map.image.height);
    ctx.save();
    ctx.scale(map.image.width / surface.pixels, map.image.height / HEIGHT);
    for (const [index, { id, text }] of surface.notes.entries()) {
      const [x, y, width] = surface.slots[index];
      const color = INK[id % INK.length];
      ctx.save();
      ctx.translate(x, y + (id % 5 - 2));
      ctx.rotate((id % 9 - 4) * .009);
      let size = 18 + (id * 7 % 9);
      const room = Math.min(55, HEIGHT - y - 12);
      let lines;
      for (; size >= 11; size--) {
        ctx.font = `600 ${size}px ${WALL_FONT}`;
        lines = textLines(ctx, text, width);
        if (lines.length * size * 1.15 <= room) break;
      }
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 7 * scale;
      ctx.globalAlpha = .93;
      lines.forEach((line, row) => ctx.fillText(line, 0, row * size * 1.15, width));
      ctx.restore();
    }
    ctx.restore();
    map.needsUpdate = true;
  }
  return {
    paint(notes) {
      const sideCount = Math.round(notes.length * SIDE_POSITIONS.length / CAPACITY);
      const split = notes.length - sideCount;
      paintSurface(back, notes.slice(0, split));
      paintSurface(side, notes.slice(split));
    },
    capture(render) {
      const originals = [];
      try {
        for (const surface of [back, side]) {
          if (!surface.panel?.visible) continue;
          const { material } = surface.panel;
          const scale = 1.5;
          const map = createMap(surface, scale);
          originals.push({ material, original: material.map, map });
          paintText(surface, map, scale);
          material.map = map;
        }
        return render();
      } finally {
        for (const { material, original, map } of originals) {
          material.map = original;
          map.dispose();
          map.image.width = map.image.height = 1;
        }
      }
    },
  };
}

async function wallRequest(body) {
  const origin = location.hostname === 'gaonan.github.io' ? 'https://lyn.lipopo.org' : '';
  const url = `${origin}/api/wall-messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Message wall request failed');
    return body ? undefined : await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function visibleNotes(messages) {
  return messages.filter(note => Number.isSafeInteger(note.id) && note.id > 0 && typeof note.text === 'string')
    .map(({ id, text }) => ({ id, text: keepsakeText(text).trim() }))
    .filter(note => note.text).slice(0, CAPACITY);
}

export function setupMessageWall(dialog, projection, drawView, recordReady) {
  const canvas = dialog.querySelector('canvas');
  const status = dialog.querySelector('[role=status]');
  const list = dialog.querySelector('.wall-readings');
  const count = dialog.querySelector('.wall-count');
  const shuffle = dialog.querySelector('#shuffle-wall');
  const retry = dialog.querySelector('#retry-wall');
  const save = dialog.querySelector('#save-wall-image');
  const download = dialog.querySelector('#download-wall-image');
  let revision = 0;
  let imageFile;
  function discardImage() {
    if (download.hasAttribute('href')) URL.revokeObjectURL(download.href);
    download.removeAttribute('href');
    download.hidden = true;
    imageFile = undefined;
  }
  recordReady.then(ready => {
    if (ready && dialog.open) drawView(canvas);
  });

  function showNotes(notes) {
    projection.paint(notes);
    drawView(canvas);
    list.replaceChildren(...notes.map(note => {
      const entry = document.createElement('li');
      entry.textContent = note.text;
      return entry;
    }));
  }

  async function loadSelection() {
    const attempt = ++revision;
    discardImage();
    save.disabled = true;
    shuffle.disabled = true;
    retry.hidden = true;
    status.textContent = '正在读取留言…';
    try {
      const data = await wallRequest();
      if (!dialog.open || attempt !== revision) return;
      const notes = visibleNotes(data.messages);
      showNotes(notes);
      save.disabled = !notes.length;
      shuffle.hidden = data.total <= CAPACITY;
      count.textContent = data.total ? `墙上 ${notes.length} 条 · 共 ${data.total} 条留言` : '';
      status.textContent = notes.length ? '' : '还没有公开留言。';
    } catch {
      if (!dialog.open || attempt !== revision) return;
      retry.hidden = false;
      status.textContent = '暂时无法读取留言。';
    } finally {
      if (dialog.open && attempt === revision) shuffle.disabled = false;
    }
  }
  dialog.querySelector('#back-from-message-wall').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    revision++;
    discardImage();
  });
  shuffle.onclick = retry.onclick = loadSelection;
  save.onclick = async () => {
    const attempt = revision;
    const title = '康乃馨 7.0 · 花房留言墙';
    save.disabled = shuffle.disabled = true;
    let output;
    try {
      if (!imageFile) {
        output = document.createElement('canvas');
        output.width = canvas.width * 2;
        output.height = canvas.height * 2;
        if (!projection.capture(() => drawView(output))) throw new Error('Wall render unavailable');
        paintCreatorCredit(output.getContext('2d'), output.width - 50, output.height - 36, 30);
        const blob = await new Promise(resolve => output.toBlob(resolve, 'image/jpeg', .97));
        if (!dialog.open || attempt !== revision) return;
        if (!blob) throw new Error('Wall image unavailable');
        imageFile = new File([blob], `${title}.jpg`, { type: blob.type });
        download.href = URL.createObjectURL(imageFile);
        download.download = imageFile.name;
        download.hidden = false;
      }
      const result = await shareImage(imageFile, title);
      if (!dialog.open || attempt !== revision) return;
      if (result === 'unavailable') download.click();
    } catch {
      if (dialog.open && attempt === revision) status.textContent = '暂时无法保存图片，请再试一次。';
    } finally {
      if (output) output.width = output.height = 1;
      if (dialog.open && attempt === revision) save.disabled = shuffle.disabled = false;
    }
  };
  async function refresh() {
    if (dialog.open) return;
    const attempt = ++revision;
    try {
      const data = await wallRequest();
      if (!dialog.open && attempt === revision) projection.paint(visibleNotes(data.messages));
    } catch {}
  }
  return {
    open() {
      if (dialog.open) return;
      shuffle.hidden = true;
      count.textContent = '';
      list.replaceChildren();
      dialog.showModal();
      drawView(canvas);
      loadSelection();
    },
    refresh,
    async publish(note) {
      await wallRequest(note);
      refresh();
    },
  };
}
