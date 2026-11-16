import { keepsakeText, textLines } from './keepsake.js?v=20261113-r58';

const WIDTH = 2048;
const BASE_HEIGHT = 640;
const UPPER_BAND = 88;
const HEIGHT = BASE_HEIGHT + UPPER_BAND;
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
const POSITIONS = LOWER_POSITIONS.flatMap(([x, y, width], index) => {
  const position = [x, y + UPPER_BAND, width];
  // Use a few upper slots even when there are too few messages to fill the wall.
  const top = index % 3 === 0 ? TOP_ROW[index / 3] : undefined;
  return top ? [position, top] : [position];
});
const SIDE_POSITIONS = [
  [39, 138, 149], [388, 49, 158], [218, 335, 151], [572, 253, 162],
  [31, 459, 154], [390, 355, 160], [208, 58, 153], [575, 570, 166],
  [46, 241, 142], [392, 480, 152], [213, 154, 158], [572, 76, 156],
  [29, 49, 158], [382, 240, 158], [208, 550, 150], [569, 371, 167],
  [35, 352, 147], [400, 578, 151], [221, 442, 147], [577, 468, 162],
  [47, 568, 144], [384, 151, 159], [216, 250, 151], [577, 157, 165],
];
const CAPACITY = POSITIONS.length + SIDE_POSITIONS.length;
const INK = ['#ffda98', '#dbe6c3', '#f3cfc8', '#e0d5ee', '#f9e8be'];
const WALL_FONT = '"Kaiti SC", STKaiti, KaiTi, "Songti SC", "Noto Serif SC", serif';

export function buildWallProjection(T, scene) {
  // Both walls share the same scale and leave open floor space around the corner.
  const planeHeight = 5.43 * HEIGHT / BASE_HEIGHT;
  const centerY = .12 + planeHeight / 2;
  const back = { pixels: WIDTH, width: 17.36, x: 0, z: 8.908, yaw: Math.PI, slots: POSITIONS };
  const side = { pixels: 776, width: 6.55, x: -8.893, z: 5.51, yaw: Math.PI / 2, slots: SIDE_POSITIONS };
  function paintSurface(surface, notes) {
    if (!surface.panel && !notes.length) return;
    if (!surface.panel) {
      const canvas = document.createElement('canvas');
      canvas.width = surface.pixels;
      canvas.height = HEIGHT;
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      const panel = new T.Mesh(new T.PlaneGeometry(surface.width, planeHeight), new T.MeshBasicMaterial({
        map, transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending,
      }));
      panel.name = 'Projected visitor messages';
      panel.position.set(surface.x, centerY, surface.z);
      panel.rotation.y = surface.yaw;
      scene.add(panel);
      surface.panel = panel;
    }
    const { panel } = surface;
    const map = panel.material.map;
    const ctx = map.image.getContext('2d');
    ctx.clearRect(0, 0, surface.pixels, HEIGHT);
    panel.visible = notes.length > 0;
    for (const [index, { id, text }] of notes.entries()) {
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
      ctx.shadowBlur = 7;
      ctx.globalAlpha = .93;
      lines.forEach((line, row) => ctx.fillText(line, 0, row * size * 1.15, width));
      ctx.restore();
    }
    map.needsUpdate = true;
  }
  return {
    paint(notes) {
      const sideCount = Math.round(notes.length * SIDE_POSITIONS.length / CAPACITY);
      const split = notes.length - sideCount;
      paintSurface(back, notes.slice(0, split));
      paintSurface(side, notes.slice(split));
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
  let revision = 0;
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
    shuffle.disabled = true;
    retry.hidden = true;
    status.textContent = '正在读取留言…';
    try {
      const data = await wallRequest();
      if (!dialog.open || attempt !== revision) return;
      const notes = visibleNotes(data.messages);
      showNotes(notes);
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
  dialog.addEventListener('close', () => { revision++; });
  shuffle.onclick = retry.onclick = loadSelection;
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
