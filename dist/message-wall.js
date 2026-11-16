import { keepsakeText, textLines } from './keepsake.js?v=20261113-r54';

const WIDTH = 2048;
const HEIGHT = 640;
// The left positions stay above the descending stair rail. The album and
// personal plaque occupy the right half between about y=425 and y=520.
// Fill the upper wall and the open wall on both sides even with few messages.
const POSITIONS = [
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
const INK = ['#ffda98', '#dbe6c3', '#f3cfc8', '#e0d5ee', '#f9e8be'];
const WALL_FONT = '"Kaiti SC", STKaiti, KaiTi, "Songti SC", "Noto Serif SC", serif';

export function buildWallProjection(T, scene) {
  let panel;
  function paint(notes) {
    if (!panel && !notes.length) return;
    if (!panel) {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      panel = new T.Mesh(new T.PlaneGeometry(17.36, 5.43), new T.MeshBasicMaterial({
        map, transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending,
      }));
      panel.name = 'Projected visitor messages';
      panel.position.set(0, 2.835, 8.908);
      panel.rotation.y = Math.PI;
      scene.add(panel);
    }
    const map = panel.material.map;
    const ctx = map.image.getContext('2d');
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    panel.visible = notes.length > 0;
    for (const [index, { id, text }] of notes.entries()) {
      const [x, y, width] = POSITIONS[index];
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
  return { paint };
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
    .filter(note => note.text).slice(0, POSITIONS.length);
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
      shuffle.hidden = data.total <= POSITIONS.length;
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
