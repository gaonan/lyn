// Seam coordinates on the original garment artwork, before it is fitted to the stage.
const seams = {
  white: [[540,312,312],[550,309,318],[575,306,332],[600,304,347],[620,301,359],[650,298,372],[680,295,384],[710,293,401],[736,290,419],[751,289,427],[780,286,431],[810,283,432],[854,279,435],[870,278,445],[880,277,455],[900,274,473],[920,272,484],[950,269,489],[970,266,491],[1000,263,494],[1030,259,498],[1060,256,502],[1090,251,505],[1110,248,508],[1140,244,514],[1157,241,519],[1174,239,520],[1190,248,519]],
  red: [[476.5,357,443],[500,354,445],[528,351,447],[559,348,451],[600,342,458],[650,336,465],[700,328,472],[753,318,478],[805,315,483],[850,311,486],[900,306,489],[950,300,492],[1000,295,496],[1050,291,500],[1100,289,500],[1135,294,494],[1155,300,491],[1178,302,489]],
  shirt: [[190,369,428],[209,364,434],[230,363,437],[268,363,437],[318,362,437],[369,361,437],[418,360,440],[451,358,442],[477.5,358,443]],
  tie: [[230,392,410],[234,390,413],[247,395,407],[254,397,405],[269,394,408],[298,392,410],[344,390,411],[398,389,412],[441,388,413],[472,387.5,414],[481,391,410],[487,396,406],[491.5,400,401]],
  ink: [[464,360,438],[484,357,442],[520,351,447],[560,343,454],[610,332,465],[660,324,475],[710,312,484],[760,302,493],[810,291,503],[860,283,511],[910,276,518],[956,272,522],[1000,269,523],[1045,268,524],[1090,269,526],[1130,268,528],[1165,272,526],[1184,280,515]],
  vest: [[194,371,430],[218,370,430],[259,368,431],[295,367,432],[337,365,434],[386,365,437],[429,362,439],[469,360,439]]
};
const redCenterPlacket = [
  [618,398,399],[635,397,400],[660,395,402],[690,393,404],[725,391,406],[765,389,407],
  [810,387,407],[850,386,407],[900,385,407],[945,385,407],[1000,384,406],[1050,383,407],
  [1100,383,410],[1130,375,417],[1150,372,422],[1180,371,429]
];
const inkLinings = [
  [[636,398,399],[680,395,402],[715,394,405],[750,394,407],[785,389,408],[820,387,410],
    [855,385,410],[890,385,411],[950,383,412],[1000,383,412],[1065,383,413],
    [1100,381,413],[1135,378,415],[1158,377,415]],
  [[918,273,275],[960,271,275],[995,266,275],[1030,260,274],[1065,253,273],
    [1100,247,270],[1135,241,271],[1153,236,270],[1158,236,270]],
  [[954,521,525],[995,521,529],[1030,522,534],[1065,524,540],
    [1100,524,550],[1135,523,557],[1154,524,560],[1158,524,561]]
];
const vestHem = [[360,468],[371,474],[385,482],[395,487],[399,480],[404,487],[414,483],[427,476],[439,469]];
const inkNeckOpening = [
  [180,374,427],[193,374,427],[204,373,428],[220,371,429],
  [233,372,427],[247,375,425],[262,379,421],[282,384,417]
];
const ivoryCollarRoots = [
  [[211,359,361.5],[213,357.5,361.5],[215,355.5,361],[218,353.5,361],
    [221,351.5,361],[224.5,347.5,361.5]],
  [[211,420,423],[213,420.5,424.5],[215,421,426],[218,421,427.5],
    [221,421,429.5],[224.5,420.5,434]]
];
const printedCollarLeft = [
  [246,286.5],[250,289.5],[255,296],[260,298.5],[265,302.5],[270,307.5],
  [275,312.5],[280,318.5],[285,324.5],[290,331.5],[295,337.5],[300,344],
  [305,349.5],[310,354.5],[315,359.5],[320,364.5],[325,369.5],[330,374.5],
  [335,378.5],[340,383.5],[345,388.5],[351,392.5],
];
const printedCollar = [
  [306,238],[327,228],[346,220],[361,209],[371,192],[429,191],[435,206],[451,222],[476,233],
  [466,246],[453,258],[441,275],[426,292],[411,305],[403,318],[397,335],
  ...printedCollarLeft.slice().reverse().map(([y, x]) => [x, y]),
];
const peachNeckline = [
  [184,371,430],[195,373,428],[205,376,427],[215,380,425],[225,384,422],
  [235,387,420],[245,390,416],[255,392,413],[265,395,410],[275,398,408],
  [285,400,406],[295,402,404],[299,403,403]
];
// Each opening begins at the curved edge of the cuff and widens into the hand.
const wristOpenings = {
  ivory: [
    [[549,222,230],[551,214,236],[553,212,241],[556,211,243],[559,211,246],[563,210,249]],
    [[550,552,561],[552,543,566],[554,541,569],[557,537,571],[560,533,570],[564,532,571]]
  ],
  denim: [
    [[546,229,236],[548,222,241],[551,219,243],[555,218,243],[560,217,245],[564,217,248]],
    [[546,563,570],[548,559,575],[551,556,579],[555,555,580],[560,552,581],[565,548,582]]
  ],
  scarlet: [
    [[552,227,236],[554,219,241],[556,216,242],[561,215,243],[565,215,245],[568,214,247]],
    [[552,562,571],[554,556,576],[557,554,579],[561,552,580],[565,549,580],[568,548,582]]
  ],
  peach: [
    [[547,226,227],[549,221,234],[551,220,237],[554,219,238],[557,217,240],
      [560,216,241],[563,215,241],[565,211,246]],
    [[548,571,573],[550,563,579],[552,560,580],[554,559,580],[557,557,580],
      [560,554,581],[563,551,583],[565,547,586]]
  ],
  ink: [
    [[552,225,232],[554,220,239],[556,217,241],[560,216,243],[564,215,246],[570,214,251]],
    [[552,570,578],[554,561,582],[557,558,583],[561,554,583],[565,552,584],[571,549,586]]
  ]
};
const peachLongTail = [
  [524,270,396],[540,270,398],[559,270,398],[570,276,398],[580,286,398],
  [590,296,398],[605,308,398],[620,318,397],[635,328,397],[660,340,397],
  [680,347,397],[700,352,396],[720,358,395],[740,362,394],[760,367,394],
  [780,372,394],[800,376,394],[820,381,394],[840,386,394],[860,389,394],
  [880,391,394],[900,392,394],[908,393,393]
];
const peachShortTail = [
  [524,396,524],[531,400,524],[542,406,524],[552,412,524],[562,418,524],
  [571,423,524],[580,428,524],[590,434,516],[595,437,511],[600,440,501],
  [605,443,493],[610,446,484],[615,449,475],[620,452,466],
  [624,454,458],[625,456,456]
];

function seamAt(points, position, column) {
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1];
    const right = points[i];
    if (position <= right[0]) {
      const t = Math.max(0, (position - left[0]) / (right[0] - left[0]));
      return left[column] * (1 - t) + right[column] * t;
    }
  }
  return points[points.length - 1][column];
}

function insideSeam(points, x, y) {
  return y >= points[0][0] && y <= points[points.length - 1][0]
    && x >= seamAt(points, y, 1) && x <= seamAt(points, y, 2);
}

function insidePrintedCollar(x, y) {
  let inside = false;
  for (let i = 0, j = printedCollar.length - 1; i < printedCollar.length; j = i++) {
    const [a, b] = printedCollar[i];
    const [c, d] = printedCollar[j];
    if ((b > y) !== (d > y) && x < a + (y - b) * (c - a) / (d - b)) inside = !inside;
  }
  return inside;
}

function sourceClothingY(look, y, height) {
  const lift = bodyLift(look, height);
  if (!lift) return y;
  const thigh = Math.round(height * .47);
  const hem = Math.round(height * .953);
  if (y < thigh - lift) return y + lift;
  if (y >= hem) return y;
  return thigh + (y - thigh + lift) * (hem - thigh) / (hem - thigh + lift);
}

function peachGarment(x, y) {
  if (y < 524) return insideSeam(peachNeckline, x, y) ? 0 : 1;
  if (y < 650 && (x < 264 || x > 531)) return 1;
  return insideSeam(peachLongTail, x, y) || insideSeam(peachShortTail, x, y) ? 1 : 2;
}

function isHandPixel(look, x, y) {
  if (y < 546 || y > 650 || !((x >= 195 && x < 260) || (x >= 524 && x < 598))) return false;
  const wrist = wristOpenings[look]?.[x < 260 ? 0 : 1];
  return Boolean(wrist && (y > wrist[wrist.length - 1][0] || insideSeam(wrist, x, y)));
}

function softenHandSkin(data, byte, x, y) {
  if (y < 545 || y > 648 || !((x > 203 && x < 259) || (x > 523 && x < 591))) return;
  const [red, green, blue] = [data[byte], data[byte + 1], data[byte + 2]];
  const skin = smoothstep(8, 22, red - green) * smoothstep(1, 10, green - blue)
    * smoothstep(60, 108, red) * (1 - smoothstep(63, 80, red - green));
  for (let channel = 0; channel < 3; channel++) {
    data[byte + channel] += (255 - data[byte + channel]) * .052 * skin;
  }
}

const trouserDrape = {
  ink: { pants: 2, spans: [[294, 349], [444, 496]] },
  striped: { pants: 4, spans: [[295, 355], [433, 496]] },
};

function drapeTrouserHems(image, ids, look, shoes) {
  const cut = trouserDrape[look];
  if (!cut) return;
  const { width, data } = image;
  const unit = width / 800;
  for (const [left, right] of cut.spans) {
    for (let x = Math.ceil(left * unit); x < right * unit; x++) {
      const across = (x / unit - left) / (right - left);
      const depth = 9 * unit * Math.sin(Math.PI * across) ** .8;
      for (let y = Math.round(1132 * unit); y < 1157 * unit; y++) {
        const seam = y * width + x;
        if (ids[seam] !== shoes || ids[seam - width] !== cut.pants) continue;
        for (let down = 0; down < depth; down++) {
          const target = seam + down * width;
          const source = seam - (1 + Math.floor(down * .72)) * width;
          if (ids[target] !== shoes || ids[source] !== cut.pants) break;
          const coverage = Math.min(1, depth - down);
          for (let channel = 0; channel < 3; channel++) {
            const i = target * 4 + channel;
            data[i] += (data[source * 4 + channel] - data[i]) * coverage;
          }
          if (coverage >= .5) ids[target] = cut.pants;
        }
        break;
      }
    }
  }
}

function garmentPart(look, x, y, r, g, b, original) {
  if (isHandPixel(look, x, y)) return 0;
  if (look === "ivory" && y >= 211 && y <= 224.5
    && ivoryCollarRoots.some(root => insideSeam(root, x, y))) return 1;
  if (look === "ivory" && y >= 539) {
    return insideSeam(seams.white, x, y) ? 2 : (original === 2 ? 1 : original);
  }
  if (look === "denim") {
    if (y >= 987) return 2;
    if (y < 354 && x > 280 && x < 478 && insidePrintedCollar(x, y)) return 0;
    if (y >= 246 && y <= 351) {
      const edge = seamAt(printedCollarLeft, y, 1);
      if (x >= edge - 10 && x < edge) return 1;
    }
    return original === 3 ? (b > r + 12 && r < 104 ? 1 : 0) : original;
  }
  if (look === "striped" && y >= 1125) return 4;
  if (look === "peach") return peachGarment(x, y);
  if (look === "scarlet") {
    const coal = r - g < 25 && r - b < 28 && r < 143;
    if (coal && insideSeam(seams.tie, x, y)) return 4;
    if (coal && insideSeam(seams.shirt, x, y)) return 3;
    if (insideSeam(seams.red, x, y) && !insideSeam(redCenterPlacket, x, y)) return 2;
    return original === 2 || original === 3 ? (original === 3 && r > 149 && r - g < 38 ? 0 : 1) : original;
  }
  if (look === "ink") {
    const redLining = r >= 21 && r > 1.43 * g + 3 && r > 1.18 * b + 3;
    if ((y >= 636 && inkLinings.some(edge => insideSeam(edge, x, y)))
      || (redLining && y > 538 && y < 575 && (x < 267 || x > 524))) return 3;
    const vest = insideSeam(seams.vest, x, y)
      || (y >= 468 && y <= 488 && x >= 360 && x <= 439 && y < seamAt(vestHem, x, 1));
    if (vest && (r < 124 || r - g < 15)) return 4;
    if (insideSeam(seams.ink, x, y)) return 2;
    return original >= 2 ? 1 : original;
  }
  return original;
}
