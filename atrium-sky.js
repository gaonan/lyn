export const MESSAGE_WALL_SKY_EDGE = { height: 10.1, x: -8.9, z: 8.915, color: '#0b0b10' };

// Intermediate stars sit on the stroke at uneven intervals, with their own brightness.
function straightStroke(start, end, stars) {
  const [x1, y1] = start;
  const [x2, y2] = end;
  return [start, ...stars.map(([along, brightness]) =>
    [x1 + (x2 - x1) * along, y1 + (y2 - y1) * along, brightness]), end];
}

const L_CORNER = [-1.49, -.49, .83];
const Y_FORK = [-.10, -.015, .89];
const N_TOP = [.615, .475, .91];
const N_BOTTOM = [1.47, -.385, .94];
const LYN_STROKES = [
  straightStroke([-1.39, .47, .97], L_CORNER, [[.20, .37], [.54, .62]]),
  straightStroke(L_CORNER, [-.73, -.49, .69], [[.22, .42], [.63, .79], [.84, .36]]),
  straightStroke([-.56, .36, .87], Y_FORK, [[.28, .39], [.57, .64]]),
  straightStroke(Y_FORK, [.31, .49, .96], [[.38, .53], [.69, .40]]),
  straightStroke(Y_FORK, [-.10, -.43, .78], [[.54, .48]]),
  straightStroke([.61, -.45, .84], N_TOP, [[.29, .39], [.62, .66]]),
  straightStroke(N_TOP, N_BOTTOM, [[.22, .51], [.50, .75], [.65, .40]]),
  straightStroke(N_BOTTOM, [1.47, .34, .90], [[.35, .46], [.66, .70]]),
];
// Calibrated against the apparent bounds from the front of the stage.
const LYN_SCALE = .117;

export function createAtriumSky(T, scene) {
  const night = { value: true };
  const constellationVisible = { value: false };
  const constellationTime = { value: 0 };
  const constellationDirection = new T.Vector3(.14, .610, -.788).normalize();
  const constellationRight = new T.Vector3(-constellationDirection.z, 0, constellationDirection.x).normalize();
  const constellationUp = new T.Vector3().crossVectors(constellationRight, constellationDirection);
  const constellationPoints = [...new Set(LYN_STROKES.flat())].map(point => new T.Vector3(...point));
  const lines = LYN_STROKES.flatMap(stroke => stroke.slice(1).map(([x, y], index) =>
    new T.Vector4(stroke[index][0], stroke[index][1], x, y)));
  const meteorProgress = { value: -1 };
  const meteorFrom = { value: new T.Vector3(-1, 23, 13) };
  const meteorTo = { value: new T.Vector3(-9.5, 9, 9.4) };
  let previousSeconds, nightSeconds = 0, meteorStart = -1, meteorCount = 0;
  const interval = () => 8 + Math.random() * 2;
  let nextMeteor = interval();
  const parapet = MESSAGE_WALL_SKY_EDGE;
  const material = new T.ShaderMaterial({
    uniforms: { night, meteorProgress, meteorFrom, meteorTo, constellationVisible, constellationTime,
      constellationDirection: { value: constellationDirection },
      constellationRight: { value: constellationRight },
      constellationUp: { value: constellationUp },
      constellationPoints: { value: constellationPoints },
      constellationLines: { value: lines },
      rimColor: { value: new T.Color(parapet.color).convertLinearToSRGB() } },
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        // The view rotates the sky without translating it as the player walks.
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `
      uniform bool night;
      uniform vec3 rimColor;
      uniform float meteorProgress;
      uniform vec3 meteorFrom, meteorTo;
      uniform bool constellationVisible;
      uniform float constellationTime;
      uniform vec3 constellationDirection, constellationRight, constellationUp;
      uniform vec3 constellationPoints[${constellationPoints.length}];
      uniform vec4 constellationLines[${lines.length}];
      varying vec3 skyDirection;

      vec2 hash2(vec2 p) {
        vec3 h = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        h += dot(h, h.yzx + 33.33);
        return fract((h.xx + h.yz) * h.zy);
      }

      float noise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        vec2 w = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(cell).x, hash2(cell + vec2(1, 0)).x, w.x),
                   mix(hash2(cell + vec2(0, 1)).x, hash2(cell + 1.0).x, w.x), w.y);
      }

      float clouds(vec2 p) {
        const mat2 turn = mat2(.85, -.53, .53, .85);
        float value = .55 * noise(p);
        p = turn * p * 2.04 + 11.3;
        value += .26 * noise(p);
        p = turn * p * 2.09 - 8.22;
        value += .13 * noise(p);
        return value + .06 * noise(turn * p * 2.12 + 9.1);
      }

      float gaussian(float distance) {
        return exp(-distance * distance);
      }

      float starBurst(float seed) {
        vec2 cadence = hash2(vec2(seed, 5.3));
        float clock = constellationTime * mix(.24, .70, cadence.x) + cadence.y * 13.0;
        vec2 shape = hash2(vec2(floor(clock), seed + 8.1));
        vec2 power = hash2(vec2(seed - 13.4, floor(clock)));
        float start = .035 + .35 * shape.x;
        float peak = start + .035 + .12 * shape.y;
        float end = peak + .095 + .30 * power.y;
        float time = fract(clock);
        return smoothstep(start, peak, time) * (1.0 - smoothstep(peak, end, time)) * power.x * 1.22;
      }

      vec3 constellation(vec3 direction) {
        float facing = dot(direction, constellationDirection);
        vec2 p = vec2(dot(direction, constellationRight), dot(direction, constellationUp)) /
          (${LYN_SCALE} * max(facing, .01));
        float pixel = clamp(max(fwidth(p.x), fwidth(p.y)), .008, .068);
        if (facing < .92 || abs(p.x) > 1.68 || abs(p.y) > .68) return vec3(0.0);

        float thread = 0.0;
        for (int i = 0; i < ${lines.length}; i++) {
          vec4 segment = constellationLines[i];
          vec2 axis = segment.zw - segment.xy;
          float along = clamp(dot(p - segment.xy, axis) / dot(axis, axis), .0, 1.0);
          float distanceToLine = length(p - mix(segment.xy, segment.zw, along));
          float fade = mix(.26, .77, sin(along * 3.14159));
          float weight = mix(.52, 1.0, hash2(segment.xy + 4.1).x);
          thread = max(thread, fade * weight * gaussian(distanceToLine / max(.009, pixel * .48)));
        }

        vec3 color = vec3(.111, .094, .131) * thread;
        for (int i = 0; i < ${constellationPoints.length}; i++) {
          vec3 star = constellationPoints[i];
          vec2 delta = abs(p - star.xy);
          if (max(delta.x, delta.y) > .165) continue;
          float seed = float(i) * 2.39 + 2.61;
          vec2 tint = hash2(star.xy * 3.4);
          float pulse = starBurst(seed);
          float radius = max(mix(.012, .026, star.z), pixel * .57) * (1.0 + pulse * .20);
          float distanceToStar = length(delta);
          float core = gaussian(distanceToStar / radius);
          float halo = gaussian(distanceToStar / (radius * 2.9));
          vec3 light = mix(vec3(.72, .82, 1.0), vec3(1.0, .87, .71), tint.x);
          float strength = mix(.11, .58, star.z) + pulse * mix(.53, 1.0, star.z);
          color += light * strength * (core + (.15 + .22 * pulse) * halo);
          if (star.z > .82 && pulse > .30) {
            vec2 axis = normalize(vec2(1.0, tint.y - .52));
            vec2 glow = abs(vec2(dot(p - star.xy, axis), dot(p - star.xy, vec2(-axis.y, axis.x))));
            float rayWidth = max(.008, pixel * .51);
            float primary = gaussian(glow.y / rayWidth) * gaussian(glow.x / (.068 + .04 * pulse));
            float secondary = gaussian(glow.x / rayWidth) * gaussian(glow.y / (.046 + .03 * pulse));
            color += light * smoothstep(.30, 1.03, pulse) * (.35 * primary + .25 * secondary);
          }
        }
        return color;
      }

      vec3 stars(vec2 uv, float cells, float probability, float radius, float brightness) {
        vec2 p = uv * cells;
        vec2 id = floor(p);
        vec2 seed = hash2(id + 17.2);
        vec2 center = .22 + .56 * seed;
        float chance = hash2(id - 8.9).y;
        float distanceToStar = length(fract(p) - center);
        float antialias = clamp(max(fwidth(p.x), fwidth(p.y)) * .5, .018, .18);
        float size = radius * (.53 + .78 * seed.x);
        float point = 1.0 - smoothstep(size - antialias, size + antialias, distanceToStar);
        float intensity = point * step(chance, probability) * (.24 + .76 * seed.x * seed.x);
        vec3 color = mix(vec3(.67, .80, 1.0), vec3(1.0, .87, .72), seed.y * seed.y);
        return brightness * intensity * color;
      }

      vec3 galaxy(vec3 direction, vec2 plane, float altitude) {
        vec3 zenith = vec3(.012, .013, .018);
        vec3 horizon = vec3(.030, .030, .036);
        vec3 color = mix(horizon, zenith, smoothstep(.02, .78, altitude));

        // ESO's La Silla photographs show a long star field split by dark dust,
        // with a warmer, asymmetric bulge. Keep the band high over the message
        // walls so the roof-edge blend does not swallow its defining structure.
        vec3 galacticPole = normalize(vec3(.844, .534, .078));
        vec3 coreDirection = normalize(vec3(-.50, .72, .48));
        coreDirection = normalize(coreDirection - galacticPole * dot(coreDirection, galacticPole));
        vec3 alongGalaxy = normalize(cross(galacticPole, coreDirection));
        float latitude = dot(direction, galacticPole);
        float facingCore = dot(direction, coreDirection);
        float longitude = atan(dot(direction, alongGalaxy), facingCore);
        float core = gaussian((longitude + .13) / .43);
        float reach = smoothstep(-.20, .35, facingCore);
        float wander = .016 * sin(longitude * 5.1 + .8) +
          .027 * (noise(vec2(longitude * 9.0, 6.1)) - .5);
        float center = latitude + wander;
        float width = mix(.060, .113, core) *
          (.77 + .40 * noise(vec2(longitude * 7.0, -2.8)));
        float band = gaussian(center / width) * reach;
        float starField = 0.0;

        if (band > .0005) {
          // Even the halo/bulge must fade before leaving the expensive detail
          // branch; an abrupt threshold otherwise clips a triangular edge.
          float detailFade = smoothstep(.0005, .018, band);
          vec2 coordinates = vec2(longitude, latitude);
          float knots = clouds(coordinates * vec2(24.0, 41.0) + vec2(15.8, -7.3));
          float grains = noise(coordinates * vec2(115.0, 370.0) + 5.2);
          float dust = .64 * noise(coordinates * vec2(19.0, 53.0) + vec2(-5.1, 9.7)) +
            .36 * noise(coordinates * vec2(47.0, 103.0) + vec2(6.2, -3.1));
          float riftCenter = center + .010 * sin(longitude * 19.0) + .022 * (dust - .5);
          float coreWidth = mix(.014, .031, core) * (.51 + .94 * dust);
          // A broken central rift and a fork leave two irregular luminous banks,
          // rather than a blue cloud smeared across the whole opening.
          float rift = gaussian((riftCenter + .007) / coreWidth) *
            (.51 + .49 * smoothstep(.24, .67, knots));
          float fork = gaussian((center - .045 - .030 * sin(longitude * 6.4 + .5)) /
            (.008 + .016 * dust));
          fork *= (.20 + .80 * smoothstep(.27, .73, dust)) * gaussian((longitude - .03) / .86);
          float dustKnots = smoothstep(.49, .73, knots) * gaussian((center + .018) / .095);
          // Absorbing clouds retain faint foreground stars and scattered light.
          // Exponential transmission gives overlapping dust a continuous tonal
          // range, rather than clipping several clouds to the same black patch.
          float opticalDepth = rift * (.88 + .16 * grains) + fork * .47 + dustKnots * .43;
          float transmission = .18 + .82 * exp(-1.05 * opticalDepth);
          float clumps = .27 + 1.02 * smoothstep(.24, .79, knots);
          // The bulge leans toward one bank and swells in distinct broad knots.
          float broadBulge = gaussian((longitude + .23 + latitude * .7) / .34) *
            gaussian((center - .045) / .105) * (.54 + .46 * knots);
          float halo = gaussian(latitude / .19) * reach;
          vec3 stellarLight = mix(vec3(.25, .27, .30), vec3(.40, .35, .27), core * .84);
          color += detailFade * halo * vec3(.012, .013, .015);
          color += detailFade * (band * clumps + broadBulge * .49) * stellarLight * transmission;
          color += detailFade * band * (1.0 - transmission) *
            (.010 + .007 * grains) * vec3(.94, .92, .88);
          // Fine resolved stars give the bright lanes a granular appearance.
          starField = detailFade * band * (.24 + .76 * transmission) * (.44 + .56 * knots);
          color += stars(plane + vec2(.34, .17), 625.0, starField * .91, .038, .43) * starField;
          color += detailFade * band * transmission * (grains - .36) * vec3(.052, .050, .046);
        }
        color += stars(plane, 179.0, .16, .028, .40);
        color += stars(plane + vec2(-.69, .29), 67.0, .072, .051, .69);
        color += stars(plane + vec2(.71, -.29), 351.0, .12 + starField * .5, .030, .22);
        // Measure from the parapet in room space so the fade follows both
        // wall edges as the player moves, including in the keepsake camera.
        float roofDistance = (${parapet.height} - cameraPosition.y) / max(direction.y, .001);
        vec2 roofHit = cameraPosition.xz + direction.xz * roofDistance;
        float edgeDistance = min(roofHit.x - (${parapet.x}), ${parapet.z} - roofHit.y);
        return mix(rimColor, color, smoothstep(.0, 2.8, edgeDistance));
      }

      vec2 skyPlane(vec3 ray) {
        vec3 direction = normalize(ray);
        return direction.xz / (.55 + max(direction.y, .0));
      }

      vec3 meteor(vec2 plane) {
        if (meteorProgress < 0.0) return vec3(0.0);
        vec3 head = mix(meteorFrom, meteorTo, meteorProgress);
        vec3 tail = mix(meteorFrom, meteorTo, max(.0, meteorProgress - .17));
        vec2 a = skyPlane(tail - cameraPosition), b = skyPlane(head - cameraPosition);
        vec2 axis = b - a;
        float along = clamp(dot(plane - a, axis) / max(dot(axis, axis), .000001), .0, 1.0);
        float distance = length(plane - mix(a, b, along));
        float pixel = max(fwidth(plane.x), fwidth(plane.y));
        float width = max(.00065, pixel * .52);
        float streak = gaussian(distance / width) * pow(along, 1.65);
        float headLight = gaussian(length(plane - b) / (width * 1.7));
        float glow = gaussian(distance / (width * 3.0)) * pow(along, 2.3) * .14;
        float envelope = smoothstep(.0, .10, meteorProgress) *
          (1.0 - smoothstep(.91, 1.0, meteorProgress));
        // The sky is rendered at far depth. The actual wall depth masks this
        // streak, so its tip disappears behind the parapet instead of on it.
        return envelope * (vec3(.68, .76, .86) * (streak + glow) + vec3(.92, .94, 1.0) * headLight);
      }

      vec3 sunset(vec3 direction, vec2 plane, float altitude) {
        vec3 sunDirection = normalize(vec3(.91, .33, -.27));
        float sunAngle = clamp(dot(direction, sunDirection), 0.0, 1.0);
        float lowSky = 1.0 - smoothstep(.04, .89, altitude);
        float afterglow = pow(sunAngle, 4.5);
        vec3 horizon = mix(vec3(.73, .44, .54), vec3(.99, .62, .34), afterglow);
        vec3 color = mix(vec3(.24, .37, .61), horizon, lowSky);
        color += vec3(.19, .09, .035) * pow(sunAngle, 22.0);
        color = mix(color, vec3(1.0, .88, .62), smoothstep(.99970, .99984, sunAngle));

        vec2 p = mat2(.91, -.41, .41, .91) * plane;
        vec2 mist = p * vec2(2.25, 7.4) + vec2(8.5, -5.0);
        float wisps = smoothstep(.43, .83, clouds(mist)) * .54;
        color = mix(color, mix(vec3(.75, .60, .74), vec3(1.0, .73, .52), afterglow), wisps);

        vec2 shape = p * vec2(3.1, 5.3) + vec2(-2.4, 2.9);
        shape += .81 * (vec2(noise(shape * .48), noise(shape * .52 + 8.0)) - .5);
        float detail = noise(shape * 13.2 + 2.1) - .5;
        float density = clouds(shape) + .056 * detail;
        float cover = smoothstep(.39, .61, density);
        vec3 shadow = mix(vec3(.36, .34, .53), vec3(.58, .39, .52), afterglow);
        vec3 edge = mix(vec3(.82, .63, .72), vec3(1.0, .68, .47), .35 + .65 * afterglow);
        color = mix(color, mix(edge, shadow, smoothstep(.47, .72, density)), cover * .91);
        return color;
      }

      void main() {
        vec3 direction = normalize(skyDirection);
        float altitude = max(0.0, direction.y);
        // A tangent plane over the atrium gives both skies continuous detail at the zenith.
        vec2 plane = direction.xz / (.55 + altitude);
        vec3 color = night ? galaxy(direction, plane, altitude) + meteor(plane) : sunset(direction, plane, altitude);
        if (night && constellationVisible) color += constellation(direction);
        gl_FragColor = sRGBTransferEOTF(vec4(clamp(color, 0.0, 1.0), 1.0));
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(12, 32, 18), material);
  sky.name = 'Open atrium sky';
  sky.frustumCulled = false;
  // Fill the pixels remaining after opaque architecture, using the far plane.
  sky.renderOrder = 100;
  scene.add(sky);
  function resetMeteor() {
    previousSeconds = undefined;
    meteorProgress.value = -1;
    meteorStart = -1;
    nextMeteor = nightSeconds + interval();
  }
  function setNight(value) {
    const changed = night.value !== Boolean(value);
    night.value = Boolean(value);
    if (changed) resetMeteor();
  }
  function update(seconds, animate = true) {
    if (!Number.isFinite(seconds)) return;
    if (previousSeconds === undefined) { previousSeconds = seconds; return; }
    const delta = seconds - previousSeconds;
    previousSeconds = seconds;
    // Do not replay time spent in a background tab, paused render, or debugger.
    if (delta < 0 || delta > 1) { resetMeteor(); previousSeconds = seconds; return; }
    if (!night.value) return;
    nightSeconds += delta;
    constellationTime.value = animate ? nightSeconds : 0;
    if (nightSeconds >= nextMeteor) {
      meteorStart = nightSeconds;
      meteorCount++;
      nextMeteor = nightSeconds + interval();
      meteorFrom.value.set(-1 + Math.random() * 2.6, 22 + Math.random() * 2, 13.7);
      meteorTo.value.set(-9.35 - Math.random() * 1.25, 8.5 + Math.random() * .7, 9.6);
    }
    const progress = meteorStart < 0 ? -1 : nightSeconds - meteorStart;
    meteorProgress.value = progress >= 0 && progress < 1 ? progress : -1;
  }
  return { setNight, update, setConstellation(value) { constellationVisible.value = Boolean(value); }, get state() {
    return { visible: sky.visible, night: night.value, meteor: {
      active: meteorProgress.value >= 0,
      progress: meteorProgress.value,
      nextIn: Math.max(0, nextMeteor - nightSeconds),
      count: meteorCount,
      from: meteorFrom.value.toArray(), to: meteorTo.value.toArray(),
    } };
  } };
}
