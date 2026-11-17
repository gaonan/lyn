export function createStageMist(T, scene) {
  const geometry = new T.InstancedBufferGeometry().copy(new T.PlaneGeometry());
  const count = 38;
  let seed = 9573;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const drift = Float32Array.from({ length: count * 4 }, random);
  geometry.setAttribute('drift', new T.InstancedBufferAttribute(drift, 4));
  geometry.instanceCount = count;

  const time = { value: 0 };
  const level = { value: 0 };
  const material = new T.ShaderMaterial({
    uniforms: { time, level },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute vec4 drift;
      uniform float time;
      varying vec2 puffUV;
      varying float age, seed, height, tint;

      void main() {
        seed = drift.w * 39.0;
        age = fract(drift.x + time * mix(.021, .042, drift.z));
        float x = mix(-4.6, 4.6, age);
        float z = mix(-3.20, 2.25, drift.y) + .32 * sin(age * 7.0 + seed);
        float y = .10 + .15 * drift.w + .045 * sin(age * 9.0 + seed);
        vec3 center = vec3(x, y, z);
        vec2 size = vec2(mix(1.4, 3.0, drift.z), mix(.26, .48, drift.y)) * (.82 + age * .46);
        vec2 offset = position.xy * size;
        vec4 view = viewMatrix * vec4(center, 1.0);
        view.xy += offset;
        height = y + dot(vec2(viewMatrix[1][0], viewMatrix[1][1]), offset);
        tint = 1.0 - smoothstep(.5, 4.1, abs(x));
        puffUV = uv;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform float time, level;
      varying vec2 puffUV;
      varying float age, seed, height, tint;

      float hash(vec2 p) {
        vec3 h = fract(vec3(p.xyx) * .1031);
        h += dot(h, h.yzx + 33.33);
        return fract((h.x + h.y) * h.z);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        vec2 w = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), w.x),
                   mix(hash(cell + vec2(0, 1)), hash(cell + 1.0), w.x), w.y);
      }
      void main() {
        vec2 p = puffUV * vec2(4.8, 3.3);
        p.x += seed - time * .21;
        p.y += .53 * sin(p.x * .94 + time * .57);
        float density = .64 * noise(p) + .25 * noise(p * 2.0 + 3.1) + .11 * noise(p * 4.0);
        float edge = 1.0 - smoothstep(.15, .99, length(puffUV * 2.0 - 1.0));
        float lifetime = smoothstep(0.0, .17, age) * (1.0 - smoothstep(.78, 1.0, age));
        float ground = smoothstep(.018, .11, height) * (1.0 - smoothstep(.27, .45, height));
        float alpha = level * smoothstep(.24, .75, density) * edge * lifetime * ground;
        vec3 color = mix(vec3(.34, .47, .70), vec3(.65, .74, .88), tint);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Stage dry ice';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    setVisible(value, night) {
      mesh.visible = value;
      level.value = night ? .71 : .51;
    },
    update(seconds) {
      if (mesh.visible) time.value = reducedMotion.matches ? 2 : seconds % 2400;
    },
  };
}
