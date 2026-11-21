import { surfaceNoise, surfaceTexture } from './surface-maps.js?v=20261121-r92';

const columns = 8;
const border = 3;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function makeAtlas(T, count, tileWidth, tileHeight, paintTile) {
  const rows = Math.ceil(count / columns);
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const pixels = new Uint8Array(width * height * 4);
  for (let tile = 0; tile < count; tile++) {
    const x = (tile % columns) * tileWidth;
    const y = Math.floor(tile / columns) * tileHeight;
    const paint = paintTile(tile);
    for (let j = 0; j < tileHeight; j++) {
      const v = clamp((j - border) / (tileHeight - 2 * border - 1));
      for (let i = 0; i < tileWidth; i++) {
        const u = clamp((i - border) / (tileWidth - 2 * border - 1));
        paint(pixels, ((y + j) * width + x + i) * 4, u, v);
      }
    }
  }
  const map = surfaceTexture(T, pixels, width, T.SRGBColorSpace, height);
  map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
  return {
    map,
    grid: new T.Vector2(columns, rows),
    inset: new T.Vector2((border + .5) / tileWidth, (border + .5) / tileHeight),
  };
}

export function makeStairFinishes(T, count) {
  const { noise, sample } = surfaceNoise(256, 92347);
  const wood = makeAtlas(T, count, 192, 56, tile => {
    const seed = 9 + 3.8 * tile;
    const cut = sample(tile, 1);
    const figure = cut < .42 ? .018 : cut < .74 ? .14 : .22;
    const slope = .24 * (sample(tile, 2) - .5);
    const arch = sample(tile, 3);
    const bandCount = 8 + 9 * sample(tile, 4);
    const phase = 203 * sample(tile, 5);
    const tone = 8 * Math.sin(tile * 2.4) + 12 * (sample(tile, 6) - .5);
    const honey = (sample(tile, 7) - .5) * 12;
    const knotX = .17 + .67 * sample(tile, 8);
    const knotY = -.12 + 1.24 * sample(tile, 9);
    const hasKnot = cut > .74;
    return (data, i, u, v) => {
      const s = u - arch;
      const curve = slope * u + figure * (3 * s * s - .46 * s * s * s)
        + .050 * (noise(u * 3.2 + seed, phase, 256, 256) - .5);
      const kx = (u - knotX) * 11;
      const ky = (v - knotY) * 4.5;
      const knot = hasKnot ? Math.exp(-kx * kx - ky * ky) : 0;
      const grain = v + curve + .29 * knot * ky;
      const annual = noise(seed + u * 1.85, phase + grain * bandCount, 256, 256);
      const fibers = noise(seed + u * 11.0, phase + grain * 30, 256, 256);
      const stain = noise(seed + u * 5, phase + v * 3, 256, 256);
      const pores = noise(seed + u * 36, phase + grain * 57, 256, 256);
      const rings = Math.max(0, annual - .47);
      const shade = tone + 10 * (stain - .5) - 80 * rings * rings
        - 20 * (fibers - .48) - 34 * knot * knot - 26 * Math.max(0, pores - .58);
      data[i] = 157 + shade + honey;
      data[i + 1] = 115 + shade + honey * .55;
      data[i + 2] = 84 + shade + honey * .28;
      data[i + 3] = 255;
    };
  });
  const stone = makeAtlas(T, count, 160, 36, tile => {
    const seed = 19 + 5.3 * tile;
    const tint = 7 * (sample(tile, 10) - .5);
    return (data, i, u, v) => {
      const drift = noise(seed + u * 11, v * 2.2 + 3.9, 256, 256) - .5;
      const trowel = noise(seed + u * 26, v * 3.2 + 2 * drift, 256, 256) - .5;
      const grit = sample((u * 154 + tile * 27) | 0, (v * 30 + tile * 9) | 0);
      const fleck = grit < .05 ? -17 : grit > .96 ? 9 : 5 * grit - 2;
      const jointShade = 18 * clamp((v - .85) / .15) ** 2 + 5 * clamp((.08 - v) / .08);
      const shade = tint + 12 * drift + 11 * trowel + fleck - jointShade;
      data[i] = 188 + shade;
      data[i + 1] = 180 + shade;
      data[i + 2] = 166 + shade;
      data[i + 3] = 255;
    };
  });
  return { wood, stone };
}

export function applyStairFinish(material, atlas, bumpScale) {
  material.color.set(0xffffff);
  material.map = material.bumpMap = atlas.map;
  material.bumpScale = bumpScale;
  material.onBeforeCompile = shader => {
    shader.uniforms.stairAtlasGrid = { value: atlas.grid };
    shader.uniforms.stairAtlasInset = { value: atlas.inset };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float stairTile;
        uniform vec2 stairAtlasGrid, stairAtlasInset;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec2 boardUv = uv;
        #ifdef USE_INSTANCING
          // Across a flight, the long dimension of the timber always follows the nosing.
          if (abs(normal.y) > .5 && length(instanceMatrix[0].xyz) < length(instanceMatrix[2].xyz)) {
            boardUv = vec2(uv.y, 1.0 - uv.x);
          }
        #endif
        vec2 tileOrigin = vec2(mod(stairTile, stairAtlasGrid.x), floor(stairTile / stairAtlasGrid.x));
        vec2 tileUv = (tileOrigin + mix(stairAtlasInset, 1.0 - stairAtlasInset, boardUv)) / stairAtlasGrid;
        vMapUv = tileUv;
        vBumpMapUv = tileUv;`);
  };
  material.customProgramCacheKey = () => 'stair-finish-atlas-v1';
}
