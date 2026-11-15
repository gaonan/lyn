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

const FILM_TITLE = '康乃馨 7.0';
const FILM_LINES = ['如果我拥有一座花园', '邀请你常来停歇'];
const FILM_FONT = '"Noto Serif SC Film", "Songti SC", "Noto Serif CJK SC", serif';
const FILM_SCALE = 2;

export function createFilmCanvas(hasAlbum = false) {
  const out = document.createElement('canvas');
  out.width = 1600 * FILM_SCALE;
  out.height = (hasAlbum ? 1220 : 900) * FILM_SCALE;
  return out;
}

export async function loadFilmFont() {
  await document.fonts?.load(
    `600 64px ${FILM_FONT}`, FILM_TITLE + FILM_LINES.join('') + '唱片留影花海合影花海对唱写给这一晚',
  ).catch(() => {});
}

function photoDate(date) {
  const two = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}`;
}

function fillSprocket(ctx, x, y, width, height, radius, color) {
  const right = x + width, bottom = y + height;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(right, y, right, bottom, radius);
  ctx.arcTo(right, bottom, x, bottom, radius);
  ctx.arcTo(x, bottom, x, y, radius);
  ctx.arcTo(x, y, right, y, radius);
  ctx.fill();
}

function paintFilmStrip(ctx, y, width) {
  ctx.fillStyle = '#15120f';
  ctx.fillRect(0, y, width, 43);
  ctx.fillStyle = '#987244';
  ctx.fillRect(0, y + 2, width, 1);
  ctx.fillRect(0, y + 40, width, 1);
  const step = 58;
  const holes = Math.floor((width - 45) / step);
  const first = (width - (holes - 1) * step - 29) / 2;
  for (let index = 0; index < holes; index++) {
    const x = first + index * step;
    fillSprocket(ctx, x - 1, y + 12, 31, 20, 4, '#100d0a');
    fillSprocket(ctx, x, y + 13, 29, 17, 3.5, '#a49373');
  }
}

function paintRecordNumber(ctx, x, y, width, serial) {
  const height = 73, center = x + width / 2;
  const foil = ctx.createLinearGradient(x, y, x + width, y + height);
  foil.addColorStop(0, '#916b35');
  foil.addColorStop(.26, '#ead297');
  foil.addColorStop(.48, '#ffebba');
  foil.addColorStop(.72, '#d0a660');
  foil.addColorStop(1, '#95703a');
  ctx.save();
  ctx.fillStyle = '#241c12';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = foil;
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  ctx.strokeStyle = '#886b425f';
  ctx.strokeRect(x + 4.5, y + 4.5, width - 9, height - 9);
  ctx.fillStyle = foil;
  ctx.fillRect(x + 21, y + 37, 37, 1);
  ctx.fillRect(x + width - 58, y + 37, 37, 1);
  ctx.textAlign = 'center';
  ctx.font = '500 15px "PingFang SC", system-ui, sans-serif';
  ctx.fillText('唱片收藏编号', center, y + 24);
  ctx.font = '600 35px "IBM Plex Mono", "Courier New", monospace';
  ctx.fillText(serial, center, y + 57);
  ctx.restore();
}

export function paintFilmPhoto(out, render, { label, album, text, recordNumber, date = new Date() }) {
  const ctx = out.getContext('2d');
  const width = out.width / FILM_SCALE, height = out.height / FILM_SCALE;
  const x = 48, y = 54, right = width - x;
  const frameWidth = width - x * 2;
  const frameHeight = album ? 704 : 593;
  const footerY = y + frameHeight + 1;
  const footerBottom = height - 43;

  ctx.save();
  ctx.scale(FILM_SCALE, FILM_SCALE);
  ctx.fillStyle = '#121511';
  ctx.fillRect(0, 0, width, height);
  render(ctx, x, y, frameWidth, frameHeight, FILM_SCALE);
  const vignette = ctx.createRadialGradient(width / 2, y + frameHeight * .45, frameWidth * .24,
    width / 2, y + frameHeight * .45, frameWidth * .55);
  vignette.addColorStop(0, 'rgba(12, 11, 15, 0)');
  vignette.addColorStop(1, 'rgba(12, 11, 15, .32)');
  ctx.fillStyle = vignette;
  ctx.fillRect(x, y, frameWidth, frameHeight);
  ctx.strokeStyle = '#d6b275';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - .5, y - .5, frameWidth + 1, frameHeight + 1);

  const footer = ctx.createLinearGradient(0, footerY, width, footerBottom);
  footer.addColorStop(0, '#181f19');
  footer.addColorStop(.59, '#171b15');
  footer.addColorStop(1, '#221b13');
  ctx.fillStyle = footer;
  ctx.fillRect(x, footerY, frameWidth, footerBottom - footerY);
  ctx.strokeStyle = '#b28c554f';
  ctx.strokeRect(x - .5, footerY - .5, frameWidth + 1, footerBottom - footerY - 8);

  let quoteX = x + 29;
  const quoteY = footerY + (album ? 116 : 78);
  if (album) {
    const ax = x + 29, ay = footerY + 48, aw = 412;
    const ah = Math.round(aw * album.naturalHeight / album.naturalWidth);
    ctx.drawImage(album, ax, ay, aw, ah);
    ctx.strokeStyle = '#cbad76';
    ctx.strokeRect(ax - .5, ay - .5, aw + 1, ah + 1);
    paintRecordNumber(ctx, ax, ay + ah + 18, aw, recordNumber);
    ctx.strokeStyle = '#b28c557a';
    ctx.beginPath();
    ctx.moveTo(ax + aw + 28, ay);
    ctx.lineTo(ax + aw + 28, footerBottom - 39);
    ctx.stroke();
    quoteX = ax + aw + 57;
  }

  ctx.fillStyle = '#f5e5bf';
  ctx.font = `600 ${album ? 67 : 61}px ${FILM_FONT}`;
  ctx.fillText(FILM_LINES[0], quoteX, quoteY);
  ctx.fillStyle = '#f0d9a4';
  ctx.fillText(FILM_LINES[1], quoteX, quoteY + (album ? 89 : 79));

  if (album && text) {
    ctx.strokeStyle = '#b28c557a';
    ctx.beginPath();
    ctx.moveTo(quoteX, footerY + 234);
    ctx.lineTo(right - 29, footerY + 234);
    ctx.stroke();
    ctx.font = `600 20px ${FILM_FONT}`;
    ctx.fillStyle = '#cbb282';
    ctx.fillText('写给这一晚', quoteX, footerY + 269);
    ctx.fillStyle = '#f5ebd6';
    const noteWidth = right - 59 - quoteX;
    let fontSize = 31, lines;
    do {
      ctx.font = `400 ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
      lines = textLines(ctx, text, noteWidth);
      fontSize -= 2;
    } while (lines.length > 2 && fontSize >= 23);
    const rows = lines.length > 2 ? [lines[0], lines.slice(1).join('')] : lines;
    rows.forEach((line, index) => ctx.fillText(line, quoteX, footerY + 314 + index * 39, noteWidth));
  }

  ctx.textAlign = 'right';
  ctx.font = `600 49px ${FILM_FONT}`;
  ctx.fillStyle = '#f5e5bf';
  ctx.fillText(FILM_TITLE, right - 29, footerY + (album ? 81 : 66));
  ctx.font = `600 25px ${FILM_FONT}`;
  ctx.fillStyle = '#cbb282';
  ctx.fillText(label, right - 29, footerY + (album ? 123 : 106));
  ctx.font = '500 25px "IBM Plex Mono", "Courier New", monospace';
  ctx.fillStyle = '#ecc68f';
  ctx.fillText(photoDate(date), right - 29, footerBottom - 32);
  ctx.textAlign = 'left';

  paintFilmStrip(ctx, 0, width);
  paintFilmStrip(ctx, footerBottom, width);
  ctx.restore();
}

export async function shareImage(file, title) {
  if (!navigator.canShare?.({ files: [file] })) return 'unavailable';
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (error) {
    return error.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}

async function getRecordNumber(requestId) {
  const endpoint = location.hostname === 'gaonan.github.io'
    ? 'https://lyn.lipopo.org/api/record-number'
    : '/api/record-number';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error('Record number request failed');
    const { number } = await response.json();
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid record number');
    return `No.${String(number).padStart(6, '0')}`;
  } finally {
    clearTimeout(timer);
  }
}

export function setupKeepsake(dialog, record, render, openGroupPhoto, messageWall) {
  const key = 'carnation7-wall-note';
  const pendingKey = 'carnation7-pending-record-request';
  const input = dialog.querySelector('textarea');
  const counter = dialog.querySelector('.keepsake-count');
  const album = dialog.querySelector('.keepsake-album');
  const preview = dialog.querySelector('.keepsake-preview');
  const compose = dialog.querySelector('.keepsake-compose');
  const issued = dialog.querySelector('.keepsake-issued');
  const serialLabel = dialog.querySelector('#record-number');
  const title = dialog.querySelector('#record-finale-title');
  const edit = dialog.querySelector('#edit-keepsake');
  const generate = dialog.querySelector('#make-keepsake');
  const save = dialog.querySelector('#save-keepsake');
  const download = dialog.querySelector('#download-keepsake');
  const groupPhoto = dialog.querySelector('#open-group-photo');
  const confirmSaved = dialog.querySelector('#confirm-keepsake-saved');
  groupPhoto.addEventListener('click', openGroupPhoto);
  const wallButton = dialog.querySelector('#open-message-wall');
  wallButton.addEventListener('click', messageWall.open);
  const publishPanel = dialog.querySelector('.keepsake-publish');
  const publishButton = dialog.querySelector('#publish-wall-note');
  const publishStatus = publishPanel.querySelector('[role=status]');
  const status = dialog.querySelector('.keepsake-status');
  let savedText = '';
  try { savedText = keepsakeText(localStorage.getItem(key) || ''); } catch {}
  record.setMessage(savedText);
  let file, url, requestId, generating = false, generation = 0;
  let publishable;
  try { requestId = sessionStorage.getItem(pendingKey); } catch {}
  if (!/^[0-9a-f]{32}$/.test(requestId)) requestId = undefined;

  function discardImage() {
    generation++;
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    file = undefined;
    preview.hidden = true;
    album.hidden = false;
    preview.removeAttribute('src');
    issued.hidden = groupPhoto.hidden = confirmSaved.hidden = true;
    publishPanel.hidden = true;
    publishable = undefined;
    compose.hidden = false;
    title.textContent = '恭喜发现彩蛋，你好厉害！';
    download.removeAttribute('href');
  }

  function updateLimit() {
    const limited = keepsakeText(input.value);
    if (limited !== input.value) input.value = limited;
    counter.textContent = `${characters(limited).length} / ${LIMIT}`;
  }

  dialog.addEventListener('close', discardImage);
  function editNote() {
    updateLimit();
    discardImage();
    status.textContent = '';
  }
  input.addEventListener('input', event => { if (!event.isComposing) editNote(); });
  input.addEventListener('compositionend', editNote);
  edit.addEventListener('click', () => {
    editNote();
    input.focus();
  });

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
    status.textContent = '正在准备留影…';
    let stage = 'image';
    try {
      await Promise.all([loadFilmFont(), album.complete && album.naturalWidth ? undefined : album.decode()]);
      if (attempt !== generation || !dialog.open) return;
      if (!requestId) {
        requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          byte => byte.toString(16).padStart(2, '0')).join('');
        try { sessionStorage.setItem(pendingKey, requestId); } catch {}
      }
      stage = 'number';
      status.textContent = '正在领取收藏编号…';
      const recordNumber = await getRecordNumber(requestId);
      if (attempt !== generation || !dialog.open) return;
      stage = 'image';
      status.textContent = '正在生成留影…';
      const out = createFilmCanvas(true);
      paintFilmPhoto(out, render, { label: '唱片留影', album, text, recordNumber });
      const blob = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', .96));
      if (!blob) throw new Error('No image was encoded');
      if (attempt !== generation || !dialog.open) return;
      file = new File([blob], `康乃馨7.0-唱片留影-${recordNumber}.jpg`, { type: 'image/jpeg' });
      url = URL.createObjectURL(blob);
      if (text) {
        publishable = { requestId, text };
        publishPanel.hidden = publishButton.disabled = false;
        publishStatus.textContent = '';
      }
      requestId = undefined;
      try { sessionStorage.removeItem(pendingKey); } catch {}
      serialLabel.textContent = recordNumber;
      title.textContent = '收藏你的唱片留影';
      preview.src = url;
      preview.hidden = issued.hidden = confirmSaved.hidden = false;
      album.hidden = compose.hidden = true;
      download.href = url;
      download.download = file.name;
      status.textContent = '也可以长按预览图保存。';
    } catch {
      if (attempt === generation) status.textContent = stage === 'number'
        ? '暂时连不上编号服务器，联网后再试一次。留言已保留。'
        : '留言已保留。留影生成失败，请再试一次。';
    } finally {
      generating = generate.disabled = false;
    }
  });

  publishButton.addEventListener('click', async () => {
    if (!publishable) return;
    const note = publishable;
    publishButton.disabled = true;
    publishStatus.textContent = '正在发布…';
    try {
      await messageWall.publish(note);
      if (note !== publishable) return;
      publishable = undefined;
      publishStatus.textContent = '已发布，留言会参与墙面抽选。';
    } catch {
      if (note !== publishable) return;
      publishButton.disabled = false;
      publishStatus.textContent = '暂时没能发布，联网后可以重试。';
    }
  });

  function showGroupPhotoStep(message) {
    groupPhoto.hidden = false;
    confirmSaved.hidden = true;
    status.textContent = message;
  }

  download.addEventListener('click', () => {
    if (file) showGroupPhotoStep('已发起留影下载。');
  });
  confirmSaved.addEventListener('click', () => {
    if (file) showGroupPhotoStep('');
  });
  save.addEventListener('click', async () => {
    if (!file) return;
    const attempt = generation;
    const result = await shareImage(file, '康乃馨 7.0 · 花房留影');
    if (attempt !== generation || !dialog.open) return;
    if (result === 'shared') showGroupPhotoStep('');
    if (result === 'unavailable') {
      status.textContent = '可长按图片保存，保存后点「我已保存」，也可以下载图片。';
    }
  });
  return () => {
    album.src = record.url;
    input.value = savedText;
    updateLimit();
    status.textContent = '';
    messageWall.refresh();
  };
}
