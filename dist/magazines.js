const EDITIONS = [
  ['视相 Variety', '2021.04.23'],
  ['NYLON_CHINA', '2020.02.03'],
  ['时装 L’OFFICIEL', '2020.01.08'],
  ['时尚芭莎', '2019.08.12'],
  ['男人装', '2019.05.09'],
  ['南都娱乐', '2019.04.26'],
  ['精品购物指南', '2019.04.24'],
  ['芭莎男士', '2019.03.22'],
  ['城市画报', '2019.10.08'],
  ['时髦星 Young', '2018.08.28'],
  ['Q杂志', '2020.05.03'],
];

// Choose one slot per zone, then shuffle which edition goes to each slot.
const SHARED_ZONES = [
  [-7.9, -7.05], [-5.25, -4.3], [-2.25, -.95], [5.94, 7.52],
];
const SHELVES = [
  { floorY: 0, zones: [...SHARED_ZONES, [1.55, 1.85], [3.6, 4.15]] },
  { floorY: 2.4, zones: [...SHARED_ZONES, [2.35, 3.1]] },
];

export function chooseMagazineSpots(random = Math.random) {
  const spots = SHELVES.flatMap(({ floorY, zones }) => zones.map(pair => ({
    x: pair[Math.floor(random() * pair.length)],
    y: floorY + (random() < .5 ? 1 : 1.4) + .202,
    // The shelf's front edge is at z = -6.31. Keep the cover ahead of it.
    z: -6.315,
    floorY,
  })));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  return spots;
}

function makeHalo(T, width, height) {
  const padding = .108;
  const pixelsPerMeter = 600;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((width + padding * 2) * pixelsPerMeter);
  canvas.height = Math.round((height + padding * 2) * pixelsPerMeter);
  const ctx = canvas.getContext('2d');
  const inset = padding * pixelsPerMeter;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffc050';
  ctx.shadowColor = '#ffad33';
  ctx.shadowBlur = 36;
  ctx.strokeRect(inset, inset, width * pixelsPerMeter, height * pixelsPerMeter);
  ctx.strokeRect(inset, inset, width * pixelsPerMeter, height * pixelsPerMeter);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const halo = new T.Mesh(new T.PlaneGeometry(width + padding * 2, height + padding * 2),
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, toneMapped: false }));
  halo.position.z = .010;
  return halo;
}

export function buildMagazines(T, scene, version, random = Math.random, loader = new T.TextureLoader()) {
  const items = [];
  const loads = [];
  const markerGeometry = new T.CircleGeometry(.034, 4);
  const markerMaterial = new T.MeshBasicMaterial({ color: '#ffd481', toneMapped: false });
  const edgeMaterial = new T.MeshBasicMaterial({ color: '#fff1b0', toneMapped: false });
  const edgeWidth = .018;
  const h = .354;
  const spots = chooseMagazineSpots(random);
  EDITIONS.forEach(([title, date], index) => {
    const spot = spots[index];
    const id = `magazine-${index + 1}`;
    const number = String(index + 1).padStart(2, '0');
    const url = `./assets/magazines/cover-${number}.webp?v=${version}`;
    const item = { id, title, date, url, ...spot, lit: false };
    items.push(item);
    loads.push(loader.loadAsync(url).then(texture => {
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
      const w = h * texture.image.width / texture.image.height;
      const display = new T.Group();
      display.name = item.title;
      display.position.set(spot.x, spot.y, spot.z);
      const base = new T.Mesh(new T.BoxGeometry(w + .019, h + .019, .016),
        new T.MeshStandardMaterial({ color: '#3a3026', roughness: .72 }));
      display.add(base);
      const cover = new T.Mesh(new T.PlaneGeometry(w, h),
        new T.MeshBasicMaterial({ map: texture, color: 0xdddddd, toneMapped: false }));
      cover.position.z = .012;
      display.add(cover);
      const marker = new T.Mesh(markerGeometry, markerMaterial);
      marker.position.set(w / 2, h / 2 - .012, .017);
      display.add(marker);

      const edges = new T.Group();
      for (const sign of [-1, 1]) {
        const horizontal = new T.Mesh(new T.PlaneGeometry(w + edgeWidth * 2, edgeWidth), edgeMaterial);
        horizontal.position.set(0, sign * (h + edgeWidth) / 2, .013);
        edges.add(horizontal);
        const vertical = new T.Mesh(new T.PlaneGeometry(edgeWidth, h), edgeMaterial);
        vertical.position.set(sign * (w + edgeWidth) / 2, 0, .013);
        edges.add(vertical);
      }
      edges.add(makeHalo(T, w + edgeWidth * 2, h + edgeWidth * 2));
      edges.visible = false;
      display.add(edges);
      scene.add(display);
      item.display = display;
      item.illuminate = () => {
        base.material.color.set('#b98345');
        cover.material.color.set(0xffffff);
        marker.visible = false;
        edges.visible = true;
      };
    }));
  });
  const ready = Promise.all(loads).then(() => true).catch(error => {
    console.error('Magazine covers failed to load', error);
    return false;
  });
  return {
    items, ready,
    light(id) {
      const item = items.find(cover => cover.id === id);
      if (!item?.illuminate || item.lit) return false;
      item.lit = true;
      item.illuminate();
      return true;
    },
  };
}

export function magazineInReach(items, player) {
  return items.filter(item => !item.lit && item.illuminate
    && Math.abs(item.floorY - player.y) < .22 && player.z > item.z
    && Math.hypot(item.x - player.x, item.z - player.z) < 1.32)
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z)
      - Math.hypot(b.x - player.x, b.z - player.z))[0] || null;
}
