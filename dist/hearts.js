/** Five little keepsakes, sampled once from reachable places in the cafe.
 * update(time, player) expects elapsed time in seconds and a player foot position.
 * position is the stable heart-centre anchor; footPosition / floorY identify its floor.
 */
const CANDIDATES = [
  { id: 'stage-path', x: 0, y: 0, z: 2.1 },
  { id: 'garden-entry', x: -5, y: 0, z: 5.8 },
  { id: 'window-aisle', x: 6, y: 0, z: 2.5 },
  { id: 'book-gallery', x: 0, y: 2.4, z: -5.7 },
  { id: 'lounge-path', x: 6.35, y: 3.2, z: 6.4 },
  { id: 'first-landing', x: -3.6, y: 2.4, z: -5.7 },
  { id: 'upper-books', x: 0, y: 4.8, z: -5.7 },
  { id: 'upper-left', x: -7.6, y: 7.2, z: .9 },
  { id: 'reading-landing', x: -7.6, y: 7.2, z: -5.7 },
  { id: 'upper-window', x: 7.2, y: 4.8, z: -5.7 },
];
let visitSelection;

export function createHearts(THREE, scene) {
  if (!visitSelection) {
    const shuffled = [...CANDIDATES];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    visitSelection = shuffled.slice(0, 5);
  }

  const shape = new THREE.Shape();
  shape.moveTo(0, .19);
  shape.bezierCurveTo(-.32, .65, -.79, .42, -.58, .03);
  shape.bezierCurveTo(-.46, -.19, -.17, -.43, 0, -.57);
  shape.bezierCurveTo(.17, -.43, .46, -.19, .58, .03);
  shape.bezierCurveTo(.79, .42, .32, .65, 0, .19);
  const heartGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: .14, bevelEnabled: true, bevelSegments: 2,
    steps: 1, bevelSize: .055, bevelThickness: .055, curveSegments: 5,
  });
  heartGeometry.center(); heartGeometry.scale(.47, .47, .47);
  const heartMaterial = new THREE.MeshStandardMaterial({
    color: '#d88683', metalness: .54, roughness: .28,
    emissive: '#a33948', emissiveIntensity: .28, flatShading: true,
  });
  const ringGeometry = new THREE.RingGeometry(.32, .337, 40);
  const particleGeometry = new THREE.IcosahedronGeometry(.019, 0);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: '#ffd5b0', transparent: true, opacity: .77 });
  const transform = new THREE.Object3D();
  let lastTime = 0;

  const items = visitSelection.map((spot, index) => {
    const object = new THREE.Group(); object.name = `Collectible heart: ${spot.id}`;
    object.position.set(spot.x, spot.y + 1.1, spot.z);
    const body = new THREE.Mesh(heartGeometry, heartMaterial);
    body.name = 'Rose-gold heart'; object.add(body);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: '#f3bb9d', transparent: true, opacity: .34,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(ringGeometry, haloMaterial);
    halo.rotation.x = -Math.PI / 2; halo.position.y = -.39; object.add(halo);
    const sparkles = new THREE.InstancedMesh(particleGeometry, particleMaterial, 7);
    sparkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // A fixed enclosing bound prevents dynamic instance positions being culled.
    sparkles.boundingSphere = new THREE.Sphere(new THREE.Vector3(), .8);
    object.add(sparkles);
    scene.add(object);
    const item = {
      id: spot.id,
      position: new THREE.Vector3(spot.x, spot.y + 1.1, spot.z),
      footPosition: new THREE.Vector3(spot.x, spot.y, spot.z),
      floorY: spot.y, object, collected: false,
    };
    Object.assign(object.userData, {
      itemId: spot.id, body, halo, sparkles, phase: index * 1.73,
      collectedAt: null,
    });
    return item;
  });

  function update(time, player) {
    lastTime = time;
    for (const item of items) {
      const { object } = item;
      const { body, halo, sparkles, phase, collectedAt } = object.userData;
      if (item.collected) {
        const elapsed = Math.max(0, time - collectedAt);
        const t = Math.min(1, elapsed / .55);
        object.position.y = item.position.y + t * .7;
        object.scale.setScalar(Math.max(.001, (1 - t) * (1 + .3 * Math.sin(t * Math.PI))));
        body.rotation.y += .11;
        object.visible = t < 1;
        continue;
      }
      const close = player && Math.abs(player.y - item.floorY) < .8 &&
        Math.hypot(player.x - item.footPosition.x, player.z - item.footPosition.z) < 1.6;
      object.position.y = item.position.y + Math.sin(time * 1.8 + phase) * .065;
      object.scale.setScalar(close ? 1.10 + Math.sin(time * 4 + phase) * .025 : 1);
      body.rotation.set(Math.sin(time * .7 + phase) * .07, time * .52 + phase, Math.sin(time * .9 + phase) * .045);
      halo.material.opacity = (close ? .65 : .32) + Math.sin(time * 2.2 + phase) * .07;
      halo.scale.setScalar(1 + Math.sin(time * 1.8 + phase) * .055);
      for (let j = 0; j < 7; j++) {
        const angle = j * Math.PI * 2 / 7 + time * .32 + phase;
        const radius = .39 + Math.sin(j * 2.3 + phase) * .04;
        transform.position.set(Math.cos(angle) * radius, Math.sin(time * 1.2 + j * 1.4) * .24 - .02, Math.sin(angle) * radius);
        transform.rotation.set(angle, angle * .7, angle * .4);
        transform.scale.setScalar(.65 + .35 * (1 + Math.sin(time * 2 + j)) / 2);
        transform.updateMatrix(); sparkles.setMatrixAt(j, transform.matrix);
      }
      sparkles.instanceMatrix.needsUpdate = true;
    }
  }

  function collect(id) {
    const item = items.find(entry => entry.id === id);
    if (!item || item.collected) return false;
    item.collected = true;
    item.object.userData.collectedAt = lastTime;
    return true;
  }

  // Initialize instance transforms before the very first render.
  update(0, null);
  return { items, update, collect };
}
