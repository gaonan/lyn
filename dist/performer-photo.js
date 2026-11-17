export const PHOTO_VIEWS = ['front', 'right', 'back', 'left'];
const DEFAULT_HEIGHT = 1.92, QUARTER = Math.PI / 2;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const wrapped = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/** +Z front, +X right, -Z back, -X left. Hysteresis is measured in radians. */
export function photographicViewIndex(angle, current = null, hysteresis = 7 * Math.PI / 180) {
  if (!Number.isFinite(angle)) return current ?? 0;
  if (current !== null && Math.abs(wrapped(angle - current * QUARTER)) <= Math.PI / 4 + hysteresis) return current;
  return ((Math.round(wrapped(angle) / QUARTER) % 4) + 4) % 4;
}

/** UV rectangles are normalized, measured from the source image's top left. */
export function photographicFrame(width, height, config = {}, displayHeight = DEFAULT_HEIGHT) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Photo has no decoded image dimensions');
  if ((config.width !== undefined && config.width !== width) || (config.height !== undefined && config.height !== height)) throw new Error('Photo dimensions do not match the declared source dimensions');
  const uv = { x: 0, y: 0, width: 1, height: 1, ...config.uv }, anchorX = config.anchorX ?? .5;
  if (![uv.x, uv.y, uv.width, uv.height, anchorX].every(Number.isFinite) || uv.x < 0 || uv.y < 0 || uv.width <= 0 || uv.height <= 0 || uv.x + uv.width > 1 + 1e-8 || uv.y + uv.height > 1 + 1e-8 || anchorX < 0 || anchorX > 1) throw new Error('Photo crop or foot anchor is invalid');
  const widthScale = config.widthScale ?? 1;
  if (!Number.isFinite(widthScale) || widthScale <= 0) throw new Error('Photo width scale is invalid');
  const displayWidth = widthScale * displayHeight * width * uv.width / (height * uv.height);
  return { width, height, uv, anchorX, displayWidth, left: -anchorX * displayWidth, right: (1 - anchorX) * displayWidth };
}

function versioned(url, version) {
  if (!version) return url;
  const [path, fragment] = url.split('#'), value = encodeURIComponent(version);
  const result = /[?&]v=/.test(path) ? path.replace(/([?&])v=[^&]*/, `$1v=${value}`) : `${path}${path.includes('?') ? '&' : '?'}v=${value}`;
  return result + (fragment ? `#${fragment}` : '');
}

const PHOTO_UNIFORMS = `
uniform sampler2D photoFromMap;
uniform sampler2D photoToMap;
uniform vec4 photoFromRect;
uniform vec4 photoToRect;
uniform vec2 photoFromFit;
uniform vec2 photoToFit;
uniform vec2 photoFromSize;
uniform vec2 photoToSize;
uniform float photoFromLight, photoToLight, photoBlend;
// Nearest source taps are premultiplied BEFORE bilinear interpolation. Hidden
// RGB in transparent pixels cannot create a black/white fringe at the edge.
vec4 photoTap(sampler2D photoMap, vec2 uv) {
  vec4 c = texture2D(photoMap, uv);
  return vec4(c.rgb * c.a, c.a);
}
vec4 photoSample(sampler2D photoMap, vec4 rect, vec2 fit, vec2 size) {
  vec2 localUV = vec2(vMapUv.x * fit.x + fit.y, vMapUv.y);
  if (localUV.x < 0.0 || localUV.x > 1.0 || localUV.y < 0.0 || localUV.y > 1.0) return vec4(0.0);
  vec2 p = (rect.xy + localUV * rect.zw) * size - 0.5;
  vec2 cell = floor(p), f = fract(p);
  vec2 a = (cell + 0.5) / size, stepUV = 1.0 / size;
  vec4 low = mix(photoTap(photoMap, a), photoTap(photoMap, a + vec2(stepUV.x, 0.0)), f.x);
  vec4 high = mix(photoTap(photoMap, a + vec2(0.0, stepUV.y)), photoTap(photoMap, a + stepUV), f.x);
  return mix(low, high, f.y);
}
`;
const PHOTO_FRAGMENT = `
vec4 photoColor = photoSample(photoFromMap, photoFromRect, photoFromFit, photoFromSize);
photoColor.rgb *= photoFromLight;
if (photoBlend > 0.0) {
  vec4 nextPhoto = photoSample(photoToMap, photoToRect, photoToFit, photoToSize);
  nextPhoto.rgb *= photoToLight;
  photoColor = mix(photoColor, nextPhoto, photoBlend);
}
diffuseColor *= vec4(photoColor.a > 0.00001 ? photoColor.rgb / photoColor.a : vec3(0.0), photoColor.a);
`;

/** Transparent photos on one ground-anchored cylindrical billboard. */
export function buildPhotographicPerformer(T, scene, options = {}) {
  const baseHeight = options.height ?? DEFAULT_HEIGHT;
  const lowerBodyExtension = options.lowerBodyExtension ?? 0;
  const height = baseHeight + lowerBodyExtension;
  const root = new T.Group(); root.name = options.name || 'Photographic multi-view performer'; root.position.set(...(options.position || [0, 0, -1])); scene.add(root);
  const facing = new T.Group(); facing.name = 'Camera-facing photo'; root.add(facing);
  const state = root.userData;
  Object.assign(state, { technology: 'multi-view photographic 2.5D', textureStatus: 'loading', height, reference: options.reference || 'Image 8 standing singing pose', progress: 0, loadedViews: 0, currentView: 'front', night: false, textures: [], frames: {} });
  const loader = options.loader || new T.TextureLoader(), entries = new Array(4), trackedTextures = new Set(), disposedTextures = new Set();
  const fadeSeconds = clamp(options.fadeSeconds ?? .18, .05, .5), hysteresis = clamp(options.hysteresisDegrees ?? 7, 0, 20) * Math.PI / 180;
  const nightTint = options.nightTint || [.68, .72, .78];
  const dayTint = options.dayTint || [1, 1, 1];
  let mesh, material, uniforms, commonLeft = 0, commonWidth = 0, settled = false, success = false, selected = 0, from = 0, transition = null, initialized = false, night = false;
  const cameraPoint = new T.Vector3(), actorPoint = new T.Vector3(), actorQuaternion = new T.Quaternion(), actorEuler = new T.Euler(0, 0, 0, 'YXZ');
  function notify(name, value) { try { options[name]?.(value); } catch (error) { console.warn(`Photo performer ${name} callback failed`, error); } }
  function disposeTexture(texture) { if (texture?.dispose && !disposedTextures.has(texture)) { texture.dispose(); disposedTextures.add(texture); } }
  function setNight(value) {
    night = Boolean(value); state.night = night;
    if (material) material.color.setRGB(...(night ? nightTint : dayTint));
  }
  function setSample(prefix, index) {
    const view = entries[index], f = view.frame;
    uniforms[`photo${prefix}Map`].value = view.texture;
    uniforms[`photo${prefix}Rect`].value.set(f.uv.x, 1 - f.uv.y - f.uv.height, f.uv.width, f.uv.height);
    const scale = commonWidth / f.displayWidth;
    const offset = commonLeft / f.displayWidth + f.anchorX;
    uniforms[`photo${prefix}Fit`].value.set(view.mirror ? -scale : scale, view.mirror ? 1 - offset : offset);
    uniforms[`photo${prefix}Size`].value.set(f.width, f.height);
    uniforms[`photo${prefix}Light`].value = options.viewLight?.[view.name] ?? 1;
  }
  function samples(a, b, blend) { setSample('From', a); setSample('To', b); uniforms.photoBlend.value = blend; state.fromView = PHOTO_VIEWS[a]; state.currentView = PHOTO_VIEWS[b]; state.blend = blend; }
  function build() {
    // Reserve the other angles' geometry before their textures arrive.
    const frames = PHOTO_VIEWS.map((name, index) => {
      if (entries[index]) return entries[index].frame;
      const config = options.views[name];
      return photographicFrame(config.width, config.height, config, baseHeight);
    });
    commonLeft = Math.min(...frames.map(frame => frame.left));
    commonWidth = Math.max(...frames.map(frame => frame.right)) - commonLeft;
    const geometry = new T.PlaneGeometry(commonWidth, height, 1, lowerBodyExtension ? 2 : 1);
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      const sourceY = uv.getY(i);
      // The middle row follows the trouser waist. Keep the texel scale above it.
      const y = sourceY === .5 ? .58 : sourceY;
      uv.setY(i, y);
      positions.setXYZ(i, positions.getX(i) + commonLeft + commonWidth / 2,
        y * baseHeight + (y > 0 ? lowerBodyExtension : 0), 0);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    material = new T.MeshBasicMaterial({ map: entries[0].texture, color: 0xffffff, transparent: true, alphaTest: .025, depthTest: true, depthWrite: true, premultipliedAlpha: true, toneMapped: false, side: T.FrontSide });
    uniforms = {
      photoFromMap: { value: null }, photoToMap: { value: null },
      photoFromRect: { value: new T.Vector4() }, photoToRect: { value: new T.Vector4() },
      photoFromFit: { value: new T.Vector2() }, photoToFit: { value: new T.Vector2() },
      photoFromSize: { value: new T.Vector2() }, photoToSize: { value: new T.Vector2() },
      photoFromLight: { value: 1 }, photoToLight: { value: 1 }, photoBlend: { value: 0 },
    };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${PHOTO_UNIFORMS}`).replace('#include <map_fragment>', PHOTO_FRAGMENT);
    };
    material.customProgramCacheKey = () => 'photographic-performer-premultiplied-v1';
    mesh = new T.Mesh(geometry, material); mesh.name = 'Photographic performer surface'; mesh.castShadow = false; mesh.receiveShadow = false; facing.add(mesh);
    samples(0, 0, 0); setNight(night);
    Object.assign(state, { triangles: geometry.index.count / 3, material: 'MeshBasicMaterial', commonLeft, commonWidth, lowerBodyExtension });
  }
  const ready = new Promise(resolve => {
    function fail(name, reason) {
      if (settled) return; settled = true;
      const error = new Error(`Photo ${name} failed: ${reason?.message || reason || 'unknown loading error'}`);
      Object.assign(state, { textureStatus: 'error', error: error.message });
      for (const texture of trackedTextures) disposeTexture(texture);
      if (mesh) { facing.remove(mesh); mesh.geometry.dispose(); material.dispose(); mesh = null; }
      console.error('Photographic performer failed to load', error); resolve(false); notify('onError', error);
    }
    PHOTO_VIEWS.forEach((name, index) => {
      if (settled) return;
      const config = options.views?.[name] || {}, url = versioned(config.url || `./assets/performer/photo-${name}.webp`, options.version);
      const deferredLoader = index > 0 && options.deferredLoader;
      function failed(reason) {
        if (deferredLoader) console.warn(`Photo angle ${name} is unavailable`, reason);
        else fail(name, reason);
      }
      try {
        const requested = (deferredLoader || loader).load(url, texture => {
          if (settled && !success) { disposeTexture(texture); return; }
          if (entries[index]) return;
          try {
            trackedTextures.add(texture);
            if (!texture?.isTexture) throw new Error('Loader did not return a texture');
            const image = texture.image, width = image?.naturalWidth || image?.width, height = image?.naturalHeight || image?.height;
            const frame = photographicFrame(width, height, config, baseHeight);
            texture.colorSpace = T.SRGBColorSpace; texture.flipY = true; texture.premultiplyAlpha = false;
            // Filtering is performed in premultiplied linear color by our shader.
            texture.minFilter = T.NearestFilter; texture.magFilter = T.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
            entries[index] = { name, url, frame, texture, mirror: config.mirror }; state.loadedViews++;
            state.textures[index] = [width, height];
            state.frames[name] = { ...frame, url };
            state.progress = state.loadedViews / 4;
            if (!settled && (state.loadedViews === 4 || (index === 0 && options.deferredLoader))) {
              build(); success = true; settled = true; resolve(true);
            }
            if (success) state.textureStatus = state.loadedViews === 4 ? 'loaded' : 'partial';
            notify('onProgress', state.progress);
          } catch (error) {
            if (deferredLoader) disposeTexture(texture);
            failed(error);
          }
        }, undefined, failed);
        if (requested?.isTexture) { trackedTextures.add(requested); if (settled && !success) disposeTexture(requested); }
      } catch (error) { failed(error); }
    });
  });

  function update(time, camera = options.camera, snap = false) {
    if (!success || !mesh) return false;
    const t = Number.isFinite(time) ? time : 0;
    let viewReady = true;
    if (camera?.getWorldPosition) {
      camera.getWorldPosition(cameraPoint); root.getWorldPosition(actorPoint); root.getWorldQuaternion(actorQuaternion); actorEuler.setFromQuaternion(actorQuaternion, 'YXZ');
      const dx = cameraPoint.x - actorPoint.x, dz = cameraPoint.z - actorPoint.z;
      if (dx * dx + dz * dz > 1e-10) {
        const angle = wrapped(Math.atan2(dx, dz) - actorEuler.y);
        if (!initialized) {
          const initial = photographicViewIndex(angle);
          selected = entries[initial] ? initial : 0;
          from = selected; initialized = true; samples(selected, selected, 0);
        }
        const direction = snap ? photographicViewIndex(angle) : photographicViewIndex(angle, selected, hysteresis);
        viewReady = Boolean(entries[direction]);
        const desired = entries[direction] ? direction : 0;
        if (options.fixedViewPlanes) {
          // Each photo represents a fixed orientation of the same seated body.
          facing.rotation.y = desired * QUARTER;
          if (desired !== selected) {
            selected = desired;
            samples(selected, selected, 0);
          }
        } else if (snap) {
          facing.rotation.y = angle;
          transition = null;
          selected = from = desired;
          samples(desired, desired, 0);
        } else {
          facing.rotation.y = angle;
          if (transition) {
            const f = clamp((t - transition.start) / fadeSeconds, 0, 1);
            samples(from, selected, f * f * (3 - 2 * f));
            if (f >= 1) { transition = null; from = selected; samples(selected, selected, 0); }
          }
          if (!transition && desired !== selected) { from = selected; selected = desired; transition = { start: t }; samples(from, selected, 0); }
          else if (transition && desired === from) {
            const f = clamp((t - transition.start) / fadeSeconds, 0, 1), oldFrom = from;
            from = selected; selected = oldFrom; transition.start = t - (1 - f) * fadeSeconds;
            const reversed = 1 - f; samples(from, selected, reversed * reversed * (3 - 2 * reversed));
          }
        }
      }
    }
    // Both transforms pivot at y=0. The bottom edge never lifts off the floor.
    mesh.rotation.y = options.sway === false ? 0 : Math.sin(t * .62) * .003;
    mesh.scale.y = options.sway === false ? 1 : 1 + Math.sin(t * .9) * .0012;
    return viewReady;
  }
  return { object: root, ready, update, setNight, collider: { minX: root.position.x - .39, maxX: root.position.x + .39, minZ: root.position.z - .3, maxZ: root.position.z + .35, minY: root.position.y, maxY: root.position.y + height + .11 } };
}
