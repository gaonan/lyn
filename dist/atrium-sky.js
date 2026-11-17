export function createAtriumSky(T, scene) {
  const night = { value: true };
  const material = new T.ShaderMaterial({
    uniforms: { night },
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
        vec3 zenith = vec3(.025, .042, .097);
        vec3 horizon = vec3(.073, .096, .16);
        vec3 color = mix(horizon, zenith, smoothstep(.02, .78, altitude));

        vec3 galacticPole = normalize(vec3(.37, -.57, -.72));
        float latitude = dot(direction, galacticPole);
        vec2 dustSpace = plane * vec2(7.1, 8.6) + vec2(2.2, -4.4);
        float drift = noise(plane * 3.1 + 5.7) - .5;
        float band = gaussian((latitude + .052 * drift) / .18);
        float outerGlow = gaussian(latitude / .35);
        float gas = clouds(dustSpace);
        float lane = gaussian((latitude + .13 * (gas - .47)) / .041);
        float dust = smoothstep(.28, .64, gas) * (1.0 - .86 * lane);
        vec3 starlight = mix(vec3(.18, .25, .44), vec3(.53, .43, .53), smoothstep(.40, .74, gas));
        color += outerGlow * vec3(.026, .033, .067) + band * dust * starlight;
        color += stars(plane, 149.0, .24 + .42 * band, .052, .47);
        color += stars(plane + vec2(-.69, .29), 59.0, .18, .087, .82);
        return color;
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
        vec3 color = night ? galaxy(direction, plane, altitude) : sunset(direction, plane, altitude);
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
  return { setNight: value => { night.value = value; } };
}
