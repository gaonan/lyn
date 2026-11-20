// Transparent photos: crop bounds and foot anchors preserve aspect ratio.
export const PERFORMER_VIEWS = {
  "front": {
    "url": "./assets/performer/photo-front.webp",
    "width": 1024,
    "height": 1536,
    "uv": {
      "x": 0.2578125,
      "y": 0.005208333333333333,
      "width": 0.525390625,
      "height": 0.9889322916666666
    },
    "anchorX": 0.4284386617100372
  },
  "right": {
    "url": "./assets/performer/photo-right.webp",
    "width": 1024,
    "height": 1536,
    "uv": {
      "x": 0.142578125,
      "y": 0.007161458333333333,
      "width": 0.583984375,
      "height": 0.9856770833333334
    },
    "anchorX": 0.5635451505016722
  },
  "left": {
    "url": "./assets/performer/photo-left.webp",
    "width": 1024,
    "height": 1536,
    "uv": {
      "x": 0.291015625,
      "y": 0.005859375,
      "width": 0.5380859375,
      "height": 0.9876302083333334
    },
    "anchorX": 0.37114337568058076
  },
  "back": {
    "url": "./assets/performer/photo-back.webp",
    "width": 1024,
    "height": 1536,
    "uv": {
      "x": 0.2236328125,
      "y": 0.00390625,
      "width": 0.552734375,
      "height": 0.9928385416666666
    },
    "anchorX": 0.5388692579505301
  }
};

export const RAIN_OUTFIT_VIEWS = {
  front: { url: './assets/performer/rain-front.webp', width: 265, height: 751, anchorX: .475547 },
  right: { url: './assets/performer/rain-right.webp', width: 276, height: 750, anchorX: .525605 },
  back: { url: './assets/performer/rain-back.webp', width: 335, height: 752, anchorX: .501134 },
  left: { url: './assets/performer/rain-left.webp', width: 257, height: 750, anchorX: .397237 },
};

// The concert images are already cropped to their full stage silhouettes.
export const CONCERT_OUTFIT_VIEWS = {
  front: { url: './assets/performer/concert-front.webp', width: 772, height: 1741, anchorX: 0.36399, faceRegion: [.302, .096, .143, .069] },
  right: { url: './assets/performer/concert-right.webp', width: 541, height: 1740, anchorX: 0.494455, faceRegion: [.454, .105, .150, .065] },
  back: { url: './assets/performer/concert-back.webp', width: 777, height: 1752, anchorX: 0.591377 },
  left: { url: './assets/performer/concert-left.webp', width: 761, height: 1745, anchorX: 0.36071, faceRegion: [.333, .100, .142, .066] },
};
