// Small, seamless procedural maps keep material detail independent of network speed.
export function makeSurfaceMaps(T, kind) {
  const size = 256, mask = size - 1;
  let seed = 6247;
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
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(color.length);
  const relief = new Float32Array(size * size);
  const wood = kind === 'wood';
  const fabric = kind === 'fabric';
  const base = wood ? [177, 135, 92] : fabric ? [225, 219, 204] : [164, 160, 153];
  const tau = 2 * Math.PI;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = x + y * size;
    const grain = sample(x, y) - .5;
    let shade, height;
    if (wood) {
      const curve = .045 * noise(u * 8, v * 4, 8, 4) + .012 * Math.sin(tau * v);
      const bands = Math.sin(tau * (u + curve) * 23 + 1.4 * noise(u * 16, v * 4, 16, 4));
      const pores = noise(u * 128, v * 8, 128, 8);
      shade = 20 * (noise(u * 8, v * 4, 8, 4) - .5) - 13 * Math.max(0, bands) ** 6 + 18 * (pores - .5);
      height = .34 * pores - .11 * Math.max(0, bands) ** 6 + .09 * grain;
    } else if (fabric) {
      const warp = Math.sin(tau * (u * 64 + .1 * Math.cos(tau * v * 64)));
      const weft = Math.sin(tau * (v * 64 + .1 * Math.cos(tau * u * 64)));
      shade = 2 * (warp + weft) + 3 * grain;
      height = .13 * (warp + weft) + .05 * grain;
    } else {
      const cloudy = noise(u * 8, v * 8, 8, 8) - .5;
      const fines = noise(u * 32, v * 32, 32, 32) - .5;
      const pinhole = grain < -.455 && fines < -.06 ? -.36 : 0;
      shade = 8 * cloudy + 10 * fines + 9 * grain + 20 * pinhole;
      height = .19 * fines + .17 * grain + pinhole;
    }
    relief[i] = height;
    for (let channel = 0; channel < 3; channel++) color[i * 4 + channel] = Math.round(base[channel] + shade);
    color[i * 4 + 3] = 255;
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
  function texture(data, colorSpace) {
    const map = new T.DataTexture(data, size, size);
    map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.magFilter = T.LinearFilter;
    map.minFilter = T.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.needsUpdate = true;
    return map;
  }
  return { map: texture(color, T.SRGBColorSpace), normalMap: texture(normal, T.NoColorSpace) };
}
