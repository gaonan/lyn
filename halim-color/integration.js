import { paletteIsUnlocked, paletteWallQuery } from '../palette-access.js?v=20261127-palette-r4';
import { setupKeepsake } from '../keepsake.js?v=20261128-r2';
import { publishWallMessage } from '../message-wall.js?v=20261127-palette-r6';

const studio = document.querySelector('.studio');
const locked = document.querySelector('#palette-locked');
const dialog = document.querySelector('#record-finale');
const report = detail => window.dispatchEvent(new CustomEvent('bloom-palette', { detail }));

function visitWall() {
  try {
    sessionStorage.setItem('carnation7-palette-wall-view', JSON.stringify({
      angle: document.querySelector('#angles [aria-pressed="true"]').value,
      light: document.querySelector('#light').value,
    }));
  } catch {}
  const destination = new URL('../', location.href);
  destination.searchParams.set(paletteWallQuery, '1');
  location.assign(destination);
}

if (paletteIsUnlocked()) {
  let shot;
  let lettering;
  const record = { url: '../assets/record/album.webp?v=20261122-r95' };
  const wall = { open: visitWall, publish: publishWallMessage };
  const openKeepsake = setupKeepsake(dialog, record,
    (ctx, x, y, width, height) => ctx.drawImage(shot, x, y, width, height),
    wall, true, undefined, {
      palette: true,
      onPublish: visitWall,
      onGenerate: () => report('keepsake'),
      paletteLettering() {
        if (!lettering) {
          const image = new Image();
          image.src = 'assets/palette-lettering.png';
          lettering = image.decode().then(() => image, () => undefined);
        }
        return lettering;
      },
    });

  document.addEventListener('palette-keepsake', event => {
    if (!paletteIsUnlocked()) {
      studio.hidden = true;
      locked.showModal();
      return;
    }
    shot = event.detail;
    openKeepsake();
    dialog.showModal();
    dialog.querySelector('textarea').focus();
  });
  dialog.addEventListener('close', () => { shot = undefined; });
  studio.hidden = false;
  report('enter');
} else {
  locked.showModal();
}
