import { keepsakeText, textLines } from './keepsake.js?v=20261113-r50';

const WIDTH = 2048;
const HEIGHT = 384;
const COLUMNS = [65, 355, 643, 1195, 1471, 1752];
// The empty middle columns make room for the door, album and personal plaque.
const SLOTS = [
  ...COLUMNS.map(x => [x, 54]),
  ...[...COLUMNS.slice(0, 3), COLUMNS.at(-1)].map(x => [x, 157]),
  ...COLUMNS.map(x => [x, 266]),
];
const POSITIONS = [2, 14, 6, 4, 9, 11, 0, 15, 7, 3, 12, 8, 13, 1, 5, 10].map(index => SLOTS[index]);
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
      const [x, y] = POSITIONS[index];
      const color = INK[id % INK.length];
      ctx.save();
      ctx.translate(x, y + (id % 7 - 3) * 2);
      ctx.rotate((id % 7 - 3) * .013);
      const wash = ctx.createRadialGradient(93, 16, 0, 93, 16, 136);
      wash.addColorStop(0, `${color}22`);
      wash.addColorStop(1, `${color}00`);
      ctx.fillStyle = wash;
      ctx.fillRect(-44, -118, 274, 270);
      let size = 30;
      let lines;
      do {
        ctx.font = `600 ${size}px ${WALL_FONT}`;
        lines = textLines(ctx, text, 233);
        if (lines.length * size * 1.13 <= 82) break;
        size -= 2;
      } while (size >= 16);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = .88;
      lines.slice(0, 5).forEach((line, row) => ctx.fillText(line, 0, row * size * 1.13, 239));
      ctx.shadowBlur = 4;
      ctx.globalAlpha = .56;
      ctx.beginPath();
      ctx.ellipse(-12, -6, 3, 2, .2, 0, 2 * Math.PI);
      ctx.fill();
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
