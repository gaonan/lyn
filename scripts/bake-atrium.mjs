import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { buildArchitecture } from '../dist/architecture.js';
import { PROBE_IRRADIANCE_RANGE, PROBE_MIN, PROBE_SIZE, PROBE_SPAN } from '../dist/atrium-probes.js';

// The architecture's stool grain is drawn on Canvas at runtime. The bake
// only needs the static box geometry and its diffuse material colors.
globalThis.document = { createElement: () => ({
  getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, bezierCurveTo() {}, stroke() {} }),
}) };
const solids = [];
buildArchitecture(THREE, new THREE.Scene(), (min, max, albedo) => {
  solids.push({ min, max, albedo, id: solids.length });
});

function makeTree(objects) {
  const min = [0, 1, 2].map(axis => Math.min(...objects.map(object => object.min[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...objects.map(object => object.max[axis])));
  if (objects.length <= 5) return { min, max, objects };
  const extents = max.map((value, axis) => value - min[axis]);
  const axis = extents.indexOf(Math.max(...extents));
  objects.sort((a, b) => a.min[axis] + a.max[axis] - b.min[axis] - b.max[axis]);
  const middle = objects.length >> 1;
  return { min, max, children: [makeTree(objects.slice(0, middle)), makeTree(objects.slice(middle))] };
}

function entryDistance(box, { origin, inverse, distance }) {
  let enter = 0;
  let leave = distance;
  for (let axis = 0; axis < 3; axis++) {
    const a = (box.min[axis] - origin[axis]) * inverse[axis];
    const b = (box.max[axis] - origin[axis]) * inverse[axis];
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (leave < enter) return Infinity;
  }
  return enter;
}

const tree = makeTree(solids);
function trace(origin, direction, distance) {
  const ray = { origin, distance, inverse: direction.map(n => 1 / (Math.abs(n) < 1e-8 ? 1e-8 : n)) };
  let hit;
  function visit(node) {
    if (entryDistance(node, ray) > ray.distance) return;
    if (node.objects) {
      for (const object of node.objects) {
        const t = entryDistance(object, ray);
        if (t > .002 && t < ray.distance) {
          ray.distance = t;
          hit = object;
        }
      }
    } else {
      for (const child of node.children) visit(child);
    }
  }
  visit(tree);
  return hit && { box: hit, distance: ray.distance };
}

function lamp(position, color, intensity) {
  return { position, rgb: new THREE.Color(color).multiplyScalar(intensity).toArray() };
}
// Several samples across the real tall and clerestory window openings avoid
// hard penumbrae. Each shelf light is split into three samples across the span.
const day = [
  lamp([8.94, 5.15, -5.7], '#d4e6ff', 7),
  lamp([8.94, 7.48, -4.9], '#deedff', 9),
  lamp([8.94, 7.36, -3.05], '#e1edff', 7),
  ...[.7, 3.5, 6.6].map(z => lamp([8.94, 8.17, z], '#e2ebff', 6)),
];
const night = [
  ...[2.16, 4.56, 6.96, 9.24].flatMap(y =>
    [-5.3, 0, 5.3].map(x => lamp([x, y, -5.0], '#ffdbaf', y > 6 ? 2.6 : 3.15))),
  lamp([-6.28, 3.52, -2.4], '#b1d6ff', 9),
  lamp([4, 3.36, -3.22], '#ffd9ae', 12),
  lamp([7.15, 5.32, 3.10], '#ffdab4', 4),
];

const cache = new Map();
function reflectedRadiance(hit, origin, direction) {
  const { box, distance } = hit;
  const point = origin.map((p, axis) => p + direction[axis] * distance);
  const faceDistances = [0, 1, 2].flatMap(axis =>
    [Math.abs(point[axis] - box.min[axis]), Math.abs(point[axis] - box.max[axis])]);
  const face = faceDistances.indexOf(Math.min(...faceDistances));
  const normalAxis = face >> 1, sign = face % 2 ? 1 : -1;
  const key = [box.id, face, ...point.map(p => Math.round(p * 5))].join(',');
  const cached = cache.get(key);
  if (cached) return cached;

  const start = [...point];
  start[normalAxis] += sign * .025;
  const radiance = [day, night].map(lights => {
    const value = [0, 0, 0];
    for (const source of lights) {
      const delta = source.position.map((p, axis) => p - start[axis]);
      const distance = Math.hypot(...delta);
      const cosine = delta[normalAxis] * sign / distance;
      if (cosine <= 0 || trace(start, delta.map(d => d / distance), distance - .05)) continue;
      const intensity = cosine / (1.2 + .68 * distance * distance);
      for (let channel = 0; channel < 3; channel++) {
        value[channel] += source.rgb[channel] * box.albedo[channel] * intensity;
      }
    }
    return value;
  });
  cache.set(key, radiance);
  return radiance;
}

const samples = 64;
const directions = Array.from({ length: samples }, (_, index) => {
  const y = 1 - 2 * (index + .5) / samples;
  const radius = Math.sqrt(1 - y * y);
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
});
const [width, height, depth] = PROBE_SIZE;
const result = [Buffer.alloc(width * height * depth * 4), Buffer.alloc(width * height * depth * 4)];
for (let z = 0; z < depth; z++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const origin = [x, y, z].map((i, axis) => PROBE_MIN[axis] + (i + .5) / PROBE_SIZE[axis] * PROBE_SPAN[axis]);
  const total = [[0, 0, 0], [0, 0, 0]];
  let occlusion = 0;
  for (const direction of directions) {
    const hit = trace(origin, direction, 18);
    if (!hit) continue;
    const radiance = reflectedRadiance(hit, origin, direction);
    const weight = 1 / (1 + hit.distance * .22);
    for (let mode = 0; mode < 2; mode++) for (let channel = 0; channel < 3; channel++) {
      total[mode][channel] += radiance[mode][channel] * weight;
    }
    occlusion += Math.max(0, 1 - hit.distance / 2.65) ** 1.35;
  }
  const offset = (x + y * width + z * width * height) * 4;
  for (let mode = 0; mode < 2; mode++) {
    for (let channel = 0; channel < 3; channel++) {
      const irradiance = 7 * total[mode][channel] / samples;
      result[mode][offset + channel] = Math.round(255 * Math.sqrt(Math.min(1, irradiance / PROBE_IRRADIANCE_RANGE)));
    }
    result[mode][offset + 3] = Math.round(255 * Math.max(0, 1 - 2.1 * occlusion / samples));
  }
}

const directory = new URL('../dist/assets/lighting/', import.meta.url);
mkdirSync(directory, { recursive: true });
const data = Buffer.concat(result);
writeFileSync(new URL('atrium-probes.bin', directory), data);
console.log(`Baked ${width * height * depth} probes per lighting mode from ${solids.length} solids (${data.length} bytes).`);
