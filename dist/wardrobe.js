const CHANGE = '这是一个换装彩蛋';
const RESTORE = '换回刚才那件';
const HOLD_MS = 2000;

export function setupWardrobe(T, scene, camera, button, changeOutfit) {
  const label = button.querySelector('strong');
  const hint = button.querySelector('small');
  const ring = button.querySelector('.progress');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const sign = new T.Sprite(new T.SpriteMaterial({ map, depthWrite: false, toneMapped: false }));
  sign.position.set(3.15, 1.96, -3.23);
  sign.scale.set(1.55, .436, 1);
  sign.visible = false;
  sign.name = '电子琴换装投影';
  scene.add(sign);

  const projected = new T.Vector3();
  let hold = null;
  let white = false;
  let pending = false;
  let restorePressed = false;
  function drawSign() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(38, 14); ctx.lineTo(477, 14); ctx.lineTo(496, 34);
    ctx.lineTo(496, 110); ctx.lineTo(475, 130); ctx.lineTo(35, 130);
    ctx.lineTo(15, 109); ctx.lineTo(15, 35); ctx.closePath();
    ctx.fillStyle = '#0d2b37c9';
    ctx.fill();
    ctx.strokeStyle = '#95e4efb3';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#63d8ff';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e5faff';
    ctx.textAlign = 'center';
    ctx.font = '600 42px sans-serif';
    ctx.fillText(white ? RESTORE : CHANGE, 256, 70);
    ctx.font = '500 21px sans-serif';
    ctx.fillStyle = '#9cdce7';
    ctx.fillText(white ? '点击切换' : '长按 2 秒', 256, 106);
    map.needsUpdate = true;
  }
  drawSign();

  function cancel() {
    const pointer = hold?.pointer;
    hold = null;
    ring.style.strokeDashoffset = '100';
    if (pointer !== undefined && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
  }
  async function apply(restore) {
    cancel();
    pending = true;
    button.disabled = true;
    hint.textContent = '正在换装…';
    try {
      if (await changeOutfit(!restore)) {
        white = !restore;
        label.textContent = white ? RESTORE : CHANGE;
        drawSign();
      }
    } finally {
      hint.textContent = white ? '点击切换' : '长按 2 秒';
      pending = false;
      button.disabled = false;
    }
  }
  button.addEventListener('pointerdown', event => {
    if (pending || hold || event.button !== 0) return;
    restorePressed = white;
    if (white) return;
    event.preventDefault();
    hold = { since: performance.now(), pointer: event.pointerId };
    button.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      if (hold?.pointer === event.pointerId) cancel();
    });
  }
  button.addEventListener('keydown', event => {
    if (white || pending || !['Enter', 'Space'].includes(event.code)) return;
    event.preventDefault();
    if (!hold) hold = { since: performance.now(), key: event.code };
  });
  button.addEventListener('keyup', event => {
    if (hold?.key === event.code) {
      event.preventDefault();
      cancel();
    }
  });
  button.addEventListener('click', event => {
    // Releasing the original two-second hold can also dispatch a click.
    if (white && !pending && !button.hidden && (!event.detail || restorePressed)) void apply(true);
    restorePressed = false;
  });
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('blur', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', cancel);

  return function update(now, active, unlocked, player) {
    const onStage = active && unlocked && Math.abs(player.y) < .35;
    const inReach = onStage && Math.hypot(player.x - sign.position.x, player.z - sign.position.z) < 2.8;
    if (inReach) {
      camera.updateMatrixWorld();
      projected.copy(sign.position).project(camera);
    }
    const inView = inReach && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .83 && Math.abs(projected.y) < .83;
    sign.visible = onStage && !inView;
    button.hidden = !inView;
    if (!inView) {
      cancel();
      return false;
    }
    button.style.left = `${(projected.x + 1) * 50}%`;
    button.style.top = `${(1 - projected.y) * 50}%`;
    if (hold) {
      const progress = Math.min(1, (now - hold.since) / HOLD_MS);
      ring.style.strokeDashoffset = String(100 * (1 - progress));
      if (progress === 1) void apply(false);
    }
    return true;
  };
}
