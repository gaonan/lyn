export const CONCERT_STAGE = Object.freeze({
  x: 0, z: 1, y: .26, radius: 1.95, runwayHalfWidth: .76, runwayBack: -3.42,
  mainHalfWidth: 5.25, mainFront: -3.78, mainBack: -5.94,
});

export function buildConcertPlatform(T, scene) {
  const { x, z, y, radius, runwayHalfWidth, runwayBack,
    mainHalfWidth, mainFront, mainBack } = CONCERT_STAGE;
  const group = new T.Group();
  group.name = 'Main stage, runway and round satellite stage';
  scene.add(group);

  const opening = Math.acos(runwayHalfWidth / radius);
  const joinZ = z - radius * Math.sin(opening);
  const chamfer = .30;
  const rightWing = [[mainHalfWidth - chamfer, mainBack],
    [mainHalfWidth, mainBack + chamfer], [mainHalfWidth, mainFront - chamfer],
    [mainHalfWidth - chamfer, mainFront], [runwayHalfWidth, runwayBack]];
  const outline = rightWing.map(([width, pz]) => [x + width, pz]);
  for (let i = 0; i <= 104; i++) {
    const angle = -opening + (Math.PI + opening * 2) * (i / 104);
    outline.push([x + Math.cos(angle) * radius, z + Math.sin(angle) * radius]);
  }
  outline.push(...rightWing.slice().reverse().map(([width, pz]) => [x - width, pz]));

  const shape = new T.Shape(outline.map(([px, pz]) => new T.Vector2(px, -pz)));
  const top = new T.ShapeGeometry(shape);
  top.rotateX(-Math.PI / 2);
  top.translate(0, y, 0);
  function mesh(geometry, material) {
    const object = new T.Mesh(geometry, material);
    group.add(object);
    return object;
  }
  const deckMaterial = new T.MeshStandardMaterial({
    color: '#242b36', metalness: .13, roughness: .82,
    emissive: '#1b222b', emissiveIntensity: .40,
  });
  mesh(top, deckMaterial);

  // Miter each corner so the trim meets continuously on the round nose and runway.
  const offsets = outline.map(([px, pz], i) => {
    const prev = outline[(i + outline.length - 1) % outline.length];
    const next = outline[(i + 1) % outline.length];
    const a = new T.Vector2(pz - prev[1], prev[0] - px).normalize();
    const b = new T.Vector2(next[1] - pz, px - next[0]).normalize();
    const normal = a.clone().add(b).normalize();
    return normal.multiplyScalar(Math.min(2.2, 1 / Math.max(.25, normal.dot(a))));
  });
  const strip = (lowY, highY, lowOffset = 0, highOffset = 0) => {
    const count = outline.length;
    const positions = [], uv = [], faces = [];
    let distance = 0;
    for (let i = 0; i <= count; i++) {
      const [px, pz] = outline[i % count];
      const n = offsets[i % count];
      if (i > 0) distance += Math.hypot(px - outline[i - 1][0], pz - outline[i - 1][1]);
      positions.push(px + n.x * lowOffset, lowY, pz + n.y * lowOffset,
        px + n.x * highOffset, highY, pz + n.y * highOffset);
      uv.push(distance, 0, distance, 1);
      if (i < count) {
        const j = i * 2;
        faces.push(j, j + 1, j + 3, j, j + 3, j + 2);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    return geometry;
  };
  mesh(strip(.006, .058, .025, .007), new T.MeshStandardMaterial({ color: '#090d15', roughness: .86 }));
  mesh(strip(.058, y - .045), new T.MeshStandardMaterial({ color: '#151b25', metalness: .36, roughness: .68 }));
  mesh(strip(y - .045, y, .001, 0), new T.MeshStandardMaterial({
    color: '#404b58', metalness: .48, roughness: .59,
  }));

  const timeUniform = { value: 0 };
  const glowColor = { value: new T.Color('#cad9ef') };
  const deckLight = { value: 1 };
  const rim = new T.ShaderMaterial({
    uniforms: { time: timeUniform, tint: glowColor, deckLight },
    vertexShader: /* glsl */`
      varying vec2 edgeUV;
      void main() {
        edgeUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 edgeUV;
      uniform float time, deckLight;
      uniform vec3 tint;
      void main() {
        float chase = .94 + .06 * sin(edgeUV.x * 1.14 - time * 1.6);
        float diode = .85 + .15 * smoothstep(.08, .65, cos(edgeUV.x * 116.0));
        vec3 led = mix(tint, vec3(.86, .91, 1.0), .68) * chase * diode;
        gl_FragColor = vec4(led * deckLight, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: T.DoubleSide, toneMapped: false,
  });
  mesh(strip(y - .053, y - .026, .004, .004), rim);
  mesh(strip(y + .0015, y + .0015, -.028, .003), rim);

  const spill = new T.ShaderMaterial({
    uniforms: { time: timeUniform, tint: glowColor, deckLight },
    vertexShader: rim.vertexShader,
    fragmentShader: /* glsl */`
      varying vec2 edgeUV;
      uniform float time, deckLight;
      uniform vec3 tint;
      void main() {
        float fade = exp(-6.4 * edgeUV.y) * (1.0 - smoothstep(.5, 1.0, edgeUV.y));
        float chase = .94 + .06 * sin(edgeUV.x * 1.14 - time * 1.6);
        gl_FragColor = vec4(tint, deckLight * .08 * fade * chase);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    toneMapped: false,
  });
  mesh(strip(.014, .014, .015, .33), spill).renderOrder = 1;

  // A soft pool is painted over the deck so its shape is legible even when the
  // room lights are almost off. The muted grain evokes a satin stage finish.
  const wash = new T.ShaderMaterial({
    uniforms: { tint: glowColor, deckLight },
    vertexShader: /* glsl */`
      varying vec2 deck;
      void main() {
        deck = position.xz;
        vec3 lifted = position + vec3(0.0, .001, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(lifted, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 deck;
      uniform vec3 tint;
      uniform float deckLight;
      void main() {
        vec2 acrossDeck = (deck - vec2(0.0, -.93)) * vec2(.54, .25);
        float pool = exp(-dot(acrossDeck, acrossDeck));
        float brushed = .95 + .05 * sin(deck.y * 150.0 + deck.x * .7);
        float seams = smoothstep(.006, .019, abs(fract((deck.y + .27) / 1.12) - .5));
        gl_FragColor = vec4(tint, deckLight * .105 * pool * brushed * mix(.78, 1.0, seams));
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
  });
  mesh(top, wash).renderOrder = 1;

  // Navigation prioritizes ramp-type supports over the underlying room floor.
  // Use inset strips to avoid standing on the air outside the rounded edge.
  const support = (minX, maxX, minZ, maxZ) => ({
    minX, maxX, minZ, maxZ, zStart: minZ, zEnd: maxZ, yStart: y, yEnd: y,
  });
  const surfaces = [support(x - runwayHalfWidth, x + runwayHalfWidth, runwayBack, joinZ + .04)];
  for (let i = 1; i < rightWing.length; i++) {
    const [startWidth, startZ] = rightWing[i - 1];
    const [endWidth, endZ] = rightWing[i];
    const slices = Math.max(1, Math.ceil(Math.abs(endWidth - startWidth) / .075));
    for (let slice = 0; slice < slices; slice++) {
      const from = slice / slices, to = (slice + 1) / slices;
      const width = Math.min(T.MathUtils.lerp(startWidth, endWidth, from), T.MathUtils.lerp(startWidth, endWidth, to));
      surfaces.push(support(x - width, x + width,
        T.MathUtils.lerp(startZ, endZ, from), T.MathUtils.lerp(startZ, endZ, to)));
    }
  }
  const strips = 32;
  for (let i = 0; i < strips; i++) {
    const from = z - radius + i * 2 * radius / strips;
    const to = z - radius + (i + 1) * 2 * radius / strips;
    const across = Math.sqrt(Math.max(0, radius * radius - Math.max(Math.abs(from - z), Math.abs(to - z)) ** 2));
    if (across > .01) surfaces.push(support(x - across, x + across, from, to));
  }
  return {
    group,
    surfaces,
    // The runway and the rear wings remain walkable right up to the circle.
    barrier: { x, z, radius, minY: 0, maxY: Infinity },
    setStageLight(level) {
      deckLight.value = level;
      deckMaterial.emissiveIntensity = .40 * level;
    },
    update(time, motion = true) {
      timeUniform.value = motion ? time : 0;
    },
  };
}
