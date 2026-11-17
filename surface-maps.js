export function surfaceNoise(size, seed) {
  const mask = size - 1;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const grid = Float32Array.from({ length: size * size }, random);
  const sample = (x, y) => grid[(x & mask) + (y & mask) * size];
  function noise(x, y, periodX, periodY) {
    const i = Math.floor(x), j = Math.floor(y);
    const u = x - i, v = y - j;
    const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    const left = i & (periodX - 1), right = (i + 1) & (periodX - 1);
    const top = j & (periodY - 1), bottom = (j + 1) & (periodY - 1);
    const low = sample(left, top) * (1 - a) + sample(right, top) * a;
    const high = sample(left, bottom) * (1 - a) + sample(right, bottom) * a;
    return low * (1 - b) + high * b;
  }
  return { sample, noise };
}

export function surfaceTexture(T, data, width, colorSpace, height = width) {
  const map = new T.DataTexture(data, width, height);
  map.colorSpace = colorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

// One continuous albedo across the poured slab. The larger trowel marks and
// exposed aggregate still read after mipmapping removes the pinhole detail.
export function makeConcreteFloorColor(T) {
  const size = 512;
  const { sample, noise } = surfaceNoise(size, 94312);
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const flow = noise(u * 8, v * 8, 8, 8) - .5;
    const curing = noise(u * 16 + flow * 1.9, v * 16, 16, 16) - .5;
    const trowel = noise(u * 32 + flow * 2, v * 64 + curing * 1.6, 32, 64) - .5;
    const aggregate = noise(u * 128, v * 128, 128, 128) - .5;
    const grain = sample(x, y) - .5;
    const shade = 19 * flow + 30 * curing + 16 * trowel + 17 * aggregate + 8 * grain;
    const i = (x + y * size) * 4;
    pixels[i] = Math.round(176 + shade);
    pixels[i + 1] = Math.round(174 + shade + 2 * curing);
    pixels[i + 2] = Math.round(169 + shade + 5 * curing);
    pixels[i + 3] = 255;
  }
  return surfaceTexture(T, pixels, size, T.SRGBColorSpace);
}

// Small, seamless procedural maps keep material detail independent of network speed.
export function makeSurfaceMaps(T, kind) {
  const size = 256, mask = size - 1;
  const { sample, noise } = surfaceNoise(size, 6247);
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(color.length);
  const roughness = new Uint8Array(color.length);
  const relief = new Float32Array(size * size);
  const wood = kind === 'wood';
  const fabric = kind === 'fabric';
  const plaster = kind === 'plaster';
  const base = wood ? [173, 145, 116] : fabric ? [225, 217, 204]
    : plaster ? [188, 185, 179] : [172, 168, 161];
  const tau = 2 * Math.PI;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = x + y * size;
    const grain = sample(x, y) - .5;
    let shade, height, finish;
    if (wood) {
      const broad = noise(u * 8, v * 4, 8, 4);
      const curve = .057 * broad + .007 * Math.sin(tau * v);
      const bands = noise((u + curve) * 32, v * 2, 32, 2);
      const annual = Math.max(0, bands - .35) ** 2 * 2.35;
      const pores = noise((u + curve) * 128, v * 8, 128, 8);
      const openPores = Math.max(0, pores - .53);
      shade = 18 * (broad - .5) - 11 * annual - 25 * openPores + 4 * grain;
      height = -.08 * annual - .24 * openPores + .036 * grain;
      finish = .61 + .10 * annual + .30 * openPores;
    } else if (fabric) {
      const warp = Math.sin(tau * (u * 64 + .1 * Math.cos(tau * v * 64)));
      const weft = Math.sin(tau * (v * 64 + .1 * Math.cos(tau * u * 64)));
      shade = 2 * (warp + weft) + 3 * grain;
      height = .13 * (warp + weft) + .05 * grain;
      finish = .88 + .04 * warp * weft;
    } else if (plaster) {
      const broad = noise(u * 4, v * 8, 4, 8) - .5;
      const trowel = noise(u * 8, v * 32, 8, 32) - .5;
      const grains = noise(u * 64, v * 64, 64, 64) - .5;
      shade = 6 * broad + 5 * trowel + 7 * grains + 3 * grain;
      height = .10 * trowel + .17 * grains + .07 * grain;
      finish = .90 + .14 * grains;
    } else {
      const cloudy = noise(u * 8, v * 8, 8, 8) - .5;
      const fines = noise(u * 32, v * 32, 32, 32) - .5;
      const pinhole = grain < -.473 && fines < -.06 ? -.24 : 0;
      shade = 6 * cloudy + 6 * fines + 7 * grain + 18 * pinhole;
      height = .10 * fines + .11 * grain + pinhole;
      finish = .85 + .11 * fines - .22 * pinhole;
    }
    relief[i] = height;
    for (let channel = 0; channel < 3; channel++) color[i * 4 + channel] = Math.round(base[channel] + shade);
    color[i * 4 + 3] = 255;
    roughness[i * 4 + 1] = Math.round(finish * 255);
    roughness[i * 4 + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (x + y * size) * 4;
    const dx = relief[((x - 1) & mask) + y * size] - relief[((x + 1) & mask) + y * size];
    const dy = relief[x + ((y - 1) & mask) * size] - relief[x + ((y + 1) & mask) * size];
    const length = Math.hypot(dx, dy, 1);
    normal[i] = 127.5 * (1 + dx / length);
    normal[i + 1] = 127.5 * (1 + dy / length);
    normal[i + 2] = 127.5 * (1 + 1 / length);
    normal[i + 3] = 255;
  }
  return {
    map: surfaceTexture(T, color, size, T.SRGBColorSpace),
    normalMap: surfaceTexture(T, normal, size, T.NoColorSpace),
    roughnessMap: surfaceTexture(T, roughness, size, T.NoColorSpace),
  };
}
