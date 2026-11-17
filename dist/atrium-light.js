import { createAtriumSky } from './atrium-sky.js?v=20261113-r75';
import { createStageMist } from './stage-mist.js?v=20261113-r75';

export function createAtriumLighting(T, renderer, scene, probes) {
  const atriumSky = createAtriumSky(T, scene);
  const reflection = document.createElement('canvas');
  reflection.width = 128;
  reflection.height = 64;
  const ctx = reflection.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 64);
  sky.addColorStop(0, '#8897a4');
  sky.addColorStop(.48, '#4d4141');
  sky.addColorStop(1, '#29221a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#e0efff';
  ctx.fillRect(22, 13, 20, 16);
  ctx.fillStyle = '#f4d1a2';
  ctx.fillRect(82, 20, 14, 7);
  const probe = new T.CanvasTexture(reflection);
  probe.colorSpace = T.SRGBColorSpace;
  probe.mapping = T.EquirectangularReflectionMapping;
  scene.environment = probe;
  scene.background = new T.Color('#131719');
  scene.fog = new T.Fog('#131719', 28, 55);

  const bounce = new T.HemisphereLight('#dce6f5', '#654f42', 1);
  const daylight = new T.DirectionalLight('#e2f0ff', 1);
  daylight.position.set(8, 9, 2);
  daylight.target.position.set(-1.5, 0, -2);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(1024, 1024);
  Object.assign(daylight.shadow.camera, { left: -9, right: 9, top: 11, bottom: -9, near: .5, far: 29 });
  daylight.shadow.camera.updateProjectionMatrix();
  daylight.shadow.normalBias = .055;
  daylight.shadow.bias = -.00025;
  daylight.shadow.intensity = .63;
  daylight.shadow.radius = 2.2;
  const shelves = new T.PointLight('#ffd1a0', 1, 13, 2);
  shelves.position.set(-2.4, 3.5, -3.25);
  const lounge = new T.PointLight('#ffc58b', 1, 7.5, 2);
  lounge.position.set(7.15, 5.32, 3.1);
  const upperFill = new T.PointLight('#fff2dd', 0, 15, 2);
  upperFill.position.set(0, 7.1, -1.55);
  scene.add(bounce, daylight, daylight.target, shelves, lounge, upperFill);

  function setSpotlight(light, { color, from, to, angle, penumbra = .48, day, night }, isNight) {
    light.color.set(color);
    light.position.set(...from);
    light.target.position.set(...to);
    light.angle = angle;
    light.penumbra = penumbra;
    light.intensity = isNight ? night : day;
  }
  function spotlight() {
    const light = new T.SpotLight(0xffffff, 0, 15, .5, .48, 2);
    scene.add(light, light.target);
    return light;
  }
  const coolFrom = [-6.28, 3.52, -2.4], coolTo = [1.35, .58, .38];
  const warmFrom = [4.0, 3.36, -3.22], warmTo = [-.25, .22, .9];
  const spots = [spotlight(), spotlight(), spotlight()];
  const roomSpots = [
    { color: '#a0d7ff', from: coolFrom, to: coolTo, angle: .42, day: 30, night: 161 },
    { color: '#ffc074', from: warmFrom, to: warmTo, angle: .41, day: 28, night: 127 },
    { color: '#938cff', from: [3.65, 2.55, -4.7], to: [2.2, .45, -.65], angle: .64, penumbra: .80, day: 0, night: 43 },
  ];
  const rainSpots = [
    { color: '#e4eeff', from: [-.20, 5.48, -1.95], to: [.10, .68, -.83], angle: .25, day: 72, night: 102 },
    { color: '#d6e6ff', from: [3.58, 2.08, -4.06], to: [-.42, .28, .75], angle: .43, day: 109, night: 189 },
    { color: '#90beff', from: [-3.46, 2.23, -4.12], to: [.68, .29, .84], angle: .47, day: 119, night: 199 },
  ];

  const shaftGeometry = new T.PlaneGeometry(1, 1, 1, 4);
  // A depth-tested ribbon turns about the light axis to face the camera. Feather
  // the coverage inside the shader so plants and architecture can cut the shaft.
  function shaft(from, to, radius, color, day, night, startFade) {
    const origin = new T.Vector3(...from), end = new T.Vector3(...to);
    const material = new T.ShaderMaterial({
      uniforms: {
        origin: { value: origin }, end: { value: end }, radius: { value: radius },
        tint: { value: new T.Color(color) }, strength: { value: 0 },
        startFade: { value: startFade },
      },
      vertexShader: /* glsl */ `
        uniform vec3 origin, end;
        uniform float radius;
        varying vec2 beamUV;
        varying float scatter;
        void main() {
          vec3 axis = normalize(end - origin);
          vec3 center = mix(origin, end, uv.y);
          vec3 toEye = cameraPosition - center;
          vec3 side = cross(axis, toEye);
          float sideLength = length(side);
          side /= max(sideLength, .001);
          float r = mix(.039, radius, uv.y);
          beamUV = vec2(uv.x, uv.y);
          scatter = .60 + .40 * pow(abs(dot(axis, normalize(toEye))), 2.0);
          gl_Position = projectionMatrix * viewMatrix *
            vec4(center + side * (uv.x * 2.0 - 1.0) * r, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 tint;
        uniform float strength, startFade;
        varying vec2 beamUV;
        varying float scatter;
        void main() {
          float along = beamUV.y;
          float edge = abs(beamUV.x * 2.0 - 1.0);
          float crossSection = (1.0 - smoothstep(.04, 1.0, edge)) *
            mix(.42, 1.0, 1.0 - smoothstep(.02, .56, edge));
          float envelope = smoothstep(0.0, startFade, along) *
            (1.0 - smoothstep(.44, 1.0, along));
          gl_FragColor = vec4(tint, strength * envelope * crossSection * scatter);
          #include <colorspace_fragment>
        }
      `,
      depthWrite: false, transparent: true, side: T.DoubleSide,
      blending: T.AdditiveBlending, toneMapped: false,
    });
    const mesh = new T.Mesh(shaftGeometry, material);
    mesh.boundingSphere = new T.Sphere(
      origin.clone().lerp(end, .5), origin.distanceTo(end) / 2 + radius,
    );
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { mesh, strength: material.uniforms.strength, day, night };
  }

  const beams = [
    shaft(coolFrom, coolTo, 1.15, '#8cc8f6', .065, .31, .055),
    shaft(coolFrom, [1.55, 1.96, .06], .32, '#c1e0f8', .048, .40, .077),
    shaft(coolFrom, [1.29, 1.44, .93], .19, '#a2dcff', .047, .33, .086),
    shaft(coolFrom, [.65, .5, 1.45], .27, '#8bd9ff', 0, .27, .09),
    shaft(warmFrom, warmTo, .98, '#ffc46f', .035, .31, .07),
    shaft(warmFrom, [-1.55, 1.30, -.35], .33, '#ffdfae', 0, .39, .10),
    shaft([8.77, 6.7, -4.75], [.45, .4, -.34], 1.4, '#ffdfac', .13, 0, .28),
  ];

  const aureole = document.createElement('canvas');
  aureole.width = aureole.height = 64;
  const g = aureole.getContext('2d');
  const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fade.addColorStop(0, '#ffffff');
  fade.addColorStop(.11, '#ffffffb0');
  fade.addColorStop(.35, '#ffffff29');
  fade.addColorStop(1, '#ffffff00');
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 64);
  const glow = new T.CanvasTexture(aureole);
  function lampGlow(position, color, size) {
    const emitter = new T.Sprite(new T.SpriteMaterial({
      color, map: glow, opacity: 0, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, toneMapped: false,
    }));
    emitter.position.copy(position);
    emitter.scale.set(size, size, 1);
    emitter.renderOrder = 3;
    scene.add(emitter);
    return emitter;
  }
  function lamp(from, to, color) {
    const socket = new T.Vector3(...from);
    const direction = new T.Vector3(...to).sub(socket).normalize();
    const fixture = new T.Mesh(
      new T.CylinderGeometry(.095, .112, .26, 12),
      new T.MeshStandardMaterial({ color: '#222027', metalness: .56, roughness: .54 }),
    );
    fixture.position.copy(socket).addScaledVector(direction, -.133);
    fixture.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
    const stand = new T.Mesh(new T.CylinderGeometry(.024, .032, socket.y, 6), fixture.material);
    stand.position.set(fixture.position.x, socket.y / 2, fixture.position.z);
    scene.add(fixture, stand);
    return lampGlow(socket.addScaledVector(direction, .023), color, 1.44).material;
  }
  const lamps = [lamp(coolFrom, coolTo, '#bcdeff'), lamp(warmFrom, warmTo, '#ffce90')];
  let rainActive = false;
  let isNight = true;
  let stageMist, rainBeams, rainGlows;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  function setNight(night) {
    isNight = night;
    atriumSky.setNight(night);
    probes.setNight(night);
    bounce.intensity = night ? .65 : .91;
    daylight.intensity = night ? .15 : 1.85;
    shelves.intensity = night ? 25 : 16;
    lounge.intensity = night ? 28 : 9;
    upperFill.intensity = night ? 18 : 7;
    renderer.toneMappingExposure = night ? 1.10 : 1.05;
    scene.environmentIntensity = night ? .46 : .58;
    const lightRig = rainActive ? rainSpots : roomSpots;
    spots.forEach((light, index) => setSpotlight(light, lightRig[index], night));
    if (rainActive) {
      bounce.intensity *= night ? .72 : .89;
      shelves.intensity *= .57;
      lounge.intensity *= .62;
    }
    for (const beam of beams) {
      beam.strength.value = night ? beam.night : beam.day;
      beam.mesh.visible = !rainActive && beam.strength.value > 0;
    }
    for (const beam of rainBeams ?? []) {
      beam.strength.value = night ? beam.night : beam.day;
      beam.mesh.visible = rainActive;
    }
    for (const lamp of lamps) lamp.opacity = rainActive ? 0 : night ? 1 : .24;
    for (const emitter of rainGlows ?? []) {
      emitter.visible = rainActive;
      emitter.material.opacity = night ? .92 : .60;
    }
    stageMist?.setVisible(rainActive, night);
  }
  function setRainStage(enabled) {
    rainActive = enabled;
    if (enabled && !stageMist) {
      stageMist = createStageMist(T, scene);
      rainBeams = [
        shaft(rainSpots[0].from, rainSpots[0].to, .46, '#e5edff', .24, .51, .14),
        shaft(rainSpots[1].from, rainSpots[1].to, .96, '#d8e8ff', .23, .47, .10),
        shaft(rainSpots[1].from, [-1.1, 1.08, -.14], .32, '#eef5ff', .17, .34, .10),
        shaft(rainSpots[2].from, rainSpots[2].to, .99, '#99c3ff', .24, .50, .10),
        shaft(rainSpots[2].from, [1.18, 1.17, -.18], .34, '#c2ddff', .18, .37, .10),
      ];
      rainGlows = rainSpots.slice(1).map(lamp =>
        lampGlow(new T.Vector3(...lamp.from), lamp.color, 1.1));
    }
    setNight(isNight);
  }
  function setShadows(enabled) {
    renderer.shadowMap.enabled = enabled;
    if (enabled) renderer.shadowMap.needsUpdate = true;
  }
  setNight(true);
  return { setNight, setShadows, setRainStage, update: seconds => stageMist?.update(seconds) };
}
