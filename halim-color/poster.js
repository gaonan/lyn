import { paletteIsUnlocked } from '../palette-access.js?v=20261127-palette-r4';

const returningFromWall = new URLSearchParams(location.search).get('from-wall') === '1';
if (paletteIsUnlocked() && !returningFromWall) {
  const poster = document.querySelector('#palette-poster');
  const studio = document.querySelector('.studio');
  const masthead = document.querySelector('.masthead');
  poster.hidden = false;
  studio.inert = masthead.inert = true;
  setTimeout(() => {
    studio.inert = masthead.inert = false;
    poster.hidden = true;
  }, 4000);
}
