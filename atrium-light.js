import { createAtriumSky } from './atrium-sky.js?v=20261122-r95';
import { createStageMist } from './stage-mist.js?v=20261122-r95';

export function createAtriumLighting(T, renderer, scene, probes, { concert = false } = {}) {
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
    color: '#b3ccff', from: [2.61, 6.50, -1.76], to: [-.56, .07, -1.76],
    angle: .27, penumbra: .76, day: 134, night: 152,
  };

  const shaftGeometry = new T.PlaneGeometry(1, 1, 1, 4);
  // A depth-tested ribbon turns about the light axis to face the camera. Feather
  // the coverage inside the shader so plants and architecture can cut the shaft.
  function shaft(from, to, radius, color, day, night, startFade, { endFade = .44, startRadius = .039 } = {}) {
    const origin = new T.Vector3(...from), end = new T.Vector3(...to);
    const material = new T.ShaderMaterial({
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
          gl_Position = projectionMatrix * viewMatrix * vec4(positionInBeam, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 tint;
        uniform float strength, startFade, endFade;
        varying vec2 beamUV;
        varying float scatter;
        void main() {
          float along = beamUV.y;
          float edge = abs(beamUV.x * 2.0 - 1.0);
          float crossSection = (1.0 - smoothstep(.04, 1.0, edge)) *
            mix(.42, 1.0, 1.0 - smoothstep(.02, .56, edge));
          float envelope = smoothstep(0.0, startFade, along) *
            (1.0 - smoothstep(endFade, 1.0, along));
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

  function rainShaft() {
    const origin = new T.Vector3(...rainSpot.from);
    const end = new T.Vector3(...rainSpot.to);
    const length = origin.distanceTo(end);
    const axis = end.clone().sub(origin).divideScalar(length);
    const startRadius = .23, endRadius = 2.09;
    const strength = { value: 0 };
    const time = { value: 0 };
    const material = new T.ShaderMaterial({
      uniforms: {
        origin: { value: origin }, axis: { value: axis }, span: { value: length },
        startRadius: { value: startRadius }, endRadius: { value: endRadius },
        tint: { value: new T.Color(rainSpot.color) }, strength, time,
      },
      vertexShader: /* glsl */ `
        varying vec3 proxyPoint;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          proxyPoint = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 origin, axis, tint;
        uniform float span, startRadius, endRadius, strength, time;
        varying vec3 proxyPoint;

        void addSide(float t, float h, float dh, inout float nearT, inout float farT) {
          float z = h + dh * t;
          if (t >= 0.0 && z >= 0.0 && z <= span) {
            nearT = min(nearT, t);
            farT = max(farT, t);
          }
        }

        void addCap(float t, float radius, vec3 offset, vec3 lateral,
                    inout float nearT, inout float farT) {
          vec3 point = offset + lateral * t;
          if (t >= 0.0 && dot(point, point) <= radius * radius) {
            nearT = min(nearT, t);
            farT = max(farT, t);
          }
        }

        void main() {
          vec3 ray = normalize(proxyPoint - cameraPosition);
          vec3 eye = cameraPosition - origin;
          float h = dot(eye, axis), dh = dot(ray, axis);
          vec3 offset = eye - axis * h, lateral = ray - axis * dh;
          float spread = (endRadius - startRadius) / span;
          float r = startRadius + spread * h, dr = spread * dh;
          float a = dot(lateral, lateral) - dr * dr;
          float b = dot(offset, lateral) - r * dr;
          float c = dot(offset, offset) - r * r;
          bool inside = h >= 0.0 && h <= span && c < 0.0;
          if (inside == gl_FrontFacing) discard;
          float nearT = inside ? 0.0 : 1.e4, farT = -1.0;

          // Integrate the finite cone between its wall and cap intersections.
          float discriminant = b * b - a * c;
          if (abs(a) > .00001 && discriminant >= 0.0) {
            float root = sqrt(discriminant);
            addSide((-b - root) / a, h, dh, nearT, farT);
            addSide((-b + root) / a, h, dh, nearT, farT);
          } else if (abs(a) <= .00001 && abs(b) > .00001) {
            addSide(-c / (2.0 * b), h, dh, nearT, farT);
          }
          if (abs(dh) > .00001) {
            addCap(-h / dh, startRadius, offset, lateral, nearT, farT);
            addCap((span - h) / dh, endRadius, offset, lateral, nearT, farT);
          }
          if (farT <= nearT) discard;

          const int samples = 12;
          float stepSize = (farT - nearT) / float(samples);
          float density = 0.0;
          for (int i = 0; i < samples; i++) {
            float t = nearT + (float(i) + .5) * stepSize;
            vec3 p = eye + ray * t;
            float z = dot(p, axis), along = clamp(z / span, 0.0, 1.0);
            float radial = length(p - axis * z) / mix(startRadius, endRadius, along);
            float edge = 1.0 - smoothstep(.54, 1.0, radial);
            float ends = smoothstep(0.0, .045, along) * (1.0 - smoothstep(.82, 1.0, along));
            float haze = .85 + .09 * sin(dot(p, vec3(3.7, 1.6, 2.9)) + .31 * time)
              * sin(dot(p, vec3(-2.4, 3.1, 1.4)) - .23 * time)
              + .05 * sin(dot(p, vec3(5.2, 4.6, -3.8)));
            density += edge * ends * haze * mix(1.7, .92, along);
          }
          float alpha = 1.0 - exp(-.77 * density * stepSize);
          gl_FragColor = vec4(tint, strength * alpha);
          #include <colorspace_fragment>
        }
      `,
      depthWrite: false, transparent: true, side: T.DoubleSide, forceSinglePass: true,
      blending: T.AdditiveBlending, toneMapped: false,
    });
    const geometry = new T.CylinderGeometry(startRadius, endRadius, length, 48);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.copy(origin).lerp(end, .5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.clone().negate());
    mesh.name = 'White outfit volumetric spotlight';
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { mesh, strength, time, day: .42, night: .58 };
  }

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
  const originalFixtures = new T.Group();
  scene.add(originalFixtures);
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
    originalFixtures.add(fixture, stand);
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
    originalFixtures.visible = !concert;
    const blackout = concert && night;
    scene.background.set(blackout ? '#040405' : '#131719');
    scene.fog.color.copy(scene.background);
    // The open roof still shows the night sky when the auditorium lights go out.
    atriumSky.setNight(night);
    probes.setNight(night, rainActive || blackout);
    bounce.intensity = blackout ? .15 : rainActive ? (night ? .18 : .23) : (night ? .48 : .91);
    daylight.intensity = rainActive || blackout ? 0 : night ? .115 : 1.85;
    shelves.intensity = concert || rainActive ? 0 : night ? 25 : 16;
    lounge.intensity = rainActive || blackout ? 0 : night ? 28 : 9;
    upperFill.intensity = concert || rainActive ? 0 : night ? 18 : 7;
    renderer.toneMappingExposure = night ? 1.02 : 1.05;
    scene.environmentIntensity = blackout ? .06 : rainActive ? (night ? .10 : .14) : (night ? .34 : .58);
    if (concert) {
      for (const light of spots) light.intensity = 0;
    } else if (rainActive) {
      setSpotlight(spots[0], rainSpot, night);
      for (const light of spots.slice(1)) light.intensity = 0;
    } else {
      spots.forEach((light, index) => setSpotlight(light, roomSpots[index], night));
    }
    for (const beam of beams) {
      beam.strength.value = night ? beam.night : beam.day;
      beam.mesh.visible = !concert && !rainActive && beam.strength.value > 0;
    }
    if (rainBeam) {
      rainBeam.strength.value = night ? rainBeam.night : rainBeam.day;
      rainBeam.mesh.visible = rainActive;
      rainGlow.visible = rainActive;
      rainGlow.material.opacity = night ? .72 : .49;
    }
    for (const lamp of lamps) lamp.opacity = concert || rainActive ? 0 : night ? 1 : .24;
    stageMist?.setVisible(rainActive, night);
  }
  function setRainStage(enabled) {
    rainActive = enabled;
    if (enabled && !stageMist) {
      stageMist = createStageMist(T, scene, rainSpot.to);
      rainBeam = rainShaft();
      rainGlow = lampGlow(new T.Vector3(...rainSpot.from), rainSpot.color, .83);
    }
    setNight(isNight);
  }
  function withoutRainOverhead(render) {
    if (!rainActive) return render();
    const overhead = [spots[0], rainBeam.mesh, rainGlow];
    const visibility = overhead.map(object => object.visible);
    try {
      for (const object of overhead) object.visible = false;
      return render();
    } finally {
      overhead.forEach((object, index) => { object.visible = visibility[index]; });
    }
  }
  function setShadows(enabled) {
    renderer.shadowMap.enabled = enabled;
    if (enabled) renderer.shadowMap.needsUpdate = true;
  }
  setNight(true);
  return {
    setConcert(value) {
      concert = value;
      atriumSky.setConstellation(value);
      setNight(isNight);
    },
    setNight, setShadows, setRainStage, withoutRainOverhead, rainLightPosition: rainSpot.from,
    get skyState() { return atriumSky.state; },
    update(seconds, animate) {
      atriumSky.update(seconds, animate);
      stageMist?.update(seconds);
      if (rainBeam?.mesh.visible) rainBeam.time.value = animate ? seconds : 2;
    },
  };
}
