export const PROBE_SIZE = [24, 18, 22];
export const PROBE_MIN = [-9, 0, -7];
export const PROBE_SPAN = [18, 10.2, 16];
export const PROBE_IRRADIANCE_RANGE = 2;

// Bake order is day, night. RGB encodes square-root irradiance for precision
// in the shadows, and alpha holds near-field visibility.
export function createAtriumProbes(T, version) {
  const fallback = texture(new Uint8Array([0, 0, 0, 255]), [1, 1, 1]);
  const map = { value: fallback };
  const ready = { value: 0 };
  const intensity = { value: .56 };
  let night = true;
  let maps;

  function texture(data, [width, height, depth]) {
    const result = new T.Data3DTexture(data, width, height, depth);
    result.minFilter = result.magFilter = T.LinearFilter;
    result.needsUpdate = true;
    return result;
  }

  function setNight(value) {
    night = value;
    intensity.value = night ? .56 : .88;
    if (maps) map.value = maps[Number(night)];
  }

  const loaded = fetch(new URL(`./assets/lighting/atrium-probes.bin?v=${version}`, import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Light probe download failed');
      return response.arrayBuffer();
    }).then(buffer => {
      const bytes = PROBE_SIZE.reduce((total, size) => total * size, 4);
      if (buffer.byteLength !== bytes * 2) throw new Error('Invalid atrium light probe data');
      maps = [0, bytes].map(offset => texture(new Uint8Array(buffer, offset, bytes), PROBE_SIZE));
      setNight(night);
      ready.value = 1;
      return true;
    }).catch(() => false);

  function apply(scene) {
    const materials = new Set();
    scene.traverse(object => {
      if (object.material?.isMeshStandardMaterial) materials.add(object.material);
    });
    for (const material of materials) {
      const varyInstanceUv = material.userData.varyInstanceUv === true;
      const compile = material.onBeforeCompile;
      const finishKey = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        shader.uniforms.atriumLightMap = map;
        shader.uniforms.atriumLightReady = ready;
        shader.uniforms.atriumLightIntensity = intensity;
        shader.uniforms.atriumLightMin = { value: new T.Vector3(...PROBE_MIN) };
        shader.uniforms.atriumLightSpan = { value: new T.Vector3(...PROBE_SPAN) };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 atriumWorldPosition;')
          .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
            vec4 atriumPosition = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              atriumPosition = instanceMatrix * atriumPosition;
            #endif
            atriumWorldPosition = (modelMatrix * atriumPosition).xyz;`);
        if (varyInstanceUv) {
          shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
            #ifdef USE_INSTANCING
              vec3 piece = instanceMatrix[3].xyz;
              vec2 grainOffset = fract(sin(vec2(dot(piece, vec3(15.31, 49.3, 31.7)),
                dot(piece, vec3(37.11, 19.9, 23.5)))) * 10303.237);
              #ifdef USE_MAP
                vMapUv += grainOffset;
              #endif
              #ifdef USE_NORMALMAP
                vNormalMapUv += grainOffset;
              #endif
              #ifdef USE_ROUGHNESSMAP
                vRoughnessMapUv += grainOffset;
              #endif
            #endif`);
        }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 atriumWorldPosition;
            uniform highp sampler3D atriumLightMap;
            uniform vec3 atriumLightMin, atriumLightSpan;
            uniform float atriumLightReady, atriumLightIntensity;`)
          .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
            vec3 probeOffset = inverseTransformDirection(nonPerturbedNormal, viewMatrix) * .22;
            vec3 probeUV = (atriumWorldPosition + probeOffset - atriumLightMin) / atriumLightSpan;
            vec4 bakedLight = texture(atriumLightMap, probeUV);
            float visibility = mix(1.0, mix(.48, 1.0, bakedLight.a), atriumLightReady);
            irradiance *= visibility;
            iblIrradiance *= visibility;
            irradiance += bakedLight.rgb * bakedLight.rgb * ${PROBE_IRRADIANCE_RANGE.toFixed(1)} *
              atriumLightReady * atriumLightIntensity;`);
      };
      material.customProgramCacheKey = () => `${finishKey}/atrium-baked-probes-v1/${varyInstanceUv}`;
      material.needsUpdate = true;
    }
  }

  return { apply, setNight, loaded };
}
