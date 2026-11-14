const LIMIT = 50;
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
const characters = text => segmenter
  ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);

export function keepsakeText(text) {
  return characters(String(text).replace(/\r\n?/g, '\n')).slice(0, LIMIT).join('');
}

const lineEndPunctuation = /^[、。，．！？；：）】》』」…,.!?;:)]$/u;

export function textLines(ctx, text, maxWidth) {
  return text.split('\n').flatMap(paragraph => {
    const lines = [];
    let line = '';
    for (const char of characters(paragraph)) {
      if (line && ctx.measureText(line + char).width > maxWidth && !lineEndPunctuation.test(char)) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
    lines.push(line);
    return lines;
  });
}

export function paintKeepsake(out, render, album, text) {
  const ctx = out.getContext('2d');
  const { width: w, height: h } = out;
  ctx.fillStyle = '#151a18';
  ctx.fillRect(0, 0, w, h);
  render(ctx, 52, 112, 1496, 800);
  ctx.strokeStyle = '#a98c5d';
  ctx.lineWidth = 1;
  ctx.strokeRect(33.5, 33.5, w - 67, h - 67);
  ctx.strokeRect(51.5, 111.5, 1497, 801);
  ctx.fillStyle = '#f4e6cd';
  ctx.font = '600 34px "Songti SC", "Noto Serif CJK SC", serif';
  ctx.fillText('康乃馨 7.0', 52, 81);
  ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ccb583';
  ctx.fillText('花海舞台 · 夜色留影', 1548, 78);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#292821';
  ctx.fillRect(52, 948, 360, 222);
  ctx.drawImage(album, 52, 948, 360, 222);
  ctx.strokeStyle = '#a98c5d';
  ctx.strokeRect(51.5, 947.5, 361, 223);
  ctx.fillStyle = '#c8ae79';
  ctx.font = '500 21px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(text ? '写给这一晚' : '花房彩蛋', 465, 975);
  ctx.fillStyle = '#fff1d9';
  ctx.font = '600 40px "Songti SC", "Noto Serif CJK SC", serif';
  const lines = textLines(ctx, text || '邀请你常来停歇', 1035);
  const lineHeight = Math.min(57, 145 / Math.max(1, lines.length - 1));
  lines.forEach((line, index) => ctx.fillText(line, 465, 1035 + index * lineHeight));
}

export async function shareImage(file, title) {
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    return error.name === 'AbortError';
  }
}

export function setupKeepsake(dialog, record, render, openGroupPhoto) {
  const key = 'carnation7-wall-note';
  const input = dialog.querySelector('textarea');
  const counter = dialog.querySelector('.keepsake-count');
  const album = dialog.querySelector('.keepsake-album');
  const preview = dialog.querySelector('.keepsake-preview');
  const generate = dialog.querySelector('#make-keepsake');
  const save = dialog.querySelector('#save-keepsake');
  const download = dialog.querySelector('#download-keepsake');
  const groupPhoto = dialog.querySelector('#open-group-photo');
  groupPhoto.addEventListener('click', openGroupPhoto);
  const status = dialog.querySelector('.keepsake-status');
  let savedText = '';
  try { savedText = keepsakeText(localStorage.getItem(key) || ''); } catch {}
  record.setMessage(savedText);
  let file, url, generating = false, generation = 0;

  function discardImage() {
    generation++;
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    file = undefined;
    preview.hidden = true;
    preview.removeAttribute('src');
    save.hidden = download.hidden = true;
    download.removeAttribute('href');
  }

  function updateLimit() {
    const limited = keepsakeText(input.value);
    if (limited !== input.value) input.value = limited;
    counter.textContent = `${characters(limited).length} / ${LIMIT}`;
  }

  dialog.addEventListener('close', () => {
    discardImage();
    album.hidden = false;
  });
  function editNote() {
    updateLimit();
    discardImage();
    album.hidden = false;
    status.textContent = '';
  }
  input.addEventListener('input', event => { if (!event.isComposing) editNote(); });
  input.addEventListener('compositionend', editNote);

  generate.addEventListener('click', async () => {
    if (generating) return;
    updateLimit();
    const text = input.value.trim().replace(/\n+/g, ' ');
    savedText = text;
    record.setMessage(text);
    try { localStorage.setItem(key, text); } catch {}
    discardImage();
    const attempt = generation;
    generating = generate.disabled = true;
    status.textContent = '正在生成留影…';
    try {
      if (!album.complete || !album.naturalWidth) await album.decode();
      if (attempt !== generation || !dialog.open) return;
      const out = document.createElement('canvas');
      out.width = 1600;
      out.height = 1220;
      paintKeepsake(out, render, album, text);
      const blob = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', .94));
      if (!blob) throw new Error('No image was encoded');
      if (attempt !== generation || !dialog.open) return;
      file = new File([blob], '康乃馨7.0-花房留影.jpg', { type: 'image/jpeg' });
      url = URL.createObjectURL(blob);
      preview.src = url;
      preview.hidden = false;
      album.hidden = true;
      save.hidden = download.hidden = groupPhoto.hidden = false;
      download.href = url;
      status.textContent = '可分享、下载，也可长按图片保存。';
    } catch {
      if (attempt === generation) status.textContent = '留言已保留。留影生成失败，请再试一次。';
    } finally {
      generating = generate.disabled = false;
    }
  });

  save.addEventListener('click', async () => {
    if (!file) return;
    if (await shareImage(file, '康乃馨 7.0 · 花房留影')) return;
    status.textContent = '请长按图片保存，或点「下载图片」。';
  });
  return () => {
    album.src = record.url;
    input.value = savedText;
    updateLimit();
    status.textContent = '';
  };
}
