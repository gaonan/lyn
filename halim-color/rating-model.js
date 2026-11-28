// Colors and approximate visible areas, in the editor's fabric order.
const ratedOutfits = {
  striped: [["#25242b", .25], ["#ddd8ce", .14], ["#34313a", .16], ["#2a292e", .37], ["#232127", .08]],
  ivory: [["#e5ddd5", .32], ["#e0d9d3", .43], ["#ece6de", .19], ["#ded7cc", .06]],
  scarlet: [["#9f2538", .46], ["#912333", .32], ["#22212a", .09], ["#692635", .06], ["#211f24", .07]],
  ink: [["#2d2b34", .44], ["#262633", .28], ["#822433", .08], ["#3b3742", .13], ["#1e1b21", .07]],
  peach: [["#ce8f83", .46], ["#c8877a", .46], ["#a4786c", .08]],
  denim: [["#345975", .44], ["#254965", .44], ["#243340", .12]],
};
const ratedStages = {
  carnation: ["#4b5768", -.62],
  secret: ["#584271", -.64],
  warm: ["#bb7430", .96],
};
const ratedPatternCoverage = { original: 0, check: .19, plaid: .34, stripe: .21 };

// Score thresholds calibrated to a normal-shaped reference mix centered at 70.
// The mix covers original outfits, partial edits, coordinated palettes and random colors.
const harmonyCutoffs = [
  .47911, .48418, .48958, .50032, .50829, .52017, .53317,
  .54507, .56082, .57243, .58748, .60362, .62091, .63841,
  .65859, .68100, .70447, .72607, .74977, .77356, .79440,
  .81091, .82644, .83976, .85135, .85802, .86861, .87723,
  .88379, .89175, .89904, .90671, .91258, .91573, .92050,
  .92460, .92773, .93341, .93600, .94075, .94481, .95097,
  .95601, .96093, .96480, .96818, .97152, .97451, .97717,
  .97968, .98126, .98298, .98561, .98733, .98956, .99122,
  .99210, .99415, .99549,
];

function rateLinearRgb(hex) {
  return hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
}

function rateOklab(hex) {
  const [r, g, b] = rateLinearRgb(hex);
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [
    .2104542553*l + .7936177850*m - .0040720468*s,
    1.9779984951*l - 2.4285922050*m + .4505937099*s,
    .0259040371*l + .7827717662*m - .8086757660*s,
  ];
}

function ratingMaterial(color, finishes) {
  const finish = finishes.get(color);
  if (!finish) return rateOklab(color);
  const [dark, mid, light] = finish.colors.map(rateOklab);
  return mid.map((channel, index) => .22*dark[index] + .56*channel + .22*light[index]);
}

function ratingColorFeatures([light, a, b]) {
  const chroma = Math.hypot(a, b);
  return {
    light, chroma, vivid: ratingEase(.025, .14, chroma),
    hue: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360,
    warmth: Math.max(-1, Math.min(1, (.30*a + .95*b) / .13)),
  };
}

function ratingEase(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function ratingHueDistance(first, second) {
  const delta = Math.abs(first.hue - second.hue);
  return Math.min(delta, 360 - delta);
}

function ratingPair(first, second, emphasis) {
  const angle = ratingHueDistance(first, second);
  const analogous = 1 - ratingEase(18, 88, angle);
  // A complementary accent has less visual weight than two equally strong colors.
  const complementary = ratingEase(113, 159, angle) * (1 - .29 * emphasis);
  const hue = .36 + Math.max(.61 * analogous, .67 * complementary);
  const lightnessDifference = Math.abs(first.light - second.light);
  const contrast = ratingEase(.07, .51, lightnessDifference);
  const chromatic = Math.sqrt(first.vivid * second.vivid);
  const neutral = 1 - Math.max(first.vivid, second.vivid);
  const tonal = 1 - ratingEase(.045, .36, lightnessDifference);
  const neutralPair = .75 + .17 * contrast + neutral * (.19 * tonal + .10 * contrast);
  const chromaticPair = .79 * hue + .21 * (.70 + .30 * contrast);
  const sharedColor = ratingEase(.018, .065, Math.min(first.chroma, second.chroma));
  const colorRelationship = sharedColor * (.13 * analogous + .095 * complementary * contrast);
  return neutralPair * (1 - chromatic) + chromaticPair * chromatic + colorRelationship;
}

function paletteQuality({ outfit, stage, parts }, finishes) {
  const colors = [];
  ratedOutfits[outfit].forEach(([original, area], index, fabrics) => {
    const part = parts[index];
    const coverage = index === fabrics.length - 1 ? 0 : ratedPatternCoverage[part.pattern];
    colors.push([ratingColorFeatures(ratingMaterial(part.color || original, finishes)), area*(1-coverage)]);
    if (coverage) colors.push([ratingColorFeatures(rateOklab(part.thread)), area*coverage]);
  });

  let harmony = 0;
  let pairWeight = 0;
  for (let index = 0; index < colors.length; index++) {
    const [first, area] = colors[index];
    for (const [second, otherArea] of colors.slice(index + 1)) {
      const weight = area*otherArea;
      harmony += weight * ratingPair(first, second, Math.min(area, otherArea) / Math.max(area, otherArea));
      pairWeight += weight;
    }
  }
  const layers = harmony / pairWeight;

  const [stageColor, temperature] = ratedStages[stage];
  const stageTone = ratingColorFeatures(rateOklab(stageColor));
  const outfitLight = colors.reduce((sum, [color, area]) => sum + color.light * area, 0);
  let lightnessSpread = 0;
  let colorWeight = 0;
  let separation = 0;
  let temperatureFit = 0;
  let temperatureClash = 0;
  for (const [color, area] of colors) {
    const temperatureAlignment = color.warmth * temperature;
    lightnessSpread += area * (color.light - outfitLight) ** 2;
    colorWeight += area * color.vivid;
    separation += area * ratingEase(.04, .42, Math.abs(color.light - stageTone.light));
    temperatureFit += area * color.vivid * Math.max(0, temperatureAlignment);
    temperatureClash += area * color.vivid * ratingEase(.11, .62, -temperatureAlignment);
  }
  const dominantFamily = Math.max(...colors.map(([anchor]) => colors.reduce((sum, [color, area]) => {
    const angle = ratingHueDistance(color, anchor);
    const similar = 1 - ratingEase(24, 71, angle);
    const contrast = ratingEase(.10, .32, Math.abs(color.light - anchor.light));
    const deliberateAccent = .67 * contrast * ratingEase(119, 155, angle);
    return sum + area * color.vivid * Math.max(similar, deliberateAccent);
  }, 0)));
  const focus = 1 - ratingEase(.10, .38, colorWeight - dominantFamily);
  const depth = ratingEase(.065, .32, Math.sqrt(lightnessSpread));
  // A restrained monochrome can rely on texture and cut for depth.
  const restrainedTone = .68 * (1 - ratingEase(.04, .23, colorWeight));
  const scene = .74 + .14 * separation + .62 * temperatureFit - .37 * temperatureClash;
  const quality = .77 * layers + .11 * scene + .07 * focus + .05 * Math.max(depth, restrainedTone);
  const note = temperatureClash > .16 ? "stage" : layers < .66 ? "layers" : "balanced";
  return { quality, note };
}

function scorePalette(look, finishes) {
  const { quality, note } = paletteQuality(look, finishes);
  const firstHigher = harmonyCutoffs.findIndex(cutoff => quality < cutoff);
  return { score: firstHigher === -1 ? 99 : 40 + firstHigher, note };
}
