import { gardenCollectionsComplete, readGardenAchievement } from './play-save.js?v=20261127-palette-r4';

export const paletteWallQuery = 'palette-wall';

export function paletteIsUnlocked(achievement = readGardenAchievement()) {
  return achievement === 'record' || achievement === 'record-pending' || achievement === 'complete'
    || gardenCollectionsComplete();
}

export function syncPaletteShortcut(unlocked = paletteIsUnlocked()) {
  const shortcut = document.querySelector('#palette-shortcut');
  shortcut.hidden = !unlocked;
}

export function setupPaletteEntry() {
  const entry = document.querySelector('#open-palette');
  const dialog = document.querySelector('#palette-entry-dialog');
  syncPaletteShortcut();
  window.addEventListener('pageshow', () => syncPaletteShortcut());
  window.addEventListener('storage', () => syncPaletteShortcut());
  entry.addEventListener('click', event => {
    event.preventDefault();
    const unlocked = paletteIsUnlocked();
    dialog.querySelector('h2').textContent = unlocked
      ? '已收齐，直接进入换装彩蛋' : '收齐心心、海报和角色后，即可进入换装彩蛋';
    dialog.querySelector('button').textContent = unlocked ? '进入换装彩蛋' : '回到游戏';
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault();
      dialog.close();
      if (unlocked) location.assign(entry.href);
      else document.querySelector('#enter:not([hidden]):not(:disabled)')?.click();
    };
    dialog.showModal();
  });
}
