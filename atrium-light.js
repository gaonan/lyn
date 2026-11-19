import { createAtriumSky } from './atrium-sky.js?v=20261113-r85';
import { createStageMist } from './stage-mist.js?v=20261113-r85';

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
  const rainSpot = {
    color: '#bdceff', from: [2.64, 6.50, -3.00], to: [-.42, .10, -.32],
    angle: .24, penumbra: .74, day: 123, night: 137,
  };

  const shaftGeometry = new T.PlaneGeometry(1, 1, 1, 4);
  // A depth-tested ribbon turns about the light axis to face the camera. Feather
  // the coverage inside the shader so plants and architecture can cut the shaft.
  function shaft(from, to, radius, color, day, night, startFade, { endFade = .44, startRadius = .039, clearPerformer = false } = {}) {
    const origin = new T.Vector3(...from), end = new T.Vector3(...to);
    const material = new T.ShaderMaterial({
      defines: clearPerformer ? { KEEP_PERFORMER_CLEAR: 1 } : {},
      uniforms: {
        origin: { value: origin }, end: { value: end }, radius: { value: radius },
        tint: { value: new T.Color(color) }, strength: { value: 0 },
        startFade: { value: startFade }, endFade: { value: endFade }, startRadius: { value: startRadius },
      },
      vertexShader: /* glsl */ `
        uniform vec3 origin, end;
        uniform float startRadius, radius;
        varying vec2 beamUV;
        varying float scatter;
        #ifdef KEEP_PERFORMER_CLEAR
          varying vec3 beamPosition;
        #endif
        void main() {
          vec3 axis = normalize(end - origin);
          vec3 center = mix(origin, end, uv.y);
          vec3 toEye = cameraPosition - center;
          vec3 side = cross(axis, toEye);
          float sideLength = length(side);
          side /= max(sideLength, .001);
          float r = mix(startRadius, radius, uv.y);
          beamUV = vec2(uv.x, uv.y);
          scatter = .60 + .40 * pow(abs(dot(axis, normalize(toEye))), 2.0);
          vec3 positionInBeam = center + side * (uv.x * 2.0 - 1.0) * r;
          #ifdef KEEP_PERFORMER_CLEAR
            beamPosition = positionInBeam;
          #endif
          gl_Position = projectionMatrix * viewMatrix * vec4(positionInBeam, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 tint;
        uniform float strength, startFade, endFade;
        varying vec2 beamUV;
        varying float scatter;
        #ifdef KEEP_PERFORMER_CLEAR
          varying vec3 beamPosition;
        #endif
        void main() {
          float along = beamUV.y;
          float edge = abs(beamUV.x * 2.0 - 1.0);
          #ifdef KEEP_PERFORMER_CLEAR
            float crossSection = (1.0 - smoothstep(.12, 1.0, edge)) *
              mix(.56, 1.0, 1.0 - smoothstep(.03, .72, edge));
          #else
            float crossSection = (1.0 - smoothstep(.04, 1.0, edge)) *
              mix(.42, 1.0, 1.0 - smoothstep(.02, .56, edge));
          #endif
          float envelope = smoothstep(0.0, startFade, along) *
            (1.0 - smoothstep(endFade, 1.0, along));
          #ifdef KEEP_PERFORMER_CLEAR
            // The haze ribbon may cross the photo plane. Feather it around the
            // body so the transition is soft when viewed from behind.
            vec2 actorCenter = vec2(0.0, -1.0);
            float actorDistance = length(beamPosition.xz - actorCenter);
            float aboveHead = smoothstep(2.13, 2.75, beamPosition.y);
            // From the front, the light sits mainly behind the performer. Keep
            // its center continuous there and retain the stronger rear feather.
            float frontView = .55 * smoothstep(.25, 2.0, cameraPosition.z - actorCenter.y);
            float clearPhoto = smoothstep(.39, .86, actorDistance);
            envelope *= mix(clearPhoto, 1.0, max(aboveHead, frontView));
          #endif
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
  let stageMist, rainBeam, rainGlow;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  function setNight(night) {
    isNight = night;
    atriumSky.setNight(night);
    probes.setNight(night, rainActive);
    bounce.intensity = rainActive ? (night ? .18 : .23) : (night ? .48 : .91);
    daylight.intensity = rainActive ? 0 : night ? .115 : 1.85;
    shelves.intensity = rainActive ? 0 : night ? 25 : 16;
    lounge.intensity = rainActive ? 0 : night ? 28 : 9;
    upperFill.intensity = rainActive ? 0 : night ? 18 : 7;
    renderer.toneMappingExposure = night ? 1.02 : 1.05;
    scene.environmentIntensity = rainActive ? (night ? .10 : .14) : (night ? .34 : .58);
    if (rainActive) {
      setSpotlight(spots[0], rainSpot, night);
      for (const light of spots.slice(1)) light.intensity = 0;
    } else {
      spots.forEach((light, index) => setSpotlight(light, roomSpots[index], night));
    }
    for (const beam of beams) {
      beam.strength.value = night ? beam.night : beam.day;
      beam.mesh.visible = !rainActive && beam.strength.value > 0;
    }
    if (rainBeam) {
      rainBeam.strength.value = night ? rainBeam.night : rainBeam.day;
      rainBeam.mesh.visible = rainActive;
      rainGlow.visible = rainActive;
      rainGlow.material.opacity = night ? .72 : .49;
    }
    for (const lamp of lamps) lamp.opacity = rainActive ? 0 : night ? 1 : .24;
    stageMist?.setVisible(rainActive, night);
  }
  function setRainStage(enabled) {
    rainActive = enabled;
    if (enabled && !stageMist) {
      stageMist = createStageMist(T, scene, rainSpot.to);
      rainBeam = shaft(rainSpot.from, rainSpot.to, 1.93, rainSpot.color, .54, .74, .09,
        { startRadius: .16, endFade: .73, clearPerformer: true });
      rainGlow = lampGlow(new T.Vector3(...rainSpot.from), rainSpot.color, .83);
    }
    setNight(isNight);
  }
  function setShadows(enabled) {
    renderer.shadowMap.enabled = enabled;
    if (enabled) renderer.shadowMap.needsUpdate = true;
  }
  setNight(true);
  return {
    setNight, setShadows, setRainStage, rainLightPosition: rainSpot.from,
    get skyState() { return atriumSky.state; },
    update(seconds) {
      atriumSky.update(seconds);
      stageMist?.update(seconds);
    },
  };
}
