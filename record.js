import { keepsakeText, textLines } from './keepsake.js?v=20261113-r46';

export const RECORD_POSITION = { x: -2.85, y: 1.53, z: 8.87 };

export function buildRecord(T, scene, version, loader = new T.TextureLoader()) {
  const url = `./assets/record/album.webp?v=${version}`;
  const display = new T.Group();
  display.position.set(RECORD_POSITION.x, RECORD_POSITION.y, RECORD_POSITION.z);
  display.rotation.y = Math.PI;
  display.visible = false;
  scene.add(display);
  const width = 1.18;
  const height = width * 582 / 944;
  const frame = new T.Mesh(
    new T.BoxGeometry(width + .055, height + .055, .065),
    new T.MeshStandardMaterial({ color: '#bb9556', metalness: .35, roughness: .46 }),
  );
  display.add(frame);
  let plaque;
  function setMessage(message) {
    const value = keepsakeText(message).trim();
    if (!value) {
      if (plaque) plaque.visible = false;
      return;
    }
    if (!plaque) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      plaque = new T.Mesh(new T.PlaneGeometry(1.48, .74),
        new T.MeshBasicMaterial({ map, toneMapped: false }));
      plaque.position.set(1.54, -.05, .038);
      display.add(plaque);
    }
    const map = plaque.material.map;
    const ctx = map.image.getContext('2d');
    ctx.fillStyle = '#24251d';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#bfa670';
    ctx.lineWidth = 3;
    ctx.strokeRect(21, 21, 982, 470);
    ctx.fillStyle = '#cdb784';
    ctx.font = '36px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('写给这一晚', 60, 91);
    ctx.fillStyle = '#fff0d5';
    ctx.font = '56px "Songti SC", "Noto Serif CJK SC", serif';
    const lines = textLines(ctx, value, 900).slice(0, 5);
    lines.forEach((line, index) => ctx.fillText(line, 60, 164 + index * 64));
    map.needsUpdate = true;
    plaque.visible = true;
  }
  let loaded = false;
  const ready = loader.loadAsync(url).then(texture => {
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const photo = new T.Mesh(
      new T.PlaneGeometry(width, height),
      new T.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    photo.position.z = .034;
    display.add(photo);
    loaded = true;
    return true;
  }).catch(error => {
    console.error('Record photo failed to load', error);
    return false;
  });
  let unlocked = false;
  let claimed = false;
  return {
    id: 'record', title: '刘宇宁首张专辑', url, ready,
    unlock(wasClaimed = false) {
      unlocked = true;
      claimed = wasClaimed;
      display.visible = true;
    },
    inReach(player) {
      return loaded && unlocked && !claimed && recordInReach(player);
    },
    claim() { claimed = true; },
    setMessage,
    get unlocked() { return unlocked; },
    get claimed() { return claimed; },
  };
}

export function recordInReach(player) {
  return Math.abs(player.y) < .22 && player.z < RECORD_POSITION.z
    && Math.hypot(player.x - RECORD_POSITION.x, player.z - RECORD_POSITION.z) < 1.32;
}
