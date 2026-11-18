// Public source streams are requested only after the listener chooses Play.
export const MUSIC_TRACKS = [
  {
    id: 'reunion',
    title: '该相逢的人会再相逢',
    subtitle: '刘宇宁 · 现场演唱',
    kind: 'hls',
    url: 'https://live.video.weibocdn.com/5332684667626135_index.m3u8',
    sourceUrl: 'https://weibo.com/l/wblive/p/show/1022:2321325332684670370133',
    start: 8455,
    end: 8734,
  },
  {
    id: 'rain',
    title: '归期雨抄',
    subtitle: '刘宇宁 · 音乐缘计划3',
    kind: 'video',
    url: globalThis.location?.hostname === 'gaonan.github.io'
      ? 'https://lyn.lipopo.org/api/music/rain' : '/api/music/rain',
    sourceUrl: 'https://video.sina.cn/finance/2026-11-13/detail-iniyqwtt0965785.d.html',
  },
];
