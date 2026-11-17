// Each bank is a short volume made of soft, ground-aligned slices. The width
// is expressed in metres so its silhouette is stable as the player turns.
const banks = [
  { start: [-2.35, -2.32], end: [-1.06, .96], width: 1.04, height: .42, bend: -.49, phase: .21 },
  { start: [2.19, -2.31], end: [1.00, 1.04], width: .96, height: .39, bend: .43, phase: .57 },
  { start: [-1.77, -2.22], end: [1.51, -1.78], width: .85, height: .25, bend: .17, phase: .83 },
];
const slices = [[.14, .20], [.33, .34], [.57, .44], [.82, .35]];

export function createStageMist(T, scene, [lightX, , lightZ]) {
  const geometry = new T.InstancedBufferGeometry().copy(new T.PlaneGeometry(1, 1, 20, 2));
  const paths = [], shapes = [], layers = [];
  for (const bank of banks) {
    for (const [height, weight] of slices) {
      paths.push(...bank.start, ...bank.end);
      shapes.push(bank.width, bank.height, bank.bend, bank.phase);
      layers.push(height, weight);
    }
  }
  geometry.setAttribute('mistPath', new T.InstancedBufferAttribute(new Float32Array(paths), 4));
  geometry.setAttribute('mistShape', new T.InstancedBufferAttribute(new Float32Array(shapes), 4));
  geometry.setAttribute('mistLayer', new T.InstancedBufferAttribute(new Float32Array(layers), 2));
  geometry.instanceCount = banks.length * slices.length;
  geometry.boundingSphere = new T.Sphere(new T.Vector3(0, .16, -.75), 4.1);

  // Hardware-interpolated volume noise weighs 4 KiB and is generated locally.
  // Neighbouring slices sample the same field, so their curls move together.
  let seed = 9573;
  const size = 16;
  const data = Uint8Array.from({ length: size ** 3 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  });
  const field = new T.Data3DTexture(data, size, size, size);
  field.format = T.RedFormat;
  field.minFilter = field.magFilter = T.LinearFilter;
  field.wrapS = field.wrapT = field.wrapR = T.RepeatWrapping;
  field.needsUpdate = true;

  const time = { value: 0 };
  const level = { value: 0 };
  const material = new T.ShaderMaterial({
    uniforms: { time, level, mistField: { value: field }, poolCenter: { value: new T.Vector2(lightX, lightZ) } },
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    vertexShader: `
      attribute vec4 mistPath, mistShape;
      attribute vec2 mistLayer;
      uniform float time;
      varying vec2 flowUV, layer;
      varying float phase;
      varying vec3 mistPosition;

      void main() {
        float u = uv.x, v = uv.y * 2.0 - 1.0;
        phase = mistShape.w;
        layer = mistLayer;
        flowUV = uv;
        vec2 forward = normalize(mistPath.zw - mistPath.xy);
        vec2 lateral = vec2(-forward.y, forward.x);
        float rise = sin(3.141593 * u);
        float swirl = sin(9.0 * u - time * .85 + 6.283185 * phase);
        float center = rise * (mistShape.z + .10 * swirl * layer.x);
        float width = mistShape.x * mix(.48, 1.0, u) * (1.0 - .28 * layer.x);
        vec2 xz = mix(mistPath.xy, mistPath.zw, u) + lateral * (center + .5 * width * v);
        float arch = (1.0 - .70 * v * v) * (.58 + .42 * rise);
        float height = .024 + mistShape.y * layer.x * arch * (1.0 + .23 * swirl);
        mistPosition = vec3(xz.x, height, xz.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(mistPosition, 1.0);
      }`,
    fragmentShader: `
      uniform highp sampler3D mistField;
      uniform float time, level;
      uniform vec2 poolCenter;
      varying vec2 flowUV, layer;
      varying float phase;
      varying vec3 mistPosition;

      void main() {
        float u = flowUV.x;
        float v = flowUV.y;
        float lateral = abs(v * 2.0 - 1.0);
        float footprint = (1.0 - smoothstep(.28, 1.0, lateral)) *
          smoothstep(0.0, .17, u) * (1.0 - smoothstep(.67, 1.0, u));

        float warp = .047 * sin(10.0 * u - time * .82 + phase * 6.283185);
        vec3 flow = vec3(.36 * u - .044 * time + phase,
          v * .19 + warp + phase, layer.x * .11 + phase);
        float body = texture(mistField, flow).r;
        float curls = texture(mistField, flow * 2.23 + vec3(.27, .06, .2)).r;
        float density = smoothstep(.28, .69, body * .71 + curls * .29);
        // The ground remains visible between the banks and through their soft edges.
        float pool = 1.0 - smoothstep(.36, 1.75, length(mistPosition.xz - poolCenter));
        float alpha = level * layer.y * footprint * density * mix(.12, 1.0, pool);
        float edgeLight = smoothstep(0.0, .26, mistPosition.y);
        float sideLight = 1.0 - smoothstep(.5, 3.1, abs(mistPosition.x + .45));
        vec3 silver = mix(vec3(.29, .37, .49), vec3(.61, .69, .78), .66 * edgeLight + .34 * sideLight);
        gl_FragColor = vec4(silver, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Stage dry ice';
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    setVisible(value, night) {
      mesh.visible = value;
      level.value = night ? .96 : .74;
    },
    update(seconds) {
      if (mesh.visible) time.value = reducedMotion.matches ? 2 : seconds;
    },
  };
}
