export const CONCERT_MIRROR_POSITION = Object.freeze([.55, 6.08, -2.62]);

const INTRO_SECONDS = 2.05;
const COLOUR_CUE_SECONDS = 4;
const DECK_KEY_POWER = 90;
const MIRROR_SCALE = Math.cbrt(.70);
const MIRROR_RADIUS = .57 * MIRROR_SCALE;

// A sphere away from the optical axis projects as an ellipse. Shorten only its
// radial image axis about the top fitting so the cable still meets the glass.
const roundMirrorProjection = /* glsl */ `
  uniform vec3 ballCenter;
  vec4 roundMirrorInView(vec4 eye) {
    const float radius = ${MIRROR_RADIUS};
    vec3 center = (viewMatrix * vec4(ballCenter, 1.0)).xyz;
    float offset2 = dot(center.xy, center.xy);
    float depth = -center.z;
    if (offset2 > .000001 && depth > radius) {
      float tangent2 = depth * depth - radius * radius;
      float ratio = sqrt(tangent2 / (tangent2 + offset2));
      vec2 radial = center.xy * inversesqrt(offset2);
      vec4 fitting = viewMatrix * vec4(ballCenter + vec3(0.0, radius, 0.0), 1.0);
      vec2 pivot = fitting.xy * (eye.z / fitting.z);
      float amount = (1.0 - ratio) * smoothstep(radius, radius * 2.0, depth);
      eye.xy -= radial * dot(eye.xy - pivot, radial) * amount;
    }
    return eye;
  }
`;

const beamColour = /* glsl */ `
  vec3 beamColour(float hue, vec3 violet, vec3 magenta, vec3 gold) {
    if (hue < 0.0) return vec3(.72, .80, 1.0);
    return hue < .5 ? mix(violet, magenta, hue * 2.0)
      : mix(magenta, gold, smoothstep(.5, .98, hue));
  }
`;

function fadeBetween(seconds, from, to) {
  const t = Math.max(0, Math.min(1, (seconds - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function createConcertLighting(T, scene, { reducedMotion = false } = {}) {
  const group = new T.Group();
  group.name = 'Concert lights and atmosphere';
  scene.add(group);
  const clock = { value: 1.25 };
  const keyTint = { value: new T.Color() };
  const accentTint = { value: new T.Color() };
  const goldTint = { value: new T.Color() };
  const ballTint = { value: new T.Color() };
  const levels = { value: .85 };
  const ballCenter = { value: new T.Vector3(...CONCERT_MIRROR_POSITION) };
  const ballGain = { value: 1 };
  const ballTurn = { value: .2 };
  const cues = [
    ['#ff9b25', '#ff6422', '#ffd259'],
    ['#7826e8', '#c023ba', '#f19738'],
    ['#983bdc', '#df318b', '#fbb343'],
  ].map(pair => pair.map(color => new T.Color(color)));
  function quads(origins, attributes, vertexShader, fragmentShader, order = 2, verticalSegments = 1) {
    const geometry = new T.InstancedBufferGeometry().copy(new T.PlaneGeometry(1, 1, 1, verticalSegments));
    geometry.instanceCount = origins.length / 3;
    geometry.setAttribute('anchor', new T.InstancedBufferAttribute(new Float32Array(origins), 3));
    for (const [name, [data, stride]] of Object.entries(attributes)) {
      geometry.setAttribute(name, new T.InstancedBufferAttribute(new Float32Array(data), stride));
    }
    const material = new T.ShaderMaterial({
      uniforms, vertexShader, fragmentShader, transparent: true,
      depthWrite: false, depthTest: true, blending: T.AdditiveBlending,
      side: T.DoubleSide, toneMapped: false,
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    group.add(mesh);
    return mesh;
  }

  // The rear fixtures form a low arc. Aim each beam at the face of the sphere
  // it actually hits, so it cannot continue through the glass as a horizontal bar.
  const [ballX, ballY, ballZ] = CONCERT_MIRROR_POSITION;
  const toMirror = from => new T.Vector3(...from).sub(ballCenter.value)
    .normalize().multiplyScalar(MIRROR_RADIUS * .97).add(ballCenter.value).toArray();
  const rearFixtures = [.48, 1.52, 2.56, 3.65, 4.83, 6.04, 7.32].flatMap((offset, row) =>
    [-1, 1].map(side => {
      const spread = offset / 7.32;
      const arc = spread ** 2;
      const from = [ballX + side * offset, 1.37 + 1.55 * arc, -5.15 + 2.12 * arc];
      const hue = side < 0 ? .10 + .49 * spread : .29 + .62 * spread;
      return { from, to: toMirror(from), radius: .205 + .046 * spread, hue,
        gain: .86 - .16 * spread, delay: .06 + row * .070 + (side > 0 ? .045 : 0), fixed: true };
    }));
  const pinOrigin = [ballX - .095, 6.99, ballZ + .066];
  const pinspot = { from: pinOrigin, to: toMirror(pinOrigin), radius: .105, hue: -1,
    gain: .72, delay: .36, fixed: true };
  const upperFixtures = [-5.53, -3.93, -2.34, 2.64, 4.18, 5.65].map((x, index) => ({
    from: [x, 6.94, -4.68], to: [x * 1.58, 9.12 + .11 * (index % 3), -2.29],
    radius: .40 + Math.abs(x) * .042, hue: index < 3 ? .86 - index * .18 : .32 - (index - 3) * .125,
    gain: .46, delay: .53 + .07 * Math.abs(index - 2.5), fixed: false,
  }));
  const fixtures = [...rearFixtures, pinspot, ...upperFixtures];
  const heads = [], endpoints = [], profiles = [], tracking = [];
  const fixtureGain = { value: new Float32Array(fixtures.length).fill(1) };
  const atmosphereGain = { value: 1 };
  const uniforms = {
    clock, keyTint, accentTint, goldTint, ballTint, levels, fixtureGain, atmosphereGain,
    ballCenter, ballGain, ballTurn,
  };
  fixtures.forEach(({ from, to, radius, hue, fixed }, i) => {
    heads.push(...from);
    endpoints.push(...to);
    profiles.push(.041, radius, i * 1.37, hue);
    tracking.push(fixed ? 1 : 0);
  });
  // Subdivide the taper so its centreline and soft edges interpolate evenly.
  const beams = quads(heads, { end: [endpoints, 3], profile: [profiles, 4], tracked: [tracking, 1] }, /* glsl */`
    uniform float clock, fixtureGain[${fixtures.length}];
    attribute vec3 anchor, end;
    attribute vec4 profile;
    attribute float tracked;
    varying vec2 beamUv;
    varying float hue, power, stationary;
    void main() {
      float p = profile.z;
      vec3 tip = end + (1.0 - tracked) * vec3(.64*sin(clock*.28 + p*.58),
        0.0, .45*sin(clock*.25+p));
      stationary = tracked;
      vec3 axis = normalize(tip - anchor);
      vec3 center = mix(anchor, tip, uv.y);
      vec3 toCamera = cameraPosition - center;
      vec3 crossAxis = cross(axis, toCamera);
      vec3 side = crossAxis / max(length(crossAxis), .001);
      float spread = mix(profile.x, profile.y * .50, uv.y) + profile.y * .59 * sin(3.141593 * uv.y);
      float beamRadius = mix(mix(profile.x, profile.y * 1.36, uv.y), spread, tracked);
      beamUv = uv;
      hue = profile.w;
      power = fixtureGain[gl_InstanceID] * (.62 + .38 * pow(abs(dot(axis, normalize(toCamera))), 2.0)) *
        (.92 + .08 * sin(clock * .87 + p));
      gl_Position = projectionMatrix * viewMatrix * vec4(center + side * position.x * 2.0 * beamRadius, 1.0);
    }`, /* glsl */`
    uniform vec3 keyTint, accentTint, goldTint;
    uniform float clock, levels;
    ${beamColour}
    varying vec2 beamUv;
    varying float hue, power, stationary;
    void main() {
      float crossSection = abs(beamUv.x * 2.0 - 1.0);
      float narrow = exp(-5.4 * crossSection * crossSection);
      float edge = 1.0 - smoothstep(.10, 1.0, crossSection);
      float reach = mix(.66, .935, stationary);
      float falloff = smoothstep(0.0, .026, beamUv.y) * (1.0 - smoothstep(reach, 1.0, beamUv.y));
      float air = .76 + .14*sin(beamUv.y * 11.0 - clock * .36 + hue * 8.0)
        + .07*sin(beamUv.y * 23.4 + crossSection * 2.4 + clock * .26);
      vec3 tint = beamColour(hue, keyTint, accentTint, goldTint);
      tint = mix(tint, vec3(1.0, .87, .74), .2 * narrow * exp(-9.0 * beamUv.y));
      gl_FragColor = vec4(tint, levels*power*falloff*air*edge*(.16 + narrow*.62));
      #include <colorspace_fragment>
    }`, 2, 24);
  beams.name = 'Rear mirrorball fan, overhead pinspot and upper beams';

  const glowVertex = /* glsl */`
    uniform float fixtureGain[${fixtures.length}];
    attribute vec3 anchor;
    attribute vec4 glowData;
    varying vec2 glowUv;
    varying vec4 properties;
    void main() {
      glowUv = uv;
      properties = vec4(glowData.yzw, fixtureGain[gl_InstanceID]);
      vec4 center = viewMatrix * vec4(anchor, 1.0);
      gl_Position = projectionMatrix * (center + vec4(position.xy * glowData.x, 0.0, 0.0));
    }`;
  const glowFragment = /* glsl */`
    uniform vec3 keyTint, accentTint, goldTint;
    uniform float clock, levels;
    ${beamColour}
    varying vec2 glowUv;
    varying vec4 properties;
    void main() {
      vec2 xy = glowUv * 2.0 - 1.0;
      float r = dot(xy, xy);
      float soft = exp(-4.2*r) * (1.0 - smoothstep(.53, 1.0, r));
      float core = exp(-20.0 * r);
      float twinkle = .73 + .27 * sin(clock * properties.z + properties.x);
      vec3 tint = beamColour(properties.y, keyTint, accentTint, goldTint);
      gl_FragColor = vec4(mix(tint, vec3(1.0, .91, .79), core * .66),
        levels * properties.w * (.38 * soft + core*.88) * twinkle);
      #include <colorspace_fragment>
    }`;
  const glareData = [];
  const lampSockets = [];
  for (let i = 0; i < heads.length / 3; i++) {
    const x = heads[i*3], y = heads[i*3 + 1], z = heads[i*3 + 2];
    lampSockets.push(x, y - .018, z + .025);
    glareData.push(i < rearFixtures.length ? .37 : .46, i * .23 + 1.1, fixtures[i].hue, .65);
  }
  quads(lampSockets, { glowData: [glareData, 4] }, glowVertex, glowFragment, 3);

  const fixture = new T.InstancedMesh(new T.CylinderGeometry(.091, .112, .20, 14),
    new T.MeshStandardMaterial({ color: '#181827', roughness: .55, metalness: .29 }), heads.length / 3);
  const lens = new T.InstancedMesh(new T.SphereGeometry(.055, 12, 6),
    new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), heads.length / 3);
  const up = new T.Vector3(0, 1, 0), axis = new T.Vector3(), former = new T.Object3D();
  const lensColor = new T.Color();
  const pinTint = new T.Color(.72, .80, 1.0);
  for (let i = 0; i < heads.length / 3; i++) {
    const offset = i * 3;
    former.position.fromArray(heads, offset);
    axis.fromArray(endpoints, offset).sub(former.position).normalize();
    former.quaternion.setFromUnitVectors(up, axis);
    former.position.addScaledVector(axis, -.084);
    former.updateMatrix();
    fixture.setMatrixAt(i, former.matrix);
    former.position.fromArray(heads, offset).addScaledVector(axis, .01);
    former.updateMatrix();
    lens.setMatrixAt(i, former.matrix);
    lens.setColorAt(i, lensColor);
  }
  group.add(fixture, lens);

  // Two curved layers give the wash depth when seen from the balcony or either wing.
  const hazeGeometry = new T.PlaneGeometry(1, 1, 24, 2);
  const haze = new T.InstancedMesh(hazeGeometry, new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: T.DoubleSide,
    blending: T.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 hazeUv;
      varying float layer;
      void main() {
        hazeUv = uv;
        layer = float(gl_InstanceID);
        float arch = (uv.x - .5) * 2.0;
        vec3 p = vec3(position.x * mix(14.5, 10.6, layer),
          mix(-.26, .04, layer) + uv.y * mix(10.2, 8.5, layer),
          mix(-2.35, -.88, layer) + arch * arch * .75);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float clock, levels, atmosphereGain;
      uniform vec3 keyTint, accentTint;
      varying vec2 hazeUv;
      varying float layer;
      void main() {
        vec2 p = vec2((hazeUv.x-.5)*2.0, hazeUv.y);
        float depth = max(0.0, 1.0-p.x*p.x);
        depth *= smoothstep(0.,.20,p.y) * (1.-smoothstep(.74,1.,p.y));
        float drift = clock*.095 + layer*2.8;
        float eddies = .5+.23*sin(p.x*4.8+sin(p.y*4.4+drift)+drift)+
                         .17*sin(p.y*8.3-p.x*3.6+cos(p.x*5.7-drift));
        float bank = exp(-4.4*pow(p.y-.53-.10*sin(3.6*p.x+drift),2.0));
        // Density gathers in the directions of the rear spotlights.
        float left = p.x+.39-.13*p.y-.06*sin(p.y*4.+drift);
        float right = p.x-.38+.16*p.y+.045*cos(p.y*5.-drift);
        float canopy = exp(-18.*left*left)+.88*exp(-22.*right*right);
        float scatter = depth*bank*(.11+.16*eddies)*(.25+.50*canopy)*mix(1.,.42,layer);
        float hue = smoothstep(-.76,.8,p.x+.21*eddies+.27*p.y);
        gl_FragColor = vec4(mix(keyTint, accentTint, hue), atmosphereGain*levels*scatter);
        #include <colorspace_fragment>
      }`,
  }), 2);
  haze.frustumCulled = false;
  haze.renderOrder = 0;
  group.add(haze);

  // Soft reflections from suspended flecks mostly show inside the coloured light.
  let seed = 13203;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const flecks = [], fleckData = [];
  for (let i = 0; i < 114; i++) {
    const x = (random() - .5) * 12.1;
    flecks.push(x, .50 + random() * 7.65, -2.56 - random() * 2.7);
    fleckData.push(.033 + random() ** 2 * .125, random() * 6.28,
      random() * .6 + .4 * (x + 6.1) / 12.2, random());
  }
  quads(flecks, { glint: [fleckData, 4] }, /* glsl */`
    uniform float clock;
    attribute vec3 anchor;
    attribute vec4 glint;
    varying vec2 fleckUv;
    varying vec3 scattering;
    void main() {
      fleckUv = uv*2.-1.;
      float t = clock*(.23+.20*glint.w)+glint.y;
      vec3 p = anchor+vec3(.14*sin(t*1.7), .24*sin(t), .10*cos(t*1.2));
      float a = glint.y+.9*sin(t);
      mat2 rotation = mat2(cos(a),sin(a),-sin(a),cos(a));
      vec2 size = glint.x * vec2(.37 + .28*abs(sin(t)), 1.);
      vec4 eye = viewMatrix*vec4(p,1.);
      eye.xy += rotation*(position.xy*size);
      scattering = vec3(glint.z, .09+.42*pow(abs(sin(t*.87)),4.), glint.w);
      gl_Position = projectionMatrix*eye;
    }`, /* glsl */`
    uniform vec3 keyTint, accentTint;
    uniform float atmosphereGain;
    varying vec2 fleckUv;
    varying vec3 scattering;
    void main() {
      float r = dot(fleckUv,fleckUv);
      float feather = 1.-smoothstep(.04,1.,r);
      vec3 tint = mix(keyTint, accentTint, scattering.x);
      tint = mix(tint,vec3(1.,.25,.08),.22*scattering.z);
      gl_FragColor=vec4(tint,atmosphereGain*feather*scattering.y);
      #include <colorspace_fragment>
    }`, 1);

  // Each glass tile has its own flat normal and a small gap over the silver backing.
  const mirrorTiles = new T.BufferGeometry();
  const tilePositions = [], tileNormals = [], tileNoise = [], tileIndices = [];
  const tileRows = 39;
  const tau = Math.PI * 2;
  const sphericalPoint = (lat, lon, radius) => [
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.sin(lon),
  ];
  for (let row = 0; row < tileRows; row++) {
    const middle = Math.PI * ((row + .5) / tileRows - .5);
    const columns = Math.max(4, Math.round(2 * tileRows * Math.cos(middle)));
    for (let col = 0; col < columns; col++) {
      const lon = (col + (row % 2) * .28) * tau / columns;
      const dx = tau * .47 / columns, dy = Math.PI * .47 / tileRows;
      const jitter = random();
      const normal = sphericalPoint(middle, lon, 1);
      const first = tilePositions.length / 3;
      for (const [lat, angle] of [[middle - dy, lon - dx], [middle + dy, lon - dx],
        [middle + dy, lon + dx], [middle - dy, lon + dx]]) {
        tilePositions.push(...sphericalPoint(lat, angle, MIRROR_RADIUS));
        tileNormals.push(...normal);
        tileNoise.push(jitter);
      }
      tileIndices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  mirrorTiles.setAttribute('position', new T.Float32BufferAttribute(tilePositions, 3));
  mirrorTiles.setAttribute('normal', new T.Float32BufferAttribute(tileNormals, 3));
  mirrorTiles.setAttribute('tileNoise', new T.Float32BufferAttribute(tileNoise, 1));
  mirrorTiles.setIndex(tileIndices);
  const mirrorBody = new T.Mesh(mirrorTiles, new T.ShaderMaterial({
    uniforms, toneMapped: false,
    vertexShader: /* glsl */`
      ${roundMirrorProjection}
      attribute float tileNoise;
      varying vec3 facet, surfacePoint;
      varying float grain;
      void main() {
        facet = mat3(modelMatrix) * normal;
        surfacePoint = (modelMatrix * vec4(position, 1.0)).xyz;
        grain = tileNoise;
        gl_Position = projectionMatrix * roundMirrorInView(viewMatrix * vec4(surfacePoint, 1.0));
      }`,
    fragmentShader: /* glsl */`
      uniform float ballGain;
      uniform vec3 ballTint;
      varying vec3 facet, surfacePoint;
      varying float grain;
      void main() {
        vec3 direction = normalize(facet);
        vec3 eye = normalize(cameraPosition - surfacePoint);
        vec3 incident = normalize(vec3(${rearFixtures[4].from.join(', ')}) - surfacePoint);
        vec3 crossLight = normalize(vec3(${rearFixtures[5].from.join(', ')}) - surfacePoint);
        vec3 overhead = normalize(vec3(${pinOrigin.join(', ')}) - surfacePoint);
        vec3 stageBounce = normalize(vec3(-2.0, 6.95, 3.2) - surfacePoint);
        vec3 secondaryBounce = normalize(vec3(2.5, 7.48, 1.4) - surfacePoint);
        float left = max(0.0, dot(direction, incident));
        float right = max(0.0, dot(direction, crossLight));
        float pinFill = max(0.0, dot(direction, overhead));
        float focusLeft = max(0.0, dot(reflect(-incident, direction), eye));
        float focusRight = max(0.0, dot(reflect(-crossLight, direction), eye));
        float frontFocus = max(0.0, dot(reflect(-stageBounce, direction), eye));
        float sideFocus = max(0.0, dot(reflect(-secondaryBounce, direction), eye));
        float flash = pow(focusLeft, 45.0) + .86 * pow(focusRight, 51.0) +
          .83 * pow(frontFocus, 34.0) + .74 * pow(sideFocus, 41.0);
        float pool = pow(focusLeft, 7.0) + .62 * pow(focusRight, 8.0) +
          .64 * pow(frontFocus, 9.0) + .50 * pow(sideFocus, 12.0);
        float bounce = max(0.0, dot(direction, stageBounce)) * smoothstep(-.87, .55, direction.y);
        float rim = pow(1.0 - max(0.0, dot(eye, direction)), 2.8);
        vec3 colour = vec3(.027, .020, .035) * (.56 + .62 * grain);
        colour += ballTint * ((.24 * left + .27 * right + .83 * pool + .39 * bounce)
          * (.30 + 1.05 * grain) + .29 * rim);
        colour += vec3(.72, .79, 1.0) * pinFill * (.045 + .075 * grain);
        colour += mix(ballTint, vec3(1.0, .89, .80), .46) * (1.72 * flash * (.26 + 1.29 * grain));
        gl_FragColor = vec4(colour * ballGain, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  mirrorBody.name = 'Faceted gold mirrorball';
  mirrorBody.position.copy(ballCenter.value);
  group.add(mirrorBody);
  const backingMaterial = new T.ShaderMaterial({
    uniforms: { ballCenter, ballGain, tint: { value: new T.Color('#151019') } }, toneMapped: false,
    vertexShader: /* glsl */`
      ${roundMirrorProjection}
      void main() {
        gl_Position = projectionMatrix * roundMirrorInView(modelViewMatrix * vec4(position, 1.0));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 tint;
      uniform float ballGain;
      void main() {
        gl_FragColor = vec4(tint * ballGain, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mirrorBacking = new T.Mesh(new T.SphereGeometry(MIRROR_RADIUS - .013, 36, 22), backingMaterial);
  mirrorBody.add(mirrorBacking);

  // A dark cantilever bolts into the fourth floor slab instead of crossing the open roof.
  const hanger = new T.Group();
  hanger.name = 'Fourth-floor mirrorball bracket';
  group.add(hanger);
  const steel = new T.MeshStandardMaterial({
    color: '#312a32', roughness: .57, metalness: .56, emissive: '#4a3a33', emissiveIntensity: 0,
  });
  const cableSteel = new T.MeshStandardMaterial({
    color: '#6b5b53', roughness: .58, metalness: .48, emissive: '#8a6c57', emissiveIntensity: 0,
  });
  function strut(geometry, material, from, to) {
    const start = new T.Vector3(...from), end = new T.Vector3(...to);
    const length = start.distanceTo(end);
    const piece = new T.Mesh(geometry, material);
    piece.position.copy(start).lerp(end, .5);
    piece.quaternion.setFromUnitVectors(up, end.sub(start).normalize());
    piece.scale.y = length;
    hanger.add(piece);
  }
  strut(new T.BoxGeometry(.075, 1, .075), steel, [ballX, 7.04, -5.39], [ballX, 7.04, ballZ]);
  strut(new T.BoxGeometry(.050, 1, .050), steel, [ballX, 7.26, -5.14], [ballX, 7.05, -4.49]);
  strut(new T.CylinderGeometry(.072, .072, 1, 12), steel, [ballX, 6.92, ballZ], [ballX, 7.055, ballZ]);
  strut(new T.CylinderGeometry(.013, .013, 1, 9), cableSteel, [ballX, ballY + MIRROR_RADIUS, ballZ], [ballX, 6.94, ballZ]);
  strut(new T.CylinderGeometry(.032, .048, 1, 12), cableSteel,
    [ballX, ballY + MIRROR_RADIUS - .009, ballZ], [ballX, ballY + MIRROR_RADIUS + .073, ballZ]);

  // A low-intensity corona stays small enough to leave the individual tiles legible.
  quads(ballCenter.value.toArray(), {}, /* glsl */`
    ${roundMirrorProjection}
    attribute vec3 anchor;
    varying vec2 point;
    void main() {
      point = uv * 2.0 - 1.0;
      vec4 eye = roundMirrorInView(viewMatrix * vec4(anchor, 1.0));
      gl_Position = projectionMatrix * (eye + vec4(position.xy * ${3.30 * MIRROR_SCALE}, 0.0, 0.0));
    }`, /* glsl */`
    uniform float ballGain, ballTurn;
    uniform vec3 ballTint;
    varying vec2 point;
    void main() {
      vec2 p = point;
      float distance = length(p);
      float angle = atan(p.y, p.x + .00001);
      float split = sin(angle * 10.0 + .7) * sin(angle * 7.0 - 1.5 + ballTurn);
      float streak = pow(.5 + .5 * cos(angle * 19.0 + .53 + .54 * split), 7.0);
      float fade = exp(-3.8 * distance) * (1.0 - smoothstep(.53, 1.0, distance));
      gl_FragColor = vec4(ballTint, ballGain * fade * (.19 + .27 * streak));
      #include <colorspace_fragment>
    }`, 3);

  // Reflected light follows rays from the spinning sphere to the room surfaces.
  // The wall spots stay world-aligned and get stretched at oblique incidence.
  const reflections = [], reflectionData = [];
  for (let i = 0; i < 430; i++) {
    const height = random() * 1.93 - .99;
    reflections.push(random() * tau, height, random());
    reflectionData.push(.050 + random() ** 2 * .110, random(), random(), random());
  }
  const reflectionsMesh = quads(reflections, { glintProfile: [reflectionData, 4] }, /* glsl */`
    uniform float ballTurn, ballGain;
    uniform vec3 ballCenter;
    attribute vec3 anchor;
    attribute vec4 glintProfile;
    varying vec2 point;
    varying vec3 properties;
    void main() {
      point = uv * 2.0 - 1.0;
      float heading = anchor.x + ballTurn;
      float elevation = anchor.y + .051 * sin(anchor.x * 4.0 + ballTurn);
      float radius = sqrt(max(.0001, 1.0 - elevation * elevation));
      vec3 ray = vec3(radius * cos(heading), elevation, radius * sin(heading));
      vec3 safeRay = sign(ray + .00001) * max(abs(ray), vec3(.00001));
      vec3 boundary = vec3(ray.x < 0.0 ? -8.875 : 8.875, ray.y < 0.0 ? .021 : 10.08,
        ray.z < 0.0 ? -6.426 : 8.886);
      vec3 distances = (boundary - ballCenter) / safeRay;
      float d = min(distances.x, min(distances.y, distances.z));
      vec3 normal = vec3(0.0);
      if (d == distances.x) normal.x = -sign(ray.x);
      else if (d == distances.z) normal.z = -sign(ray.z);
      else normal.y = -sign(ray.y);
      vec3 center = ballCenter + ray * d + normal * .011;
      vec3 across = normalize(abs(normal.y) > .5 ? vec3(1.0, 0.0, 0.0) : cross(normal, vec3(0.0, 1.0, 0.0)));
      vec3 along = normalize(cross(normal, across));
      float angle = atan(dot(ray, along), dot(ray, across));
      float skew = 1.0 + 1.45 * pow(1.0 - abs(dot(ray, normal)), 2.0);
      vec2 offset = position.xy * glintProfile.x * (1.27 + .074 * d) * vec2(skew, 1.0);
      vec2 rotated = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * offset;
      float wall = abs(normal.y) > .5 ? .44 : 1.0;
      if (normal.y < 0.0) wall = 0.0;
      // Do not paint onto the glass in the high openings on the right wall.
      if (normal.x < -.5 && ((center.y > 7.22 && center.y < 8.79 && center.z > -.10 && center.z < 7.51) ||
          (center.y > 4.21 && center.y < 8.98 && center.z > -6.64 && center.z < -2.42))) wall = 0.0;
      float twinkle = .43 + .57 * pow(abs(sin(anchor.z * 13.0 + ballTurn * 5.2)), 1.9);
      properties = vec3(glintProfile.y, ballGain * wall * twinkle * (.22 + .49 * glintProfile.z), glintProfile.w);
      gl_Position = projectionMatrix * viewMatrix * vec4(center + across * rotated.x + along * rotated.y, 1.0);
    }`, /* glsl */`
    uniform vec3 goldTint, accentTint, keyTint;
    varying vec2 point;
    varying vec3 properties;
    void main() {
      float radius = length(point);
      float blur = 1.0 - smoothstep(.13, 1.0, radius);
      float core = 1.0 - smoothstep(.0, .57, radius);
      vec3 rose = mix(keyTint, accentTint, properties.z);
      vec3 tint = mix(rose, goldTint, smoothstep(.43, .62, properties.x));
      gl_FragColor = vec4(tint, properties.y * (.34 * blur + .64 * core));
      #include <colorspace_fragment>
    }`, 1);
  reflectionsMesh.name = 'Mirrorball reflections on stage and walls';

  // The cone just reaches the disk's rim. Nearby walkways stay outside it.
  const deckKey = new T.SpotLight('#fff0df', DECK_KEY_POWER, 7, .415, .57, 2);
  deckKey.position.set(0, 4.88, 1.0);
  deckKey.target.position.set(0, .26, 1.0);
  group.add(deckKey, deckKey.target);
  const wingFill = [
    [[-4.25, 6.92, -4.62], [-5.45, .12, .68]],
    [[4.13, 6.92, -4.62], [4.62, .12, .13]],
  ].map(([origin, destination]) => {
    const light = new T.SpotLight('#bb70ff', 0, 9, .27, .75, 2);
    light.position.set(...origin);
    light.target.position.set(...destination);
    group.add(light, light.target);
    return light;
  });

  // Reveal the low rear fan first, then the mirrorball, rim and singer's front light.
  const intro = { seconds: INTRO_SECONDS, rim: 1, front: 1, deck: 1, wall: 1 };
  let introStart = null, colourStart = null;
  function applyIntro(seconds) {
    intro.seconds = seconds;
    for (let i = 0; i < fixtures.length; i++) {
      const { delay, gain } = fixtures[i];
      fixtureGain.value[i] = gain * fadeBetween(seconds, delay, delay + .52);
    }
    for (const light of wingFill) light.intensity = 52 * fadeBetween(seconds, .52, 1.47);
    atmosphereGain.value = fadeBetween(seconds, .17, 1.37);
    ballGain.value = fadeBetween(seconds, .27, 1.18);
    steel.emissiveIntensity = .13 * ballGain.value;
    cableSteel.emissiveIntensity = .31 * ballGain.value;
    intro.rim = fadeBetween(seconds, .48, 1.25);
    intro.front = fadeBetween(seconds, .87, INTRO_SECONDS);
    intro.deck = fadeBetween(seconds, .99, 1.86);
    intro.wall = fadeBetween(seconds, .84, 1.97);
    deckKey.intensity = DECK_KEY_POWER * fadeBetween(seconds, .74, 1.94);
    return intro;
  }

  function applyColour(seconds) {
    const cue = (seconds / COLOUR_CUE_SECONDS) % cues.length;
    const index = Math.floor(cue);
    const blend = fadeBetween(cue, index, index + 1);
    const next = cues[(index + 1) % cues.length];
    keyTint.value.copy(cues[index][0]).lerp(next[0], blend);
    accentTint.value.copy(cues[index][1]).lerp(next[1], blend);
    goldTint.value.copy(cues[index][2]).lerp(next[2], blend);
    ballTint.value.copy(keyTint.value).lerp(accentTint.value, .39);
    for (let i = 0; i < fixtures.length; i++) {
      const { hue } = fixtures[i];
      if (hue < 0) lensColor.copy(pinTint);
      else if (hue < .5) lensColor.copy(keyTint.value).lerp(accentTint.value, hue * 2);
      else lensColor.copy(accentTint.value).lerp(goldTint.value, fadeBetween(hue, .5, .98));
      lens.setColorAt(i, lensColor.multiplyScalar(fixtureGain.value[i]));
    }
    lens.instanceColor.needsUpdate = true;
    for (const light of wingFill) light.color.copy(keyTint.value);
  }

  function update(time, motion = true) {
    const animate = motion && !reducedMotion;
    if (animate) {
      clock.value = time;
      if (introStart !== Infinity) colourStart ??= time;
    }
    const showTime = !animate ? COLOUR_CUE_SECONDS : colourStart === null ? 0 : Math.max(0, time - colourStart);
    let entrance = null;
    if (introStart !== null) {
      const seconds = animate ? Math.min(INTRO_SECONDS, Math.max(0, time - introStart)) : INTRO_SECONDS;
      if (seconds === INTRO_SECONDS) introStart = null;
      if (seconds !== intro.seconds) entrance = applyIntro(seconds);
    }
    applyColour(showTime);
    levels.value = .92 + .06*Math.sin(clock.value*.86);
    ballTurn.value = .2 + clock.value * .118;
    mirrorBody.rotation.y = -ballTurn.value;
    return entrance;
  }
  update(1.25, false);
  return {
    group, update, beams: fixtures.length, stars: 0,
    prepareIntro(animate) {
      introStart = animate && !reducedMotion ? Infinity : null;
      colourStart = null;
      const pending = introStart === Infinity;
      const entrance = applyIntro(pending ? 0 : INTRO_SECONDS);
      applyColour(pending ? 0 : COLOUR_CUE_SECONDS);
      return entrance;
    },
    beginIntro(time) {
      if (introStart !== Infinity) return;
      introStart = time;
      colourStart = time;
    },
    get intro() { return intro; },
  };
}
