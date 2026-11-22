import { createHeroLightstick } from './concert-audience.js?v=20261122-r95';

export function createConcertPortal(T, scene) {
  const group = new T.Group();
  group.name = '留言墙角的应援棒';
  group.position.set(-7.64, 0, 7.77);
  group.visible = false;
  scene.add(group);

  const stick = createHeroLightstick(T);
  stick.position.y = .27;
  stick.rotation.y = 2.18;
  group.add(stick);

  const glow = new T.Mesh(new T.PlaneGeometry(.81, .66), new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 floorUv;
      void main() {
        floorUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 floorUv;
      void main() {
        float r = length((floorUv - .5) * 2.0);
        float spill = pow(max(0.0, 1.0 - r * r), 3.0);
        gl_FragColor = vec4(.85, .54, .10, .14 * spill);
        #include <colorspace_fragment>
      }`,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = .008;
  group.add(glow);

  const anchor = new T.Vector3();
  const screenPosition = new T.Vector2();
  const picker = new T.Raycaster(), pointer = new T.Vector2();
  const obstacle = new T.Box3(), obstacleHit = new T.Vector3();
  function inRange(player) {
    const reach = group.visible ? 6.3 : 7.5;
    return Math.abs(player.y) <= .35 && Math.hypot(player.x - group.position.x, player.z - group.position.z) <= reach;
  }
  function hitsStick(camera, x, y, rect, colliders) {
    if (!group.visible || !rect.width || !rect.height) return false;
    pointer.set(2 * (x - rect.left) / rect.width - 1, 1 - 2 * (y - rect.top) / rect.height);
    camera.updateWorldMatrix(true, false);
    stick.updateWorldMatrix(true, true);
    picker.setFromCamera(pointer, camera);
    const hit = picker.intersectObject(stick).find(({ object, uv }) => {
      const radius = object.geometry.userData.diskRadiusUV;
      return !radius || Math.hypot(uv.x - .5, uv.y - .5) <= radius;
    });
    if (!hit) return false;
    return !colliders.some(box => {
      obstacle.min.set(box.minX, box.minY, box.minZ);
      obstacle.max.set(box.maxX, box.maxY, box.maxZ);
      return picker.ray.intersectBox(obstacle, obstacleHit)
        && picker.ray.origin.distanceTo(obstacleHit) < hit.distance;
    });
  }
  function update(time, camera, player, active, motion = true) {
    const bob = motion ? .095 * Math.sin(time * 1.85) : 0;
    stick.position.y = .27 + bob;
    stick.rotation.z = motion ? .045 * Math.sin(time * 1.21) : 0;
    if (!active || !inRange(player)) return null;

    // The return button uses the same wall corner after the prop disappears.
    anchor.copy(group.position);
    anchor.y += 1.50 + (group.visible ? bob : 0);
    camera.updateWorldMatrix(true, false);
    anchor.applyMatrix4(camera.matrixWorldInverse);
    const behind = anchor.z >= 0;
    anchor.applyMatrix4(camera.projectionMatrix);
    if (behind || Math.abs(anchor.z) >= 1 || Math.abs(anchor.x) >= 1 || Math.abs(anchor.y) >= .96) {
      return null;
    }
    return screenPosition.set((1 + anchor.x) / 2, (1 - anchor.y) / 2);
  }
  return { group, update, inRange, hitsStick };
}
