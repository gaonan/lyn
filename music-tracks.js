// Audio is requested on play or when the listener enters the secret garden.
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
    id: 'garden',
    title: '如果我有一座花园',
    subtitle: '刘宇宁 · 秘密花园舞台',
    kind: 'audio',
    url: './assets/music/secret-garden.m4a?v=20261120-r87',
    sourceUrl: 'https://weibo.com/1699432410/5367389331918016',
  },
  {
    id: 'rain',
    title: '归期雨抄',
    subtitle: '刘宇宁 · 音乐缘计划3',
    available: false,
    kind: 'video',
    url: '',
    sourceUrl: '',
  },
];
