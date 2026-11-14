const ROLES = [
  ['魏劭', '折腰'], ['宁远舟', '一念关山'], ['南珩／离十六', '书卷一梦'],
  ['白愁飞', '说英雄谁是英雄'], ['燕子京', '珠帘玉幕'], ['皓都', '长歌行'],
  ['洛铭西', '安乐传'], ['蒋俊豪', '做自己的光'], ['卓不凡', '天行健'],
  ['帝林', '紫川'], ['小贝', '玫瑰丛生'], ['黑眼镜', '终极笔记'],
];

export function chooseRoleSpots(random = Math.random) {
  // Keep one portrait in each section, with three portraits on each book level.
  const sections = [[-7.5, -6.35, -5.15], [-2.9, -1.1, .55], [3.5, 5.2, 7.05]];
  const spots = [0, 2.4, 4.8, 7.2].flatMap(floorY => sections.map(section => ({
    x: section[Math.floor(random() * section.length)],
    y: floorY + (random() < .5 ? 1.22 : 1.62),
    z: -6.282,
    floorY,
  })));
  for (let index = spots.length - 1; index > 0; index--) {
    const pick = Math.floor(random() * (index + 1));
    [spots[index], spots[pick]] = [spots[pick], spots[index]];
  }
  return spots;
}

export function buildRolePortraits(T, scene, version, loader = new T.TextureLoader()) {
  const display = new T.Group();
  display.visible = false;
  scene.add(display);
  const frameMaterial = new T.MeshBasicMaterial({ color: '#e5b9f1', toneMapped: false });
  const accentMaterial = new T.MeshBasicMaterial({ color: '#fbe5ff', toneMapped: false });
  const accent = new T.CircleGeometry(.045, 4);
  const entries = chooseRoleSpots().map((spot, index) => {
    const [name, series] = ROLES[index];
    const url = `./assets/roles/role-${String(index + 1).padStart(2, '0')}.webp?v=${version}`;
    const portrait = new T.Group();
    portrait.position.set(spot.x, spot.y, spot.z);
    portrait.name = name;
    display.add(portrait);
    return { ...spot, id: `role-${index + 1}`, title: `${name} · 《${series}》`, name, url, portrait, received: false, loaded: false };
  });
  const ready = Promise.all(entries.map(async entry => {
    const texture = await loader.loadAsync(entry.url);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const height = .43;
    const width = height * texture.image.width / texture.image.height;
    const frame = new T.Mesh(new T.BoxGeometry(width + .029, height + .029, .025), frameMaterial);
    entry.portrait.add(frame);
    const image = new T.Mesh(new T.PlaneGeometry(width, height),
      new T.MeshBasicMaterial({ map: texture, toneMapped: false }));
    image.position.z = .015;
    entry.portrait.add(image);
    const diamond = new T.Mesh(accent, accentMaterial);
    diamond.position.set(0, height / 2 + .037, .025);
    entry.portrait.add(diamond);
    entry.loaded = true;
  })).then(() => true).catch(error => {
    console.error('Role portraits failed to load', error);
    return false;
  });
  return {
    entries, ready,
    show() { display.visible = true; },
    receive(id) {
      const entry = entries.find(role => role.id === id);
      if (!entry || entry.received) return false;
      entry.received = true;
      entry.portrait.visible = false;
      return true;
    },
  };
}

export function roleInReach(entries, player) {
  let nearest = null;
  let nearestDistance = 1.32;
  for (const entry of entries) {
    if (entry.loaded === false || entry.received || Math.abs(entry.floorY - player.y) >= .22 || player.z <= entry.z) continue;
    const distance = Math.hypot(entry.x - player.x, entry.z - player.z);
    if (distance < nearestDistance) {
      nearest = entry;
      nearestDistance = distance;
    }
  }
  return nearest;
}
