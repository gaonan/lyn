import { shareImage } from './keepsake.js?v=20261113-r33';

// All player image data stays in this dialog's memory until it is closed.
const TEMPLATE_URL = './assets/performer/white-dress-guest.webp';
const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 900;

// Image-space landmarks on the reusable white-dress cutout (relative to image size).
const FACE = { x: .504, y: .098, rx: .067, ry: .055 };
const FIT = { x: .5, y: .48, zoom: 1, angle: 0 };

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

async function decodeImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function resizeLocalPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await decodeImage(url);
    const ratio = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
    const photo = canvas(Math.max(1, Math.round(image.naturalWidth * ratio)),
      Math.max(1, Math.round(image.naturalHeight * ratio)));
    photo.getContext('2d').drawImage(image, 0, 0, photo.width, photo.height);
    return photo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawCrop(ctx, photo, fit, size) {
  const scale = size / Math.min(photo.width, photo.height) * fit.zoom;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(fit.angle * Math.PI / 180);
  ctx.drawImage(photo, -photo.width * fit.x * scale, -photo.height * fit.y * scale,
    photo.width * scale, photo.height * scale);
}

function drawEditor(editor, photo, fit) {
  const ctx = editor.getContext('2d');
  const size = editor.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#171c17';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  drawCrop(ctx, photo, fit, size);
  ctx.restore();

  // Keep the preview guide out of the exported compositing pixels.
  ctx.fillStyle = '#10140db0';
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.ellipse(size / 2, size / 2, size * .29, size * .37, 0, 0, Math.PI * 2);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#eed6a1';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * .29, size * .37, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#eed6a1ac';
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(size * .25, size * .44);
  ctx.lineTo(size * .75, size * .44);
  ctx.stroke();
  ctx.setLineDash([]);
}

function makePortrait(template, photo, fit) {
  const { naturalWidth: w, naturalHeight: h } = template;
  const result = canvas(w, h);
  const output = result.getContext('2d');
  output.drawImage(template, 0, 0);
  const patch = canvas(384, 384);
  const skin = patch.getContext('2d');
  skin.save();
  // Slightly temper indoor selfies to match the dim stage.
  skin.filter = 'brightness(.94) saturate(.92)';
  drawCrop(skin, photo, fit, patch.width);
  skin.restore();
  const mask = canvas(patch.width, patch.height);
  const alpha = mask.getContext('2d');
  alpha.translate(mask.width / 2, mask.height / 2);
  alpha.scale(mask.width * .29, mask.height * .37);
  const softEdge = alpha.createRadialGradient(0, 0, .71, 0, 0, 1);
  softEdge.addColorStop(0, '#fff');
  softEdge.addColorStop(.88, '#fffe');
  softEdge.addColorStop(1, '#fff0');
  alpha.fillStyle = softEdge;
  alpha.fillRect(-1, -1, 2, 2);
  skin.globalCompositeOperation = 'destination-in';
  skin.drawImage(mask, 0, 0);

  output.globalCompositeOperation = 'source-atop';
  const rx = w * FACE.rx, ry = h * FACE.ry;
  const width = rx / .29, height = ry / .37;
  output.drawImage(patch, w * FACE.x - width / 2, h * FACE.y - height / 2, width, height);
  return result;
}

export function setupGroupPhoto(dialog, render, version) {
  const input = dialog.querySelector('input[type=file]');
  const editor = dialog.querySelector('canvas');
  const adjust = dialog.querySelector('.group-photo-adjust');
  const zoom = dialog.querySelector('#group-photo-zoom');
  const rotate = dialog.querySelector('#group-photo-rotate');
  const status = dialog.querySelector('[role=status]');
  const generate = dialog.querySelector('#make-group-photo');
  const edit = dialog.querySelector('#edit-group-photo');
  const save = dialog.querySelector('#save-group-photo');
  const download = dialog.querySelector('#download-group-photo');
  const preview = dialog.querySelector('img');
  let template, photo, outputURL, outputFile, drag, busy = false, revision = 0;
  let fit = { ...FIT };

  function clearOutput() {
    if (outputURL) URL.revokeObjectURL(outputURL);
    outputURL = outputFile = undefined;
    preview.hidden = true;
    preview.removeAttribute('src');
    download.removeAttribute('href');
    save.hidden = download.hidden = edit.hidden = true;
  }
  function refresh() {
    if (!photo) return;
    drawEditor(editor, photo, fit);
    if (!preview.hidden) {
      clearOutput();
      editor.hidden = false;
      status.textContent = '';
    }
  }
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const attempt = ++revision;
    photo = drag = undefined;
    clearOutput();
    generate.disabled = adjust.hidden = editor.hidden = true;
    status.textContent = '正在读取照片…';
    try {
      const selected = await resizeLocalPhoto(file);
      if (attempt !== revision || !dialog.open) return;
      photo = selected;
      fit = { ...FIT };
      zoom.value = FIT.zoom;
      rotate.value = FIT.angle;
      editor.hidden = adjust.hidden = false;
      generate.disabled = busy;
      status.textContent = '拖动照片，把眼睛对准虚线，脸留在椭圆内。';
      refresh();
    } catch {
      if (attempt === revision) status.textContent = '这张照片无法读取，请换成 JPG、PNG 或手机截图。';
    }
  });
  zoom.addEventListener('input', () => { fit.zoom = zoom.valueAsNumber; refresh(); });
  rotate.addEventListener('input', () => { fit.angle = rotate.valueAsNumber; refresh(); });
  editor.addEventListener('pointerdown', event => {
    if (!photo || drag || event.button !== 0) return;
    editor.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  editor.addEventListener('pointermove', event => {
    if (!photo || drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const angle = -fit.angle * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const unit = Math.min(photo.width, photo.height) / (editor.clientWidth * fit.zoom);
    fit.x = Math.max(0, Math.min(1, fit.x - (dx * c - dy * s) * unit / photo.width));
    fit.y = Math.max(0, Math.min(1, fit.y - (dx * s + dy * c) * unit / photo.height));
    drag.x = event.clientX;
    drag.y = event.clientY;
    refresh();
  });
  editor.addEventListener('lostpointercapture', () => { drag = undefined; });

  generate.addEventListener('click', async () => {
    if (!photo || busy) return;
    const attempt = revision;
    const source = photo, crop = { ...fit };
    busy = generate.disabled = true;
    status.textContent = '正在生成花海合影…';
    try {
      template ??= await decodeImage(`${TEMPLATE_URL}?v=${version}`);
      if (attempt !== revision || !dialog.open) return;
      const image = canvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
      const ctx = image.getContext('2d');
      render(ctx, 0, 0, image.width, image.height, makePortrait(template, source, crop));
      const shade = ctx.createLinearGradient(0, image.height - 142, 0, image.height);
      shade.addColorStop(0, '#0f171100');
      shade.addColorStop(1, '#0f1711bc');
      ctx.fillStyle = shade;
      ctx.fillRect(0, image.height - 142, image.width, 142);
      ctx.strokeStyle = '#ffe4b191';
      ctx.strokeRect(25.5, 25.5, image.width - 51, image.height - 51);
      ctx.fillStyle = '#ffebca';
      ctx.font = '500 30px "Songti SC", "Noto Serif CJK SC", serif';
      ctx.fillText('康乃馨 7.0 · 花海合影', 51, image.height - 51);
      const blob = await new Promise(resolve => image.toBlob(resolve, 'image/jpeg', .94));
      if (!blob) throw new Error('Cannot encode image');
      if (attempt !== revision || !dialog.open) return;
      clearOutput();
      outputFile = new File([blob], '康乃馨7.0-花海合影.jpg', { type: 'image/jpeg' });
      outputURL = URL.createObjectURL(blob);
      preview.src = outputURL;
      preview.hidden = save.hidden = download.hidden = edit.hidden = false;
      editor.hidden = true;
      download.href = outputURL;
      status.textContent = '可分享、下载，也可长按图片保存。';
    } catch {
      if (attempt === revision) status.textContent = '合影生成失败，请重试。';
    } finally {
      busy = false;
      generate.disabled = !photo;
    }
  });
  edit.addEventListener('click', () => {
    clearOutput();
    editor.hidden = false;
    status.textContent = '拖动照片，把眼睛对准虚线，脸留在椭圆内。';
  });
  save.addEventListener('click', async () => {
    if (!outputFile) return;
    if (await shareImage(outputFile, '康乃馨 7.0 · 花海合影')) return;
    status.textContent = '可长按合影保存，或点「下载图片」。';
  });
  dialog.querySelector('#back-from-group-photo').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    revision++;
    clearOutput();
    photo = drag = undefined;
    input.value = '';
    editor.getContext('2d').clearRect(0, 0, editor.width, editor.height);
    editor.hidden = adjust.hidden = generate.disabled = true;
    status.textContent = '';
  });
  return () => { if (!dialog.open) dialog.showModal(); };
}
