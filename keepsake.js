import { createRecordClaim, formatRecordNumber } from './record-claim.js?v=20261122-r95';

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

const GARDEN_FILM_TITLE = '康乃馨 7.0';
const CONCERT_FILM_TITLE = '康乃馨缘计划';
const FILM_LINES = ['如果我拥有一座花园', '邀请你常来停歇'];
const FILM_FONT = '"Noto Serif SC Film", "Noto Serif SC", "Songti SC", "Noto Serif CJK SC", serif';
const FILM_SCALE = 2;

function createFilmCanvas() {
  const out = document.createElement('canvas');
  out.width = 1600 * FILM_SCALE;
  out.height = 1220 * FILM_SCALE;
  return out;
}

async function loadFilmFont() {
  await document.fonts?.load(
    `600 64px ${FILM_FONT}`, GARDEN_FILM_TITLE + CONCERT_FILM_TITLE + FILM_LINES.join('') + '唱片留影写给这一晚',
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

export function paintCreatorCredit(ctx, x, baseline, size = 16) {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `500 ${size}px "IBM Plex Mono", "Courier New", monospace`;
  ctx.fillStyle = '#ecdab37a';
  ctx.shadowColor = '#101310a6';
  ctx.shadowBlur = 3;
  ctx.fillText('By MD_Leah', x, baseline);
  ctx.restore();
}

export function paintGardenLink(ctx, x, baseline, size) {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `500 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = '#f5e5bf';
  ctx.shadowColor = '#15120f';
  ctx.shadowBlur = 5;
  ctx.fillText('https://lyn.lipopo.org/', x, baseline);
  ctx.restore();
}

function paintFilmPhoto(out, render, { album, text, recordNumber, angle, filmTitle }) {
  const ctx = out.getContext('2d');
  const width = out.width / FILM_SCALE, height = out.height / FILM_SCALE;
  const x = 48, y = 54, right = width - x;
  const frameWidth = width - x * 2;
  const frameHeight = 704;
  const footerY = y + frameHeight + 1;
  const footerBottom = height - 43;

  ctx.save();
  ctx.scale(FILM_SCALE, FILM_SCALE);
  ctx.fillStyle = '#121511';
  ctx.fillRect(0, 0, width, height);
  render(ctx, x, y, frameWidth, frameHeight, FILM_SCALE, angle);
  const vignette = ctx.createRadialGradient(width / 2, y + frameHeight * .45, frameWidth * .24,
    width / 2, y + frameHeight * .45, frameWidth * .55);
  vignette.addColorStop(0, 'rgba(12, 11, 15, 0)');
  vignette.addColorStop(1, 'rgba(12, 11, 15, .32)');
  ctx.fillStyle = vignette;
  ctx.fillRect(x, y, frameWidth, frameHeight);
  paintCreatorCredit(ctx, right - 29, y + frameHeight - 19);
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

  const quoteX = ax + aw + 57;
  const quoteY = footerY + 116;
  ctx.fillStyle = '#f5e5bf';
  ctx.font = `600 67px ${FILM_FONT}`;
  ctx.fillText(FILM_LINES[0], quoteX, quoteY);
  ctx.fillStyle = '#f0d9a4';
  ctx.fillText(FILM_LINES[1], quoteX, quoteY + 89);

  if (text) {
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
  ctx.fillText(filmTitle, right - 29, footerY + 81);
  ctx.font = `600 25px ${FILM_FONT}`;
  ctx.fillStyle = '#cbb282';
  ctx.fillText('唱片留影', right - 29, footerY + 123);
  ctx.textAlign = 'left';
  ctx.font = '500 25px "IBM Plex Mono", "Courier New", monospace';
  ctx.fillStyle = '#ecc68f';
  ctx.fillText(photoDate(new Date()), quoteX, footerBottom - 32);
  paintGardenLink(ctx, right - 29, footerBottom - 32, 27);

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

export function setupKeepsake(dialog, record, render, messageWall, dogReady, isConcert = () => false) {
  const key = 'carnation7-wall-note';
  const claim = createRecordClaim();
  let retryWhenOnline = false;
  const input = dialog.querySelector('textarea');
  const counter = dialog.querySelector('.keepsake-count');
  const album = dialog.querySelector('.keepsake-album');
  const preview = dialog.querySelector('.keepsake-preview');
  const angles = dialog.querySelector('.keepsake-angles');
  const previous = dialog.querySelector('#keepsake-angle-prev');
  const next = dialog.querySelector('#keepsake-angle-next');
  const angleLabel = dialog.querySelector('#keepsake-angle-label');
  const angleNames = ['正面舞台', '侧后方 · 留言墙'];
  const compose = dialog.querySelector('.keepsake-compose');
  const issued = dialog.querySelector('.keepsake-issued');
  const serialLabel = dialog.querySelector('#record-number');
  const title = dialog.querySelector('#record-finale-title');
  const edit = dialog.querySelector('#edit-keepsake');
  const generate = dialog.querySelector('#make-keepsake');
  const save = dialog.querySelector('#save-keepsake');
  const download = dialog.querySelector('#download-keepsake');
  const wallButton = dialog.querySelector('#open-message-wall');
  wallButton.addEventListener('click', messageWall.open);
  const publishButton = dialog.querySelector('#publish-wall-note');
  const publishStatus = dialog.querySelector('#wall-publish-status');
  const saveStatus = dialog.querySelector('#keepsake-save-status');
  const status = dialog.querySelector('#keepsake-status');
  let savedText = '';
  try { savedText = keepsakeText(localStorage.getItem(key) || ''); } catch {}
  record.setMessage(savedText);
  let file, url, wallReady, currentAngle = 0, activeRequest, generation = 0;
  let publishable;

  function discardImage() {
    generation++;
    activeRequest?.abort();
    activeRequest = undefined;
    retryWhenOnline = false;
    generate.disabled = save.disabled = previous.disabled = next.disabled = false;
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    file = undefined;
    preview.hidden = angles.hidden = true;
    currentAngle = 0;
    album.hidden = false;
    preview.removeAttribute('src');
    issued.hidden = true;
    publishButton.hidden = publishStatus.hidden = true;
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

  async function generateView(angle, text) {
    if (activeRequest) return;
    const attempt = generation;
    const controller = new AbortController();
    activeRequest = controller;
    generate.disabled = save.disabled = previous.disabled = next.disabled = true;
    download.removeAttribute('href');
    if (file) angleLabel.textContent = '正在切换机位…';
    status.textContent = '正在准备留影…';
    let stage = 'image';
    try {
      const [dogLoaded] = await Promise.all([dogReady, loadFilmFont(), album.complete && album.naturalWidth ? undefined : album.decode(),
        angle === 1 ? wallReady : undefined]);
      if (attempt !== generation || !dialog.open) return;
      if (!dogLoaded) {
        status.textContent = '呆米的素材暂未加载成功。留言已保留，请重新加载花房后再试。';
        return;
      }
      stage = 'number';
      retryWhenOnline = false;
      const receipt = await claim.get((tryNumber, total) => {
        if (attempt === generation && dialog.open) status.textContent = tryNumber === 1
          ? '正在领取收藏编号…' : `网络较忙，正在重试领取（${tryNumber}/${total}）…`;
      }, controller.signal);
      const ticketRequest = receipt.requestId;
      const recordNumber = formatRecordNumber(receipt.number);
      if (attempt !== generation || !dialog.open) return;
      stage = 'image';
      status.textContent = '正在生成留影…';
      const out = createFilmCanvas();
      const filmTitle = isConcert() ? CONCERT_FILM_TITLE : GARDEN_FILM_TITLE;
      paintFilmPhoto(out, render, { album, text, recordNumber, angle, filmTitle });
      const blob = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', .96));
      if (!blob) throw new Error('No image was encoded');
      if (attempt !== generation || !dialog.open) return;
      const previousUrl = url;
      const suffix = angle === 1 ? '-留言墙' : '';
      file = new File([blob], `康乃馨7.0-唱片留影-${recordNumber}${suffix}.jpg`, { type: 'image/jpeg' });
      url = URL.createObjectURL(blob);
      currentAngle = angle;
      if (text) {
        publishable = { requestId: ticketRequest, text };
        publishButton.hidden = publishStatus.hidden = publishButton.disabled = false;
        publishStatus.textContent = '发布后其他玩家可见';
      }
      serialLabel.textContent = recordNumber;
      title.textContent = '收藏你的唱片留影';
      preview.src = url;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      preview.hidden = issued.hidden = angles.hidden = false;
      album.hidden = compose.hidden = true;
      download.download = file.name;
      claim.complete(ticketRequest);
      status.textContent = '';
      saveStatus.textContent = '';
    } catch (error) {
      if (attempt === generation && dialog.open) {
        retryWhenOnline = stage === 'number' && error.retryable !== false;
        const receipt = claim.peek();
        status.textContent = stage === 'number'
          ? error.status === 403
            ? '当前浏览器的领取请求被拒绝。请用系统浏览器打开本站后重试，留言和领取凭据已保留。'
            : '网络暂时不稳定，领取凭据和留言已保留。可再次点击生成留影；断网恢复后会继续尝试。'
          : receipt?.number
            ? `编号 ${formatRecordNumber(receipt.number)} 已保存。留影暂未生成成功，请再试一次，不会重复领取。`
            : error?.message === '这个机位的人物素材还没加载好，请稍后再试。'
              ? error.message : '留言已保留。留影生成失败，请再试一次。';
      }
    } finally {
      if (activeRequest === controller) {
        activeRequest = undefined;
        generate.disabled = save.disabled = previous.disabled = next.disabled = false;
        if (file) {
          angleLabel.textContent = angleNames[currentAngle];
          download.href = url;
        }
      }
    }
  }

  globalThis.window?.addEventListener('online', () => {
    if (retryWhenOnline && dialog.open && !activeRequest) void generateView(0, savedText);
  });

  generate.addEventListener('click', () => {
    if (activeRequest) return;
    claim.start();
    updateLimit();
    savedText = input.value.trim().replace(/\n+/g, ' ');
    record.setMessage(savedText);
    try { localStorage.setItem(key, savedText); } catch {}
    discardImage();
    void generateView(0, savedText);
  });
  function switchAngle(offset) {
    if (!file || activeRequest) return;
    void generateView((currentAngle + offset + angleNames.length) % angleNames.length, savedText);
  }
  previous.addEventListener('click', () => switchAngle(-1));
  next.addEventListener('click', () => switchAngle(1));

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

  download.addEventListener('click', () => {
    if (file && !activeRequest) saveStatus.textContent = '已发起留影下载。';
  });
  save.addEventListener('click', async () => {
    if (!file) return;
    const attempt = generation;
    const result = await shareImage(file, '康乃馨 7.0 · 花房留影');
    if (attempt !== generation || !dialog.open) return;
    if (result === 'unavailable') {
      saveStatus.textContent = '可用「下载原图」保存。';
    }
  });
  return () => {
    album.src = record.url;
    input.value = savedText;
    updateLimit();
    const receipt = claim.peek();
    status.textContent = receipt?.number && !receipt.completed
      ? `上次留影尚未完成，编号 ${formatRecordNumber(receipt.number)} 已保留，可继续生成。` : '';
    wallReady = messageWall.refresh();
  };
}
