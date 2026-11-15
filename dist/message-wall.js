import { keepsakeText, textLines } from './keepsake.js?v=20261113-r50';

const WIDTH = 2048;
const HEIGHT = 384;
const leftSlots = [
  [54, 46, 178], [259, 73, 156], [477, 31, 163], [674, 66, 181],
  [34, 141, 193], [242, 157, 193], [451, 116, 178], [664, 147, 178],
  [72, 225, 162], [247, 248, 160], [477, 204, 155], [645, 227, 189],
  [40, 312, 172], [279, 329, 156], [457, 298, 172], [694, 315, 151],
];
// Reserve the middle of the right half for the album and the personal plaque.
const rightSlots = [
  [1178, 34, 174], [1390, 28, 175], [1597, 41, 163], [1812, 27, 180],
  [1188, 106, 172], [1373, 92, 172], [1583, 103, 175], [1783, 91, 170],
  [1175, 294, 182], [1388, 316, 162], [1574, 302, 176], [1815, 319, 174],
  [1802, 158, 178], [1777, 230, 208],
];
const leftOrder = [6, 9, 0, 14, 5, 11, 3, 12, 2, 15, 8, 1, 13, 4, 7, 10];
const rightOrder = [2, 9, 5, 13, 0, 11, 6, 4, 1, 12, 3, 8, 7, 10];
const POSITIONS = leftOrder.flatMap((slot, index) => {
  const right = rightSlots[rightOrder[index]];
  return right ? [leftSlots[slot], right] : [leftSlots[slot]];
});
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
      panel = new T.Mesh(new T.PlaneGeometry(17.36, 3.03), new T.MeshBasicMaterial({
        map, transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending,
      }));
      panel.name = 'Projected visitor messages';
      panel.position.set(0, 1.64, 8.908);
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

export function setupMessageWall(dialog, projection, drawView) {
  const canvas = dialog.querySelector('canvas');
  const status = dialog.querySelector('[role=status]');
  const list = dialog.querySelector('.wall-readings');
  const count = dialog.querySelector('.wall-count');
  const shuffle = dialog.querySelector('#shuffle-wall');
  const retry = dialog.querySelector('#retry-wall');
  let revision = 0;

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
