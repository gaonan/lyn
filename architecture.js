import { makeConcreteFloorColor, makeSurfaceMaps } from './surface-maps.js?v=20261121-r90';
import { applyStairFinish, makeStairFinishes } from './stair-finishes.js?v=20261121-r90';

// Event-space reconstruction from the user's photographs 1–8.
// Ground flowers and performance area face the rear book wall. Photo 1 shows a
// broad right lounge BETWEEN two bookshelf-walkway elevations, joined by short
// opposing stairs. Heights and hidden links are perspective estimates, not survey
// dimensions. Earlier architect-plan-based roof and full U galleries are removed.
export function buildArchitecture(THREE, scene, bakeSolid) {
  const colliders = [], surfaces = [], railPaths = [], flowerBeds = [], contactShadows = [];
  const group = new THREE.Group(); group.name = 'Flower cafe architecture'; scene.add(group);
  const loungeStair = new THREE.Group();
  loungeStair.name = 'Lounge stairs to the ground floor';
  group.add(loungeStair);
  let batchParent = group;
  const batches = new Map(), temp = new THREE.Object3D();
  // Keep the original placement sequence independent of the material textures.
  let seed = 1863998497;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const ballGeo = new THREE.SphereGeometry(1, 10, 7);

  const concrete = makeSurfaceMaps(THREE, 'concrete');
  const plaster = makeSurfaceMaps(THREE, 'plaster');
  const wood = makeSurfaceMaps(THREE, 'wood');
  const linen = makeSurfaceMaps(THREE, 'fabric');
  function surface(maps, x, y, strength, angle = 0) {
    const { map, normalMap, roughnessMap } = maps;
    const tiled = Object.fromEntries(Object.entries({ map, normalMap, roughnessMap }).map(([name, source]) => {
      const texture = source.clone();
      texture.repeat.set(x, y);
      texture.rotation = angle;
      return [name, texture];
    }));
    return { ...tiled, normalScale: new THREE.Vector2(strength, strength) };
  }
  const material = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: .83, ...props });
  const mats = {
    concrete: material('#c1b9ae', { ...surface(concrete, 2, 1, .30), roughness: 1 }),
    floor: material('#bcb6ae', {
      ...surface(concrete, 9, 8, .24), map: makeConcreteFloorColor(THREE), roughness: 1,
    }),
    wall: material('#c2bcb3', { ...surface(plaster, 4, 3, .26), roughness: 1 }),
    wood: material('#ba9f84', { ...surface(wood, 1, 1, .57), roughness: 1 }),
    darkWood: material('#a28570', { ...surface(wood, 2, 3, .45), roughness: 1 }),
    deck: material('#ad9987', { ...surface(wood, 1, 1, .32, Math.PI / 2), roughness: .94 }),
    stairConcrete: material('#bcb4a6', { roughness: .89 }),
    stairWood: material('#a17552', { roughness: .73 }),
    black: material('#292c2b', { roughness: .43, metalness: .45 }),
    book: material('#ffffff', { roughness: .8 }),
    paper: material('#dfd5bf'),
    fabric: material('#f0e7d8', { ...surface(linen, 4, 3, .43), roughness: 1 }),
    moss: material('#304634'),
    brass: material('#a7804c', { roughness: .43, metalness: .55 }),
    ivory: material('#ede0c4'),
    glass: material('#b3c8cb', { emissive: '#8fa7ab', emissiveIntensity: .2, roughness: .23, metalness: .23 }),
    light: new THREE.MeshBasicMaterial({ color: '#ffe6be', toneMapped: false }),
    dark: material('#141c18'),
    red: material('#d95940'),
    chrome: material('#b9b7a4', { metalness: .65, roughness: .3 }),
    truss: material('#58616b', { metalness: .35, roughness: .6 }),
  };
  mats.deck.userData.varyInstanceUv = true;
  const bookcaseStrip = mats.light.clone();
  const unlitUpperBooks = mats.book.clone();
  const unlitUpperPrint = mats.ivory.clone();
  for (const material of [unlitUpperBooks, unlitUpperPrint]) material.userData.concertShade = .30;
  const stairSupport = mats.concrete.clone();
  for (const material of [mats.stairConcrete, mats.stairWood, stairSupport]) {
    material.userData.nightShade = .60;
  }
  const messageWall = mats.wall.clone();
  messageWall.userData.nightWallGradient = true;
  function variation(a, b, c) {
    const value = Math.sin(a * 19.41 + b * 43.89 + c * 67.21) * 43758.5453;
    return value - Math.floor(value);
  }
  function entriesFor(geo, mat) {
    const key = `${batchParent.id}/${geo.uuid}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { geo, mat, parent: batchParent, entries: [] });
    return batches.get(key).entries;
  }
  function instance(geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, color, tile) {
    temp.position.set(x, y, z); temp.rotation.set(rx, ry, rz); temp.scale.set(sx, sy, sz); temp.updateMatrix();
    entriesFor(geo, mat).push({ matrix: temp.matrix.clone(), color, tile });
  }
  function box(m, x, y, z, w, h, d, ry = 0, color, tile) {
    instance(boxGeo, m, x, y, z, w, h, d, 0, ry, 0, color, tile);
    // Coarse, opaque surfaces drive the offline bake. Railing bars and trim
    // stay out of this proxy so the ground retains soft, clean shading.
    if (bakeSolid && !ry && m !== mats.glass && m !== mats.light
        && Math.min(w, h, d) >= .095 && w * h * d >= .045) {
      bakeSolid([x - w / 2, y - h / 2, z - d / 2], [x + w / 2, y + h / 2, z + d / 2],
        (color ?? m.color).toArray());
    }
  }
  const cylinder = (m, x, y, z, r, h, rx = 0, rz = 0) => instance(cylGeo, m, x, y, z, r, h, r, rx, 0, rz);
  function beam(m, a, b, width = .035) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), delta = vb.clone().sub(va);
    temp.position.copy(va).add(vb).multiplyScalar(.5);
    temp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    temp.scale.set(width, delta.length(), width); temp.updateMatrix();
    entriesFor(boxGeo, m).push({ matrix: temp.matrix.clone() });
  }
  function collider(minX, maxX, minZ, maxZ, minY, maxY, type) { colliders.push({ minX, maxX, minZ, maxZ, minY, maxY, type }); }
  function floor(minX, maxX, minZ, maxZ, y) {
    box(y === 0 ? mats.floor : mats.concrete, (minX + maxX) / 2, y - .14, (minZ + maxZ) / 2, maxX - minX, .28, maxZ - minZ);
    if (y > 0) {
      const rows = Math.ceil((maxZ - minZ) / .31);
      const width = (maxZ - minZ) / rows;
      for (let row = 0; row < rows; row++) {
        const z = minZ + (row + .5) * width;
        let x = minX;
        for (let board = 0; x < maxX; board++) {
          const length = board === 0
            ? .52 + 1.32 * variation(row + 1, minX, y)
            : 1.55 + .58 * variation(row, board, minZ);
          let end = Math.min(maxX, x + length);
          if (maxX - end < .20) end = maxX;
          const tint = new THREE.Color().setScalar(.84 + .18 * variation(x, z, y));
          box(mats.deck, (x + end) / 2, y + .006, z, end - x - .006, .018, width - .004, 0, tint);
          x = end;
        }
      }
    }
    const surface = { minX, maxX, minZ, maxZ, y };
    surfaces.push(surface);
    return surface;
  }
  function rail(a, b, flowering = true) {
    const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const count = Math.max(1, Math.ceil(distance / .21));
    beam(mats.black, [a[0], a[1] + 1.05, a[2]], [b[0], b[1] + 1.05, b[2]], .055);
    beam(mats.black, [a[0], a[1] + .12, a[2]], [b[0], b[1] + .12, b[2]], .027);
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      box(mats.black, x, y + .53, z, i % 5 === 0 ? .048 : .021, 1.05, i % 5 === 0 ? .048 : .021);
      if (i < count) {
        const tx = a[0] + (b[0] - a[0]) * (i + 1) / count, tz = a[2] + (b[2] - a[2]) * (i + 1) / count;
        const ty = a[1] + (b[1] - a[1]) * (i + 1) / count;
        collider(Math.min(x, tx) - .04, Math.max(x, tx) + .04, Math.min(z, tz) - .04, Math.max(z, tz) + .04, Math.min(y, ty), Math.max(y, ty) + 1.12, 'guardrail');
      }
    }
    if (flowering) railPaths.push({ a: [a[0], a[1] + 1.05, a[2]], b: [b[0], b[1] + 1.05, b[2]] });
  }

  // Narrow book walks and a broad, offset lounge: the space is not uniform floors.
  floor(-8.9, 8.9, -6.9, 8.9, 0);
  for (const y of [2.4, 4.8, 7.2]) floor(-8.8, 8.8, -6.8, -5.1, y);
  floor(4.5, 8.8, -2.1, -.7, 3.2);
  const loungeDeck = floor(4.8, 8.8, -.7, 8.7, 3.2);
  // A small upper-left turn landing returns to the highest book walk; no right U.
  floor(-8.8, -4.9, .6, 2, 7.2);
  floor(-6.5, -4.9, -5.1, .6, 7.2);

  box(mats.wall, 0, 5.05, -7.05, 18.2, 10.1, .3);
  box(messageWall, -9.05, 5.05, 1, .3, 10.1, 16.2);
  // The continuous plaster surface carries the record and visitor projections.
  box(messageWall, 0, 5.05, 9.04, 18.2, 10.1, .25);
  // Restore the original r68 flat plaster ceiling in daylight. Keep this mesh
  // outside the static wall batch so night can open the atrium to the stars.
  const ceiling = new THREE.Mesh(boxGeo, mats.wall);
  ceiling.name = 'Daylight ceiling';
  ceiling.position.set(0, 10.13, 1);
  ceiling.scale.set(18.2, .20, 16.2);
  ceiling.receiveShadow = true;
  ceiling.visible = false;
  group.add(ceiling);
  collider(-9.2, -8.91, -7.2, 9.2, 0, 11); collider(8.91, 9.2, -7.2, 9.2, 0, 11);
  collider(-9.2, 9.2, -7.2, -6.91, 0, 11); collider(-9.2, 9.2, 8.91, 9.2, 0, 11);
  for (const x of [-8.8, 8.8]) {
    box(mats.concrete, x, 4.95, -6.5, .38, 9.9, .44);
    collider(x-.2,x+.2,-6.75,-6.25,0,10.1);
  }
  // Photo 1: a large side window above the stairs, then a horizontal high window
  // above the lounge canopy. Most of this side is textured concrete, not glass.
  box(mats.wall, 9.05, 2.1, -4.55, .3, 4.2, 4.9);
  box(mats.wall, 9.05, 9.55, -4.55, .3, 1.1, 4.9);
  box(mats.wall, 9.05, 5.05, -6.85, .3, 10.1, .35);
  box(mats.wall, 9.05, 5.05, -2.15, .3, 10.1, .55);
  // Meet the back wall so the open sky is visible above the parapet.
  box(mats.wall, 9.05, 3.6, 3.545, .3, 7.2, 10.99);
  box(mats.wall, 9.05, 9.45, 3.545, .3, 1.3, 10.99);
  box(mats.wall, 9.05, 8.0, -.95, .3, 1.6, 1.6);
  box(mats.wall, 9.05, 8.0, 8.25, .3, 1.6, 1.5);
  function sideWindow(z1,z2,y1,y2,columns) {
    box(mats.glass,9.01,(y1+y2)/2,(z1+z2)/2,.04,y2-y1,z2-z1);
    for(const y of [y1,y2])box(mats.darkWood,8.96,y,(z1+z2)/2,.1,.075,z2-z1);
    for(let i=0;i<=columns;i++)box(mats.darkWood,8.96,(y1+y2)/2,z1+(z2-z1)*i/columns,.07,y2-y1,.055);
  }
  sideWindow(-6.62,-2.43,4.2,9,3);
  sideWindow(-.1,7.5,7.2,8.8,4);
  // Timber soffit and supporting columns over the lounge, as seen from the sofa aisle.
  box(mats.concrete,7.36,6.12,3.32,3.24,.30,10.65);
  box(mats.darkWood,7.36,5.958,3.32,3.24,.024,10.65);
  box(mats.wall,8.71,4.65,6.45,.08,2.65,1.55);
  box(mats.dark,8.655,4.59,6.45,.035,2.36,1.26);
  for(const z of [-1.7,3.4,8.3]) {
    box(mats.concrete,8.72,3.05,z,.36,6.1,.38);
    cylinder(mats.black,5.05,1.48,z,.075,2.96);
  }
  cylinder(mats.black,3.55,4.6,-5.03,.085,9.2);
  collider(3.45,3.65,-5.13,-4.93,0,9.2);
  // Distant leafy silhouettes sit behind the tall window rather than filling it.
  const gardenMat=material('#507347',{roughness:1});
  for(let i=0;i<22;i++)instance(ballGeo,gardenMat,8.99,4.5+random()*4.2,-6.4+random()*3.7,.018,.28+random()*.4,.25+random()*.4,0,0,0,new THREE.Color().setHSL(.25+random()*.05,.18,.28+random()*.12));
  // The thin warm lines are attached to the book-walk slab undersides.
  for(const y of [2.4,4.8,7.2])box(bookcaseStrip,0,y-.22,-5.087,17.5,.025,.025);
  box(mats.light,4.787,2.98,4,.025,.025,9.1);

  let stairCount = 0;
  function stairs({ axis = 'z', min, max, start, end, yStart, yEnd, underside = false }) {
    const across = (min + max) / 2;
    const width = max - min;
    const span = Math.abs(end - start);
    const count = Math.max(6, Math.round(Math.abs(yEnd - yStart) / .15));
    const depth = span / count;
    const direction = Math.sign(end - start);
    const transverse = axis === 'x';
    const point = (cross, y, run) => transverse ? [run, y, cross] : [cross, y, run];
    const tread = (material, run, y, w, h, d, tile) =>
      box(material, ...point(across, y, run), transverse ? d : w, h, transverse ? w : d, 0, undefined, tile);
    const nose = Math.sign((yStart - yEnd) * direction) * .009;

    for (let i = 0; i < count; i++) {
      const y = yStart + (yEnd - yStart) * (i + 1) / count;
      const run = start + direction * depth * (i + .5);
      const tile = stairCount++;
      tread(mats.stairConcrete, run, y - .09, width, .18, depth + .015, tile);
      tread(mats.stairWood, run + nose, y - .007, width, .030, depth + .025, tile);
      tread(mats.light, run - direction * (depth / 2 - .015), y - .025, width - .18, .012, .016);
      if (underside && y > .35) {
        // Keep ground-level head clearance under the descending flight.
        collider(run - depth / 2, run + depth / 2, min, max, y - .22, y - .12);
      }
    }
    for (const edge of [min + .05, max - .05]) {
      beam(stairSupport, point(edge, yStart - .16, start), point(edge, yEnd - .16, end), .28);
    }
    for (const edge of [min + .015, max - .015]) {
      rail(point(edge, yStart, start), point(edge, yEnd, end));
    }
    const lo = Math.min(start, end), hi = Math.max(start, end);
    surfaces.push(transverse
      ? { minX: lo, maxX: hi, minZ: min, maxZ: max, yStart, yEnd, xStart: start, xEnd: end }
      : { minX: min, maxX: max, minZ: lo, maxZ: hi, yStart, yEnd, zStart: start, zEnd: end });
  }
  // The short flight from the book wall descends beside the window to the
  // lounge. Follow the sofa aisle, then turn right toward the atrium to descend.
  stairs({ min: -8.5, max: -6.7, start: 1.6, end: -5.1, yStart: 0, yEnd: 2.4 });
  stairs({ min: 4.5, max: 6.3, start: -5.1, end: -2.1, yStart: 2.4, yEnd: 3.2 });
  stairs({ min: 6.7, max: 8.5, start: -5.1, end: -2.1, yStart: 4.8, yEnd: 3.2 });
  const firstLoungeCollider = colliders.length, firstLoungeRail = railPaths.length;
  batchParent = loungeStair;
  stairs({ axis: 'x', min: 7.02, max: 8.7, start: 4.8, end: -1.15, yStart: 3.2, yEnd: 0, underside: true });
  batchParent = group;
  const loungeStairSurface = surfaces.at(-1);
  const loungeStairColliders = new Set(colliders.slice(firstLoungeCollider));
  for (const path of railPaths.slice(firstLoungeRail)) path.concertHidden = true;
  stairs({ min: -8.5, max: -6.7, start: -5.1, end: .6, yStart: 4.8, yEnd: 7.2 });
  if (!bakeSolid) {
    const finishes = makeStairFinishes(THREE, stairCount);
    applyStairFinish(mats.stairWood, finishes.wood, .012);
    applyStairFinish(mats.stairConcrete, finishes.stone, .006);
  }
  // Book-wall guardrails, with openings exactly at the ends of those flights.
  rail([-8.8,2.4,-5.1],[-8.5,2.4,-5.1]);
  rail([-6.7,2.4,-5.1],[4.5,2.4,-5.1]);
  rail([6.3,2.4,-5.1],[8.8,2.4,-5.1]);
  rail([-8.8,4.8,-5.1],[-8.5,4.8,-5.1]);
  rail([-6.7,4.8,-5.1],[6.7,4.8,-5.1]);
  rail([8.5,4.8,-5.1],[8.8,4.8,-5.1]);
  rail([-8.8,7.2,-5.1],[-6.5,7.2,-5.1]);
  rail([-4.9,7.2,-5.1],[8.8,7.2,-5.1]);
  for(const y of [2.4,4.8,7.2]){
    rail([-8.8,y,-6.8],[-8.8,y,-5.1]);
    rail([8.8,y,-6.8],[8.8,y,-5.1]);
  }
  rail([4.5,3.2,-2.1],[4.5,3.2,-.7]);
  rail([4.5,3.2,-.7],[4.8,3.2,-.7]);
  rail([4.8,3.2,-.7],[4.8,3.2,7.02]);
  rail([6.3,3.2,-2.1],[6.7,3.2,-2.1]);
  rail([8.5,3.2,-2.1],[8.8,3.2,-2.1]);
  rail([4.8,3.2,8.7],[8.8,3.2,8.7]);
  // Highest level is a left turn and back book walk, not a complete perimeter.
  rail([-6.5,7.2,-5.1],[-6.5,7.2,.6]);
  rail([-4.9,7.2,-5.1],[-4.9,7.2,2]);
  rail([-8.8,7.2,2],[-4.9,7.2,2]);
  rail([-8.8,7.2,.6],[-8.8,7.2,2]);

  // Full height face-out library: hundreds of colored book jackets, all instanced.
  const bookColors = ['#ae5946', '#d3ae63', '#97a595', '#607c87', '#c9bd9f', '#b9b491', '#586566', '#c2876b', '#e2c9a1', '#8a786f', '#98a9b4', '#ae7b6d'];
  for (const level of [0, 2.4, 4.8, 7.2]) {
    const coverMaterial = level === 0 ? mats.book : unlitUpperBooks;
    const printMaterial = level === 0 ? mats.ivory : unlitUpperPrint;
    const compactTier = true;
    const shelfSpacing = compactTier ? .4 : .53;
    box(mats.black, 0, level + (compactTier ? 1.08 : 1.4), -6.82, 17.6, compactTier ? 2.16 : 2.8, .12);
    for (let row = 0; row < 5; row++) {
      const y = level + .2 + row * shelfSpacing;
      box(mats.dark, 0, y, -6.58, 17.65, .045, .54);
      for (let x = -8.55; x < 8.5; ) {
        const w = .19 + random() * .12, h = compactTier ? .27 + random() * .08 : .34 + random() * .12;
        // Event photos show a distinctive dark-blue left / burnt-orange right
        // ground shelf, with lighter mixed-color covers on the higher shelves.
        const rowPalette = level === 0
          ? (x < -2 ? ['#293c4c','#354b61','#464d62','#465965','#35485a']
             : x < .8 ? ['#476877','#557b7c','#6c6476','#906d69','#557583']
             : ['#c27b56','#c4825c','#b97350','#d09065','#bd7554'])
          : ['#dfd7bd','#bdc5ad','#d6ba64','#6b9ba1','#ab6956','#d2d3bd','#b58462','#637b89'];
        const color = new THREE.Color(rowPalette[Math.floor(random() * rowPalette.length)]);
        box(coverMaterial, x + w / 2, y + h / 2 + .03, -6.56, w, h, .10, 0, color);
        // Cover border and typesetting marks, visible close up but cheap in a batch.
        const pale = random() > .6;
        box(pale ? printMaterial : mats.darkWood, x + w / 2, y + h * .67, -6.501, w * .57, .016, .006);
        box(pale ? printMaterial : mats.darkWood, x + w / 2, y + h * .56, -6.5, w * .4, .009, .006);
        if (random() > .6) box(mats.brass, x + w / 2, y + h * .29, -6.5, w * .28, h * .15, .007);
        x += w + .023 + random() * .025;
      }
    }
  }
  collider(-8.8, 8.8, -6.9, -6.3, 0, 9.5);
  // Round the upholstered edges so they catch light across the seams.
  function cushionGeometry(w, h, d) {
    const geo = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
    const pos = geo.getAttribute('position'), normal = geo.getAttribute('normal');
    const half = new THREE.Vector3(w / 2, h / 2, d / 2);
    const point = new THREE.Vector3(), inner = new THREE.Vector3(), edge = new THREE.Vector3();
    const radius = .035;
    function spread(v, halfSize) {
      const steps = [0, halfSize - radius, halfSize - radius * .38, halfSize];
      return Math.sign(v) * steps[Math.round(Math.abs(v) * 6)];
    }
    for (let i = 0; i < pos.count; i++) {
      point.set(spread(pos.getX(i), half.x), spread(pos.getY(i), half.y), spread(pos.getZ(i), half.z));
      inner.set(
        THREE.MathUtils.clamp(point.x, -half.x + radius, half.x - radius),
        THREE.MathUtils.clamp(point.y, -half.y + radius, half.y - radius),
        THREE.MathUtils.clamp(point.z, -half.z + radius, half.z - radius),
      );
      edge.subVectors(point, inner).normalize();
      point.copy(inner).addScaledVector(edge, radius);
      pos.setXYZ(i, point.x, point.y, point.z);
      normal.setXYZ(i, edge.x, edge.y, edge.z);
    }
    return geo;
  }
  const seatCushion = cushionGeometry(.76, .18, .72);
  const backCushion = cushionGeometry(.76, .45, .17);

  // Solid wood lounge armchairs, linen cushions, tables and coffee cups.
  function chair(x, y, z, rotation = 0, scale = 1) {
    contactShadows.push({ x, y, z, width: 1.25 * scale, depth: 1.23 * scale });
    const c = Math.cos(rotation), s = Math.sin(rotation);
    function part(m, lx, ly, lz, w, h, d, geometry = boxGeo) {
      instance(geometry, m, x + (lx * c + lz * s) * scale, y + ly * scale,
        z + (-lx * s + lz * c) * scale, w * scale, h * scale, d * scale, 0, rotation);
    }
    part(mats.wood, 0, .25, 0, .95, .38, .92);
    part(mats.fabric, 0, .49, -.01, 1, 1, 1, seatCushion);
    part(mats.wood, 0, .67, -.39, .96, .72, .14);
    part(mats.fabric, 0, .73, -.27, .75 / .76, 1.2, .16 / .17, backCushion);
    for (const sign of [-1, 1]) part(mats.wood, sign * .44, .49, 0, .12, .67, .94);
    const half = .51 * scale;
    collider(x - half, x + half, z - half, z + half, y, y + 1.1 * scale);
  }
  function table(x, y, z, radius = .55) {
    contactShadows.push({ x, y, z, width: 2.16 * radius, depth: 2.16 * radius });
    cylinder(mats.wood, x, y + .59, z, radius, .09);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      beam(mats.darkWood, [x + Math.sin(angle) * radius * .6, y + .02, z + Math.cos(angle) * radius * .6], [x + Math.sin(angle) * radius * .35, y + .58, z + Math.cos(angle) * radius * .35], .075);
    }
    cylinder(mats.ivory, x - .18, y + .66, z + .12, .083, .013);
    cylinder(mats.ivory, x - .18, y + .705, z + .12, .047, .08);
    cylinder(mats.darkWood, x - .18, y + .747, z + .12, .037, .004);
    cylinder(mats.brass, x + .14, y + .74, z - .08, .065, .2);
    flowerBeds.push({ x: x + .14, y: y + .84, z: z - .08, radius: .15, kind: 'vase' });
    collider(x - radius * .86, x + radius * .86, z - radius * .86, z + radius * .86, y, y + .8);
  }
  for (const z of [-.4, 4.2]) {
    chair(7.75, 0, z - 1.1, 0);
    chair(7.75, 0, z + 1.1, Math.PI);
    table(7.4, 0, z, .52);
  }
  // The pale two-seat sofa sits on the atrium side of the lounge. An open
  // aisle between it and the wall-side armchairs connects both stair flights.
  const sofa = { x: 5.98, y: 3.2, z: 3.12 };
  contactShadows.push({ ...sofa, width: 2.11, depth: 1.24 });
  box(mats.wood, sofa.x, sofa.y + .24, sofa.z, 1.86, .37, .93);
  box(mats.wood, sofa.x, sofa.y + .66, sofa.z - .4, 1.86, .69, .13);
  for (const offset of [-.39, .39]) {
    instance(seatCushion, mats.fabric, sofa.x + offset, sofa.y + .48, sofa.z + .025, 1, 1, 1);
    instance(backCushion, mats.fabric, sofa.x + offset, sofa.y + .72, sofa.z - .28, 1, 1, 1);
  }
  for (const offset of [-.85, .85]) {
    box(mats.wood, sofa.x + offset, sofa.y + .47, sofa.z, .17, .63, .96);
  }
  collider(5.04, 6.92, 2.64, 3.60, 3.2, 4.21);
  chair(8.16, 3.2, 1.62, -Math.PI / 2);
  chair(8.16, 3.2, 4.32, -Math.PI / 2);
  table(8.12, 3.2, 2.97, .40);
  // Coffee counter beneath the right-hand gallery.
  box(mats.wood, 7.6, .54, 7.2, 2.1, 1.08, .72);
  box(mats.darkWood, 7.6, 1.12, 7.2, 2.2, .1, .85);
  for (let i = 0; i < 20; i++) box(mats.darkWood, 6.62 + i * .1, .5, 6.832, .025, .95, .018);
  box(mats.chrome, 7.7, 1.48, 7.26, .65, .62, .4);
  box(mats.black, 7.7, 1.37, 7.02, .55, .18, .16);
  for (const x of [7.52, 7.88]) cylinder(mats.ivory, x, 1.28, 6.99, .055, .09);
  collider(6.5, 8.7, 6.7, 7.7, 0, 1.9);

  // Closed double wood door on the rear wall directly behind the coffee
  // cabinet. The leaves and trim share the existing wood/metal instance batches.
  const doorX = 7.50, doorZ = 8.855, doorWidth = 1.98, doorHeight = 2.46;
  const doorTint = new THREE.Color(.80, .76, .70);
  const panelTint = new THREE.Color(.90, .85, .78);
  box(mats.dark, doorX, doorHeight / 2, doorZ + .025, doorWidth, doorHeight, .06);
  for (const side of [-1, 1]) {
    const leafX = doorX + side * .47;
    box(mats.wood, leafX, 1.21, doorZ - .020, .922, 2.36, .075, 0, doorTint);
    // Recessed panels leave a recognizable rail-and-stile door face.
    for (const [panelY, panelHeight] of [[.59, .83], [1.77, 1.10]]) {
      box(mats.darkWood, leafX, panelY, doorZ - .062, .714, panelHeight, .020, 0, panelTint);
      for (const edge of [-1, 1]) {
        box(mats.wood, leafX + edge * .373, panelY, doorZ - .080, .030, panelHeight + .060, .028);
        box(mats.wood, leafX, panelY + edge * (panelHeight / 2 + .015), doorZ - .080, .776, .030, .028);
      }
    }
    // Paired brass pulls flank the dark center seam.
    const handleX = doorX + side * .125;
    box(mats.brass, handleX, 1.18, doorZ - .087, .070, .28, .024);
    beam(mats.brass, [handleX, 1.085, doorZ - .141], [handleX, 1.275, doorZ - .141], .025);
    for (const handleY of [1.085, 1.275]) {
      box(mats.brass, handleX, handleY, doorZ - .117, .025, .025, .055);
    }
  }
  for (const side of [-1, 1]) {
    box(mats.darkWood, doorX + side * 1.015, 1.25, doorZ - .037, .105, 2.50, .135);
  }
  box(mats.darkWood, doorX, 2.485, doorZ - .037, 2.135, .115, .135);
  box(mats.darkWood, doorX, .025, doorZ - .045, 2.135, .050, .15);
  collider(doorX - 1.075, doorX + 1.075, doorZ - .115, 8.915, 0, 2.55, 'closed-door');

  // The empty stage evokes the performance setup without inventing performers.
  function keyboard(x, z) {
    contactShadows.push({ x, y: 0, z, width: 1.74, depth: .51 });
    box(mats.dark, x, .97, z, 1.75, .16, .43);
    box(mats.paper, x, 1.065, z + .09, 1.56, .018, .21);
    for (let i = 0; i < 35; i++) {
      const keyX = x - .76 + i * .044;
      box(mats.black, keyX, 1.076, z + .09, .004, .014, .21);
      if (![2, 6].includes(i % 7)) box(mats.dark, keyX + .022, 1.085, z + .025, .024, .025, .13);
    }
    beam(mats.black, [x - .6, .05, z], [x + .55, .9, z], .04);
    beam(mats.black, [x + .6, .05, z], [x - .55, .9, z], .04);
    collider(x - .9, x + .9, z - .25, z + .25, 0, 1.15);
    // Slotted music stand behind the instrument.
    cylinder(mats.black, x, .8, z - .45, .021, 1.6);
    box(mats.black, x, 1.5, z - .45, .52, .32, .025);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) box(mats.wall, x - .21 + col * .07, 1.41 + row * .075, z - .431, .024, .024, .008);
  }
  keyboard(-3.2, -3.3); keyboard(3.15, -3.3);
  // Match the reference silhouette beside the 1.92 m performer: a compact
  // seat, short board back and slim, slightly splayed timber legs.
  const stool = new THREE.Group();
  stool.name = 'Stage stool';
  stool.position.set(1, 0, -1.6);
  group.add(stool);
  contactShadows.push({ x: stool.position.x, y: 0, z: stool.position.z, width: .65, depth: .60 });

  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainCanvas.height = 256;
  const grain = grainCanvas.getContext('2d');
  grain.fillStyle = '#bd9468';
  grain.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 270; i++) {
    const x = random() * 256;
    const drift = (random() - .5) * 9;
    grain.strokeStyle = random() < .60 ? '#6b472422' : '#f3dbb02a';
    grain.lineWidth = .35 + random() * 1.35;
    grain.beginPath();
    grain.moveTo(x, 0);
    grain.bezierCurveTo(x + drift, 74, x - drift * .6, 170, x + drift, 256);
    grain.stroke();
  }
  const stoolMap = new THREE.CanvasTexture(grainCanvas);
  stoolMap.colorSpace = THREE.SRGBColorSpace;
  stoolMap.anisotropy = 4;
  const stoolWood = material('#d2b79b', { map: stoolMap, normalMap: wood.normalMap, normalScale: new THREE.Vector2(.34, .34), roughness: .55 });

  function timberPart(w, h, d, bevel, x, y, z, seat = false) {
    const halfW = w / 2 - bevel, halfH = h / 2 - bevel;
    const outline = new THREE.Shape();
    outline.moveTo(-halfW, -halfH);
    outline.lineTo(halfW, -halfH);
    outline.lineTo(halfW, halfH);
    outline.lineTo(-halfW, halfH);
    outline.closePath();
    const coreDepth = d - 2 * bevel;
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: coreDepth, bevelEnabled: true, bevelSize: bevel,
      bevelThickness: bevel, bevelSegments: 2, steps: 1,
    });
    geometry.translate(0, 0, -coreDepth / 2);

    // Align the grain along the leg/back height and across the seat's depth.
    const pos = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) / w + .5, py = pos.getY(i) / h + .5, pz = pos.getZ(i) / d + .5;
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      if (ny >= nx && ny >= nz) uv.setXY(i, px, pz);
      else if (nx >= nz) uv.setXY(i, seat ? py : pz, seat ? pz : py);
      else uv.setXY(i, px, py);
    }
    const mesh = new THREE.Mesh(geometry, stoolWood);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stool.add(mesh);
    return mesh;
  }

  const seat = timberPart(.365, .041, .34, .008, 0, .50, 0, true);
  timberPart(.305, .195, .024, .005, 0, .612, -.138);
  for (const x of [-.126, .126]) for (const z of [-.108, .108]) {
    const foot = new THREE.Vector3(x * 1.25, .003, z * 1.27);
    const top = new THREE.Vector3(x, .484, z);
    const delta = top.clone().sub(foot);
    const center = foot.clone().lerp(top, .5);
    const leg = timberPart(.041, delta.length(), .037, .003, ...center.toArray());
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  }
  for (const x of [-.145, .145]) timberPart(.022, .031, .24, .002, x, .181, 0);
  timberPart(.298, .029, .025, .002, 0, .181, -.119);

  const stoolBounds = new THREE.Box3().setFromObject(stool, true);
  const stoolSeat = new THREE.Box3().setFromObject(seat, true);
  collider(stoolBounds.min.x, stoolBounds.max.x, stoolBounds.min.z, stoolBounds.max.z,
    0, stoolBounds.max.y);
  // Compact drum kit is tucked into the far-right corner of the stage.
  const drumSkin = mats.ivory.clone();
  drumSkin.userData.concertShade = .16;
  instance(cylGeo, mats.darkWood, 4.4, .43, -4.7, .43, .5, .43, Math.PI / 2);
  instance(cylGeo, drumSkin, 4.4, .43, -4.44, .39, .02, .39, Math.PI / 2);
  for (const [x, z] of [[4, -5], [4.8, -5.1], [5, -4.4]]) {
    cylinder(mats.darkWood, x, .88, z, .23, .3);
    cylinder(drumSkin, x, 1.035, z, .23, .012);
    cylinder(mats.chrome, x, .42, z, .018, .7);
  }
  for (const [x, z, y] of [[3.7, -4.8, 1.45], [5.25, -5, 1.52]]) {
    cylinder(mats.chrome, x, y / 2, z, .012, y);
    instance(cylGeo, mats.brass, x, y, z, .37, .015, .37, 0, 0, .08);
  }
  collider(3.65, 5.55, -5.5, -4, 0, 1.65);

  // Pendant lamps and small warm task lights above seating.
  for (const [x, z, bottom] of [[7.25, 4.2, 5.6], [7.25, -.4, 5.6]]) {
    cylinder(mats.black, x, (9.4 + bottom) / 2, z, .012, 9.4 - bottom);
    cylinder(mats.brass, x, bottom, z, .22, .13);
    cylinder(mats.light, x, bottom - .07, z, .18, .015);
  }

  // Assemble static geometry into GPU instances, so the room remains lightweight.
  for (const { geo, mat, entries, parent } of batches.values()) {
    const stairSurface = !bakeSolid && (mat === mats.stairWood || mat === mats.stairConcrete);
    const geometry = stairSurface ? geo.clone() : geo;
    if (stairSurface) {
      geometry.setAttribute('stairTile', new THREE.InstancedBufferAttribute(
        Float32Array.from(entries, entry => entry.tile), 1,
      ));
    }
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    const hasColors = entries.some(e => e.color);
    entries.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix);
      if (hasColors) mesh.setColorAt(i, entry.color || new THREE.Color('#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mat === mats.black || mat === mats.truss;
    // The risers retain baked contact shading without the sharp repeated rail bars.
    mesh.receiveShadow = mat !== mats.floor && mat !== mats.stairConcrete;
    mesh.computeBoundingSphere(); parent.add(mesh);
  }
  const concertColliders = colliders.filter(c => !loungeStairColliders.has(c));
  const openDeck = { ...loungeDeck, dropAtMinX: { minZ: loungeStairSurface.minZ, maxZ: loungeStairSurface.maxZ } };
  const concertSurfaces = surfaces.filter(s => s !== loungeStairSurface).map(s => s === loungeDeck ? openDeck : s);
  return {
    get colliders() { return loungeStair.visible ? colliders : concertColliders; },
    get surfaces() { return loungeStair.visible ? surfaces : concertSurfaces; },
    railPaths, flowerBeds, stoolSeat, contactShadows, floorMaterial: mats.floor,
    setConcert(enabled) { loungeStair.visible = !enabled; },
    setNight(value) { ceiling.visible = !value; },
    get ceilingVisible() { return ceiling.visible; },
    setPracticalLights(enabled, level = 1, { bookcase = true } = {}) {
      mats.light.visible = enabled;
      mats.light.color.set('#ffe6be').multiplyScalar(level);
      bookcaseStrip.visible = enabled && bookcase;
      bookcaseStrip.color.copy(mats.light.color);
      mats.glass.emissiveIntensity = enabled ? .2 * level : 0;
    },
    landmarks: [
      { name: '花海舞台', x: 0, y: 0, z: 2.1 },
      { name: '沙发夹层', x: 7.34, y: 3.2, z: 4.45 },
      { name: '书墙中廊', x: 0, y: 4.8, z: -5.7 },
      { name: '书墙高廊', x: 0, y: 7.2, z: -5.7 },
    ],
    group,
  };
}
