import { shareImage } from './keepsake.js?v=20261113-r36';

// All player image data stays in this dialog's memory until it is closed.
const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 900;
const GUIDE_SIZE = 300;
const FIT = { x: .5, y: .42, zoom: 1.38, angle: 0 };

// Head crops use normalized coordinates. Masks and eye/mouth guides use the editor's 300px view.
const POSES = {
  front: {
    file: 'white-dress-guest.webp',
    head: [253 / 600, 44 / 900, 100 / 600, 100 / 900],
    contour: 'M151 30 C181 31 204 52 221 86 C225 100 227 111 234 125 C242 158 219 196 199 225 C180 249 164 263 148 264 C125 262 101 245 83 223 C61 196 43 159 51 128 C51 111 64 99 69 81 C87 51 112 33 151 30 Z',
    eyes: [[88, 105], [198, 105]],
    mouth: [[113, 216], [190, 216]],
    instruction: '选一张清晰的正脸照。',
  },
  duet: {
    file: 'white-dress-duet.webp',
    head: [244 / 600, 36 / 900, 86 / 600, 96 / 900],
    contour: 'M103 82 Q120 73 133 68 Q145 68 154 78 Q167 72 177 59 Q190 49 204 45 C221 51 239 74 251 94 C264 113 269 127 265 144 C258 161 257 183 255 202 C251 224 250 234 234 247 C220 260 204 275 186 276 C165 276 140 263 119 244 C95 223 76 202 65 178 C59 160 65 143 78 126 C92 110 92 97 103 82 Z',
    eyes: [[146, 106], [229, 77]],
    mouth: [[179, 207], [243, 189]],
    instruction: '选一张脸朝照片右侧约 25–35° 的照片，最好双眼都能看到。朝左的照片可用「左右翻转」。',
  },
};
const ADJUST_HINT = '拖动照片，对准眼睛和嘴巴。放大到金线内看不到原照片背景，再生成合影。';

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
  if (fit.mirror) ctx.scale(-1, 1);
  ctx.drawImage(photo, -photo.width * fit.x * scale, -photo.height * fit.y * scale,
    photo.width * scale, photo.height * scale);
}

function createFaceLayer(size, pose) {
  const contour = new Path2D(pose.contour);
  const mask = canvas(size, size);
  const alpha = mask.getContext('2d');
  alpha.scale(size / GUIDE_SIZE, size / GUIDE_SIZE);
  alpha.fillStyle = '#fff';
  // Layer progressively tighter contours for a soft edge that never spills outside the guide.
  for (const [scale, strength] of [[1, .06], [.98, .19], [.955, .37], [.932, .62], [.91, 1]]) {
    alpha.save();
    alpha.translate(150, 148);
    alpha.scale(scale, scale);
    alpha.translate(-150, -148);
    alpha.globalAlpha = strength;
    alpha.fill(contour);
    alpha.restore();
  }
  const patch = canvas(size, size);
  const skin = patch.getContext('2d');
  return {
    contour, pose,
    draw(photo, fit) {
      skin.clearRect(0, 0, size, size);
      skin.save();
      skin.filter = 'brightness(.96) saturate(.94)';
      drawCrop(skin, photo, fit, size);
      skin.restore();
      skin.globalCompositeOperation = 'destination-in';
      skin.drawImage(mask, 0, 0);
      skin.globalCompositeOperation = 'source-over';
      return patch;
    },
  };
}

function headBox(template, pose) {
  const { naturalWidth: w, naturalHeight: h } = template;
  return pose.head.map((part, index) => part * (index % 2 === 0 ? w : h));
}

function drawEditor(editor, template, photo, fit, layer, showSource) {
  const ctx = editor.getContext('2d');
  const size = editor.width;
  ctx.fillStyle = '#171c17';
  ctx.fillRect(0, 0, size, size);
  if (showSource) {
    ctx.save();
    drawCrop(ctx, photo, fit, size);
    ctx.restore();
    ctx.save();
    ctx.scale(size / GUIDE_SIZE, size / GUIDE_SIZE);
    ctx.fillStyle = '#10140dbf';
    const shade = new Path2D();
    shade.rect(0, 0, GUIDE_SIZE, GUIDE_SIZE);
    shade.addPath(layer.contour);
    ctx.fill(shade, 'evenodd');
    ctx.restore();
  } else {
    ctx.drawImage(template, ...headBox(template, layer.pose), 0, 0, size, size);
    ctx.drawImage(layer.draw(photo, fit), 0, 0, size, size);
  }
  ctx.save();
  ctx.scale(size / GUIDE_SIZE, size / GUIDE_SIZE);
  ctx.strokeStyle = '#ffe1a8';
  ctx.lineWidth = 1.5;
  ctx.stroke(layer.contour);
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  const [[leftX, leftY], [rightX, rightY]] = layer.pose.eyes;
  const [mouthLeft, mouthRight] = layer.pose.mouth;
  ctx.moveTo(leftX - 16, leftY);
  ctx.lineTo(rightX + 16, rightY);
  ctx.moveTo(...mouthLeft);
  ctx.lineTo(...mouthRight);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of layer.pose.eyes) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function makePortrait(template, photo, fit, layer) {
  const result = canvas(template.naturalWidth, template.naturalHeight);
  const ctx = result.getContext('2d');
  ctx.drawImage(template, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(layer.draw(photo, fit), ...headBox(template, layer.pose));
  return result;
}

export function setupGroupPhoto(dialog, render, version, prepareStage) {
  const input = dialog.querySelector('input[type=file]');
  const editor = dialog.querySelector('canvas');
  const adjust = dialog.querySelector('.group-photo-adjust');
  const zoom = dialog.querySelector('#group-photo-zoom');
  const rotate = dialog.querySelector('#group-photo-rotate');
  const sourceToggle = dialog.querySelector('#group-photo-source');
  const mirror = dialog.querySelector('#group-photo-mirror');
  const poseField = dialog.querySelector('#group-photo-pose');
  const instruction = dialog.querySelector('#group-photo-instruction');
  const status = dialog.querySelector('[role=status]');
  const generate = dialog.querySelector('#make-group-photo');
  const edit = dialog.querySelector('#edit-group-photo');
  const save = dialog.querySelector('#save-group-photo');
  const download = dialog.querySelector('#download-group-photo');
  const preview = dialog.querySelector('img');
  const templates = new Map();
  let template, layer, photo, outputURL, outputFile, drag, busy = false, revision = 0;
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
    drawEditor(editor, template, photo, fit, layer, sourceToggle.checked);
    if (!preview.hidden) {
      clearOutput();
      editor.hidden = false;
      status.textContent = '';
    }
  }
  async function updateTemplate(attempt) {
    const pose = POSES[poseField.value];
    drag = undefined;
    status.textContent = '正在加载姿势…';
    template = layer = undefined;
    editor.hidden = adjust.hidden = generate.disabled = true;
    clearOutput();
    try {
      const image = templates.get(pose) ?? await decodeImage(`./assets/performer/${pose.file}?v=${version}`);
      templates.set(pose, image);
      if (attempt !== revision || !dialog.open) return;
      template = image;
      layer = createFaceLayer(384, pose);
      fit = { ...FIT };
      zoom.value = FIT.zoom;
      rotate.value = FIT.angle;
      sourceToggle.checked = mirror.checked = false;
      editor.hidden = adjust.hidden = false;
      generate.disabled = busy;
      status.textContent = ADJUST_HINT;
      refresh();
    } catch {
      if (attempt === revision) status.textContent = '姿势素材加载失败，请重新选择照片再试。';
    }
  }

  function updateInstruction() {
    instruction.textContent = POSES[poseField.value].instruction;
  }
  poseField.addEventListener('change', () => {
    updateInstruction();
    if (photo) updateTemplate(++revision);
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const attempt = ++revision;
    photo = drag = undefined;
    clearOutput();
    generate.disabled = adjust.hidden = editor.hidden = true;
    status.textContent = '正在读取照片…';
    let selected;
    try {
      selected = await resizeLocalPhoto(file);
    } catch {
      if (attempt === revision) status.textContent = '这张照片无法读取，请换成 JPG、PNG 或手机截图。';
      return;
    }
    if (attempt !== revision || !dialog.open) return;
    photo = selected;
    await updateTemplate(attempt);
  });
  mirror.addEventListener('change', () => { fit.mirror = mirror.checked; refresh(); });
  sourceToggle.addEventListener('change', refresh);
  zoom.addEventListener('input', () => { fit.zoom = zoom.valueAsNumber; refresh(); });
  rotate.addEventListener('input', () => { fit.angle = rotate.valueAsNumber; refresh(); });
  editor.addEventListener('pointerdown', event => {
    if (!photo || !layer || drag || event.button !== 0) return;
    editor.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  editor.addEventListener('pointermove', event => {
    if (!photo || drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const angle = -fit.angle * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const unit = Math.min(photo.width, photo.height) / (editor.clientWidth * fit.zoom);
    fit.x = Math.max(0, Math.min(1, fit.x - (dx * c - dy * s) * unit / photo.width * (fit.mirror ? -1 : 1)));
    fit.y = Math.max(0, Math.min(1, fit.y - (dx * s + dy * c) * unit / photo.height));
    drag.x = event.clientX;
    drag.y = event.clientY;
    refresh();
  });
  editor.addEventListener('lostpointercapture', () => { drag = undefined; });

  generate.addEventListener('click', async () => {
    if (!photo || !template || !layer || busy) return;
    const attempt = revision;
    const source = photo, crop = { ...fit };
    const pose = poseField.value;
    busy = generate.disabled = true;
    status.textContent = '正在生成图片…';
    try {
      if (!await prepareStage()) {
        if (attempt === revision) status.textContent = '呆米的素材暂未加载成功，请重新加载花房后再试。';
        return;
      }
      if (attempt !== revision || !dialog.open) return;
      const image = canvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
      const ctx = image.getContext('2d');
      render(ctx, 0, 0, image.width, image.height, makePortrait(template, source, crop, layer), pose);
      const shade = ctx.createLinearGradient(0, image.height - 142, 0, image.height);
      shade.addColorStop(0, '#0f171100');
      shade.addColorStop(1, '#0f1711bc');
      ctx.fillStyle = shade;
      ctx.fillRect(0, image.height - 142, image.width, 142);
      ctx.strokeStyle = '#ffe4b191';
      ctx.strokeRect(25.5, 25.5, image.width - 51, image.height - 51);
      ctx.fillStyle = '#ffebca';
      ctx.font = '500 30px "Songti SC", "Noto Serif CJK SC", serif';
      ctx.fillText(pose === 'duet' ? '康乃馨 7.0 · 花海对唱' : '康乃馨 7.0 · 花海合影', 51, image.height - 51);
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
      generate.disabled = !photo || !layer;
    }
  });
  edit.addEventListener('click', () => {
    clearOutput();
    editor.hidden = false;
    status.textContent = ADJUST_HINT;
  });
  save.addEventListener('click', async () => {
    if (!outputFile) return;
    if (await shareImage(outputFile, '康乃馨 7.0 · 花海合影') !== 'unavailable') return;
    status.textContent = '可长按合影保存，或点「下载图片」。';
  });
  dialog.querySelector('#back-from-group-photo').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    revision++;
    clearOutput();
    photo = drag = layer = undefined;
    input.value = '';
    editor.getContext('2d').clearRect(0, 0, editor.width, editor.height);
    editor.hidden = adjust.hidden = generate.disabled = true;
    status.textContent = '';
  });
  updateInstruction();
  return () => { if (!dialog.open) dialog.showModal(); };
}
