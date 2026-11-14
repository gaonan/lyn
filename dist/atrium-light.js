export function createAtriumLighting(T, renderer, scene) {
  const reflection = document.createElement('canvas');
  reflection.width = 128;
  reflection.height = 64;
  const c = reflection.getContext('2d');
  const gradient = c.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, '#8e9ba9');
  gradient.addColorStop(.45, '#55504a');
  gradient.addColorStop(1, '#332a20');
  c.fillStyle = gradient;
  c.fillRect(0, 0, 128, 64);
  c.fillStyle = '#dcecff';
  c.fillRect(22, 15, 20, 15);
  c.fillStyle = '#e5cfaa';
  c.fillRect(82, 20, 14, 7);
  const probe = new T.CanvasTexture(reflection);
  probe.colorSpace = T.SRGBColorSpace;
  probe.mapping = T.EquirectangularReflectionMapping;
  scene.environment = probe;
  scene.background = new T.Color();
  scene.fog = new T.Fog('#9a9da7', 17, 44);

  const bounce = new T.HemisphereLight('#d1dced', '#5a4335', 1);
  const window = new T.DirectionalLight('#d9e7ff', 1);
  window.position.set(8, 9, 2);
  window.target.position.set(-1.5, 0, -2);
  window.castShadow = true;
  window.shadow.mapSize.set(1024, 1024);
  Object.assign(window.shadow.camera, { left: -9, right: 9, top: 11, bottom: -9, near: .5, far: 29 });
  window.shadow.camera.updateProjectionMatrix();
  window.shadow.normalBias = .055;
  window.shadow.bias = -.00025;
  window.shadow.intensity = .55;
  const shelves = new T.PointLight('#ffd4a0', 1, 13, 2);
  shelves.position.set(-2.4, 3.5, -3.25);
  const lounge = new T.PointLight('#ffc089', 1, 7.5, 2);
  lounge.position.set(7.15, 5.32, 3.1);
  const stage = new T.SpotLight('#ffdcaf', 1, 14, .59, .72, 2);
  stage.position.set(-3.7, 4.05, 1.4);
  stage.target.position.set(-.3, .38, -1.5);
  const rim = new T.SpotLight('#b6bcff', 1, 14, .68, .79, 2);
  rim.position.set(4.35, 3.3, -4.15);
  rim.target.position.set(.6, .6, -1);
  scene.add(bounce, window, window.target, shelves, lounge, stage, stage.target, rim, rim.target);
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  function setNight(night) {
    bounce.intensity = night ? .60 : 1.24;
    window.intensity = night ? .33 : 2.35;
    shelves.intensity = night ? 22 : 15;
    lounge.intensity = night ? 24 : 16;
    stage.intensity = night ? 105 : 46;
    rim.intensity = night ? 105 : 11;
    rim.color.set(night ? '#9d94ff' : '#dce4fb');
    renderer.toneMappingExposure = night ? 1.17 : 1.10;
    scene.environmentIntensity = night ? .47 : .65;
    scene.fog.color.set(night ? '#33303d' : '#98949b');
    scene.background.copy(scene.fog.color);
  }
  function setShadows(enabled) {
    renderer.shadowMap.enabled = enabled;
    if (enabled) renderer.shadowMap.needsUpdate = true;
  }
  setNight(false);
  return { setNight, setShadows };
}
