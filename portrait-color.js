const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const luminance = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const mix = (a, b, amount) => a + (b - a) * amount;

export function cheekColors(pixels, size, zones) {
  return zones.map(([centerX, centerY, radiusX, radiusY]) => {
    const samples = [];
    const step = Math.max(1, Math.floor(size / 150));
    let sampled = 0;
    for (let y = Math.ceil((centerY - radiusY) * size); y < (centerY + radiusY) * size; y += step) {
      for (let x = Math.ceil((centerX - radiusX) * size); x < (centerX + radiusX) * size; x += step) {
        if (((x / size - centerX) / radiusX) ** 2 + ((y / size - centerY) / radiusY) ** 2 > 1) continue;
        const i = (y * size + x) * 4;
        sampled++;
        if (pixels[i + 3] < 230) continue;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const light = luminance(r, g, b);
        if (light < 22 || light > 244 || r < g * .79 || r < b * .76 || (light - g) > 44) continue;
        samples.push([light, r - light, b - light]);
      }
    }
    if (samples.length < sampled * .3 || samples.length < 12) return null;
    // Discard the darkest and brightest samples so brows, makeup and highlights do not drive the grade.
    samples.sort(([a], [b]) => a - b);
    const trim = Math.floor(samples.length * .18);
    let light = 0, red = 0, blue = 0;
    for (const [y, r, b] of samples.slice(trim, samples.length - trim)) {
      light += y;
      red += r;
      blue += b;
    }
    const count = samples.length - trim * 2;
    return { x: centerX, light: light / count, red: red / count, blue: blue / count };
  });
}

export function matchFaceLighting(pixels, size, source, reference) {
  const shifts = source.map((sample, index) => {
    const target = reference[index];
    if (!sample || !target) return null;
    return {
      x: sample.x,
      light: clamp(target.light - sample.light, -70, 75),
      red: clamp(target.red - sample.red, -37, 37),
      blue: clamp(target.blue - sample.blue, -42, 42),
    };
  });
  const left = shifts[0] || shifts[1], right = shifts[1] || shifts[0];
  if (!left || !right) return;

  const grade = Array.from({ length: size }, (_, x) => {
    const t = left === right ? 0 : clamp((x / size - left.x) / (right.x - left.x), 0, 1);
    const blend = t * t * (3 - 2 * t);
    return {
      light: .83 * mix(left.light, right.light, blend),
      red: .84 * mix(left.red, right.red, blend),
      blue: .84 * mix(left.blue, right.blue, blend),
    };
  });
  for (let x = 0; x < size; x++) {
    const { light, red, blue } = grade[x];
    for (let i = x * 4; i < pixels.length; i += size * 4) {
      if (!pixels[i + 3]) continue;
      const y = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
      // A softer correction in shadows and highlights keeps eyes and teeth from taking the skin tint.
      const detail = clamp((y - 19) / 72, 0, 1) * clamp((255 - y) / 56, 0, 1);
      const fill = light * (.40 + .60 * detail);
      const strength = detail * clamp(1 - Math.max(0, y - pixels[i + 1] - 14) / 50, .46, 1);
      pixels[i] += fill + red * strength;
      pixels[i + 1] += fill - (.2126 * red + .0722 * blue) / .7152 * strength;
      pixels[i + 2] += fill + blue * strength;
    }
  }
}
