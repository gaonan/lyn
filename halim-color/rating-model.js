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

// Raw harmony thresholds for the step from 40 to 41 through the step from 98 to 99.
// The reference mix includes original pieces, partial edits, custom colors and coordinated presets.
const harmonyCutoffs = [
  .309087215, .352589370, .361458217, .378996090, .393185809, .407857198, .422809520,
  .435184177, .447938056, .462257456, .478665064, .492099908, .508435811, .524384456,
  .538337583, .552646084, .569188576, .581180373, .597249617, .611320132, .624734098,
  .636372203, .648341466, .659964007, .671807833, .681938931, .692957851, .704044174,
  .713677683, .723933272, .734789575, .744393301, .754720943, .765571393, .777367063,
  .786306289, .796811990, .806487883, .815081930, .822065473, .828616610, .835833462,
  .844261021, .848187679, .855960888, .861649602, .871493104, .873255169, .875522069,
  .885364302, .895583737, .895583737, .895583737, .900289944, .903819076, .910531995,
  .918059048, .918059048, .923122162,
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
    light, vivid: Math.min(1, chroma / .17),
    hue: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360,
    warmth: Math.max(-1, Math.min(1, (.30*a + .95*b) / .13)),
  };
}

function ratingPair(first, second, emphasis) {
  const delta = Math.abs(first.hue - second.hue);
  const angle = Math.min(delta, 360 - delta);
  const adjacent = Math.max(0, 1 - angle / 64);
  const opposite = Math.max(0, (angle - 124) / 56);
  const hueMatch = Math.max(adjacent, opposite * (.56 + .28*(1-emphasis)));
  const intensity = Math.sqrt(first.vivid*second.vivid);
  const brightness = Math.abs(first.light - second.light);
  const valueBalance = .85 - Math.max(0, brightness - .40) * .66;
  return valueBalance * (1-intensity) + hueMatch * intensity;
}

function scorePalette({ outfit, stage, parts }, finishes) {
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
  let backdrop = 0;
  let opposite = 0;
  let vividness = 0;
  let dominantTones = 0;
  for (const [color, area] of colors) {
    backdrop += area * ratingPair(color, stageTone, .35);
    opposite += area * Math.max(0, -color.warmth*temperature);
    vividness += color.vivid*area;
    if (color.vivid >= .71) dominantTones += area;
  }
  const scene = .69*backdrop + .31*(1-opposite);
  const restraint = 1 - Math.max(0, vividness-.49)*1.05 - .19*dominantTones;
  const quality = .67*layers + .28*scene + .05*restraint;
  const firstHigher = harmonyCutoffs.findIndex(cutoff => quality < cutoff);
  const note = opposite > .16 || scene + .13 < layers ? "stage"
    : layers < .60 || dominantTones > .63 ? "layers" : "balanced";
  return { score: firstHigher === -1 ? 99 : 40 + firstHigher, note };
}
