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
    get unlocked() { return unlocked; },
    get claimed() { return claimed; },
  };
}

export function recordInReach(player) {
  return Math.abs(player.y) < .22 && player.z < RECORD_POSITION.z
    && Math.hypot(player.x - RECORD_POSITION.x, player.z - RECORD_POSITION.z) < 1.32;
}
