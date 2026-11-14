const front = {
  url: './assets/daimi/front.webp',
  width: 539, height: 640,
  uv: { x: 83 / 539, y: 44 / 640, width: 359 / 539, height: 577 / 640 },
  anchorX: .51,
};
const right = {
  url: './assets/daimi/right.webp',
  width: 706, height: 640,
  uv: { x: 82 / 706, y: 8 / 640, width: 530 / 706, height: 606 / 640 },
  anchorX: .51,
  widthScale: .90,
};
const back = {
  url: './assets/daimi/back.webp',
  width: 539, height: 640,
  uv: { x: 115 / 539, y: 37 / 640, width: 301 / 539, height: 565 / 640 },
  anchorX: .5,
};
export const DAIMI_VIEWS = {
  front, right, back, left: { ...right, anchorX: 1 - right.anchorX, mirror: true },
};
