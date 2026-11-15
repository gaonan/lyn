import { magazineInReach } from './magazines.js?v=20261113-r44';
import { roleInReach } from './roles.js?v=20261113-r44';

const HOLD_MS = 2000;
const HOLD_KEYS = ['Space', 'Enter'];
const ACHIEVEMENT_KEY = 'carnation7-achievement';

export function setupMagazineQuest(magazines, roles, dog, record, getPlayer, options) {
  const panel = document.querySelector('#magazine-counter');
  const counter = panel.querySelector('b');
  const lightButton = document.querySelector('#light-magazine');
  const portrait = lightButton.querySelector('img');
  const title = lightButton.querySelector('small');
  const actionLabel = lightButton.querySelector('strong');
  const dogButton = document.querySelector('#greet-daimi');
  const dogHint = dogButton.querySelector('small');
  const magazineFinale = document.querySelector('#magazine-finale');
  const magazineFan = magazineFinale.querySelector('.magazine-fan');
  const dialog = document.querySelector('#daimi-dialog');
  const roleDialog = document.querySelector('#role-invitation');
  const rolesCelebration = document.querySelector('#roles-celebration');
  const roleFinale = document.querySelector('#role-finale');
  const achievementCelebration = document.querySelector('#achievement-celebration');
  const achievementBadge = document.querySelector('#achievement-badge');
  const recordFinale = document.querySelector('#record-finale');
  const rolePanel = document.querySelector('#role-counter');
  const barks = document.querySelector('#daimi-barks');
  const total = magazines.items.length;
  panel.querySelector('em').textContent = `/ ${total}`;
  magazineFinale.querySelector('p').textContent = `${total} / ${total}`;
  let count = 0;
  let magazinesCelebrated = false;
  let daimiUnlocked = false;
  let target = null;
  let hold = null;
  let barkPlaying = false;
  let barkNeedsTap = false;
  let barkPlays = 0;
  let invitationPending = false;
  let roleUnlocked = false;
  let roleCount = 0;
  let achievementPending = false;
  let newRecord = false;

  const modals = [magazineFinale, dialog, roleDialog, rolesCelebration, roleFinale,
    achievementCelebration, recordFinale];
  function modalOpen() { return modals.some(modal => modal.open); }
  function showModal(element) {
    cancelHold();
    options.pause();
    element.showModal();
  }

  function playCelebration() {
    const sound = options.rewardSounds.play('celebration');
    if (!sound) return;
    const restoreMusic = options.muteForCelebration();
    sound.addEventListener('ended', restoreMusic, { once: true });
  }

  function celebrate(element, after, duration = 2300) {
    showModal(element);
    const finish = () => {
      element.close();
      after();
    };
    const animation = element.getAnimations?.()[0];
    if (animation) animation.finished.then(finish, finish);
    else setTimeout(finish, duration);
  }
  for (const element of [magazineFinale, rolesCelebration, achievementCelebration]) {
    element.addEventListener('cancel', event => event.preventDefault());
  }

  function showCovers(container, items) {
    for (const [index, item] of items.entries()) {
      const cover = document.createElement('img');
      cover.src = item.url;
      cover.alt = '';
      cover.style.setProperty('--offset', index - (items.length - 1) / 2);
      cover.style.setProperty('--index', index);
      container.append(cover);
    }
  }

  function celebrateMagazines() {
    showCovers(magazineFan, magazines.items);
    celebrate(magazineFinale, () => {
      magazinesCelebrated = true;
    });
    playCelebration();
  }
  function celebrateRoles() {
    options.goToStage();
    showCovers(rolesCelebration.querySelector('.role-gallery'), roles.entries);
    celebrate(rolesCelebration, () => showModal(roleFinale));
    playCelebration();
  }

  function rememberAchievement(value) {
    try { localStorage.setItem(ACHIEVEMENT_KEY, value); } catch {}
  }
  try {
    const saved = localStorage.getItem(ACHIEVEMENT_KEY);
    if (saved === 'complete' || saved === 'record-pending' || saved === 'record') {
      record.unlock(saved !== 'complete');
      showAchievement(saved === 'record');
      achievementPending = saved === 'record-pending';
    }
  } catch {}
  function showAchievement(claimed) {
    achievementBadge.hidden = false;
    achievementBadge.disabled = !claimed;
    achievementBadge.setAttribute('aria-label', claimed ? '全成就，查看花房留影' : '全成就');
  }

  function finishRecord() {
    achievementPending = false;
    celebrate(achievementCelebration, () => {
      rememberAchievement('record');
      showAchievement(true);
      options.goToStage();
    }, 1900);
  }

  function cancelHold() {
    if (!hold) return;
    const { pointer, button, ring } = hold;
    hold = null;
    ring.style.strokeDashoffset = '100';
    button.classList.remove('holding');
    if (button === dogButton) dogHint.textContent = '长按 2 秒';
    if (pointer !== undefined && button.hasPointerCapture(pointer)) {
      button.releasePointerCapture(pointer);
    }
  }

  function startHold(button, input) {
    if (button.hidden || hold || (button === lightButton && !target)
      || (button === dogButton && (barkPlaying || barkNeedsTap))) return false;
    hold = { id: target?.id, start: performance.now(), button, ring: button.querySelector('.progress'), ...input };
    button.classList.add('holding');
    options.rewardSounds.unlock();
    return true;
  }

  function finishHold() {
    const greet = hold.button === dogButton && performance.now() - hold.start >= HOLD_MS
      && dogInReach(getPlayer()) && !dogButton.hidden && !modalOpen();
    cancelHold();
    if (greet) {
      if (!playDecodedBarks()) playMediaBarks();
    }
  }
  dogButton.addEventListener('contextmenu', event => event.preventDefault());
  dogButton.addEventListener('click', () => {
    if (!barkNeedsTap || barkPlaying || dogButton.hidden || !dogInReach(getPlayer()) || modalOpen()) return;
    options.rewardSounds.unlock();
    if (!playDecodedBarks()) playMediaBarks();
  });

  for (const button of [lightButton, dogButton]) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !startHold(button, { pointer: event.pointerId })) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointerup', event => {
      if (hold?.button === button && hold.pointer === event.pointerId) finishHold();
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => {
        if (hold?.button === button && hold.pointer === event.pointerId) cancelHold();
      });
    }
    button.addEventListener('keydown', event => {
      if (!HOLD_KEYS.includes(event.code)) return;
      event.preventDefault();
      if (!event.repeat) startHold(button, { key: event.code });
    });
    button.addEventListener('keyup', event => {
      if (hold?.button === button && hold.key === event.code) finishHold();
    });
    button.addEventListener('blur', () => {
      if (hold?.button === button) cancelHold();
    });
  }
  window.addEventListener('blur', cancelHold);
  document.addEventListener('visibilitychange', cancelHold);

  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.querySelector('.primary').onclick = () => {
    dialog.close();
    options.goToStage();
  };
  for (const button of roleDialog.querySelectorAll('button')) {
    button.onclick = () => roleDialog.close();
  }
  roleFinale.querySelector('button').onclick = () => roleFinale.close();
  function unlockRecord() {
    if (!record.unlocked) {
      record.unlock();
      rememberAchievement('complete');
    }
    showAchievement(record.claimed);
  }
  roleFinale.addEventListener('close', unlockRecord);
  record.ready.then(ready => {
    if (ready || !record.unlocked || record.claimed) return;
    options.toast('唱片暂未加载成功。可重新加载，已解锁的唱片会保留。');
  });
  recordFinale.querySelector('#continue-record').onclick = () => recordFinale.close();
  recordFinale.addEventListener('close', () => {
    if (!newRecord) return;
    newRecord = false;
    finishRecord();
  });
  achievementBadge.onclick = () => {
    if (!record.claimed || modalOpen()) return;
    options.openKeepsake();
    showModal(recordFinale);
  };

  function dogInReach(player) {
    return daimiUnlocked && options.artworkProgress('dog').percent === 100
      && Math.abs(player.y - dog.y) < .65
      && Math.hypot(player.x - dog.x, player.z - dog.z) < 1.45;
  }
  function barkEnded() {
    barkPlaying = false;
    if (!roleUnlocked) invitationPending = true;
  }

  function playDecodedBarks() {
    const sound = options.rewardSounds.play('barks');
    if (!sound) return false;
    barkPlaying = true;
    barkNeedsTap = false;
    dogHint.textContent = '长按 2 秒';
    barkPlays++;
    sound.addEventListener('ended', barkEnded, { once: true });
    return true;
  }

  function playMediaBarks() {
    barkPlaying = true;
    barkNeedsTap = false;
    let finished = false;
    const timer = setTimeout(failed, 6000);
    function cleanUp() {
      finished = true;
      clearTimeout(timer);
      barks.removeEventListener('ended', ended);
      barks.removeEventListener('error', failed);
    }
    function ended() {
      if (finished) return;
      cleanUp();
      barkEnded();
    }
    function failed() {
      if (finished) return;
      cleanUp();
      barks.pause();
      barkPlaying = false;
      barkNeedsTap = true;
      dogHint.textContent = '点按重试';
      options.toast('叫声暂未播放，请点按重试');
    }
    barks.addEventListener('ended', ended, { once: true });
    barks.addEventListener('error', failed, { once: true });
    try {
      if (barks.error) barks.load();
      barks.currentTime = 0;
      barks.play().then(() => {
        if (!finished) {
          barkPlays++;
          dogHint.textContent = '长按 2 秒';
        }
      }, failed);
    } catch { failed(); }
  }

  function unlockRoles() {
    if (roleUnlocked) return;
    roleUnlocked = true;
    rolePanel.hidden = false;
    document.body.classList.add('roles-unlocked');
    roles.show();
  }

  function completeForTesting() {
    cancelHold();
    target = null;
    lightButton.hidden = dogButton.hidden = true;
    invitationPending = barkNeedsTap = false;
    for (const magazine of magazines.items) magazines.light(magazine.id);
    count = magazines.items.filter(magazine => magazine.lit).length;
    counter.textContent = count;
    magazinesCelebrated = count === total;
    if (!daimiUnlocked) {
      daimiUnlocked = true;
      options.unlock();
    }
    unlockRoles();
    for (const role of roles.entries) roles.receive(role.id);
    roleCount = roles.entries.length;
    rolePanel.querySelector('b').textContent = roleCount;
    unlockRecord();
    options.goToStage();
  }

  function update(now, active) {
    if (!active || modalOpen()) {
      cancelHold();
      lightButton.hidden = dogButton.hidden = true;
      return modalOpen();
    }
    if (achievementPending) {
      finishRecord();
      return true;
    }
    if (!daimiUnlocked && magazinesCelebrated && options.heartsComplete()) {
      daimiUnlocked = true;
      options.unlock();
      dialog.querySelector('img').src = options.dogPhoto;
      lightButton.hidden = dogButton.hidden = true;
      showModal(dialog);
      return true;
    }
    if (invitationPending && !barkPlaying) {
      invitationPending = false;
      unlockRoles();
      dogButton.hidden = true;
      showModal(roleDialog);
      return true;
    }
    const player = getPlayer();
    const collectible = roleUnlocked ? roleInReach(roles.entries, player) : magazineInReach(magazines.items, player);
    const nearby = record.inReach(player) ? record : collectible;
    if (nearby !== target) {
      cancelHold();
      target = nearby;
      if (target) {
        portrait.src = target.url;
        title.textContent = target.date ? `${target.title} · ${target.date}` : target.title;
        const action = target === record ? '领取唱片' : roleUnlocked ? '领取' : '点亮';
        actionLabel.textContent = action;
        lightButton.setAttribute('aria-label', `长按两秒${target === record ? action : roleUnlocked ? '领取角色' : '点亮杂志'}`);
      }
    }
    lightButton.hidden = !target;
    dogButton.hidden = Boolean(target) || !dogInReach(player) || barkPlaying || invitationPending;
    if (hold?.button.hidden) cancelHold();
    if (!hold) return Boolean(target) || !dogButton.hidden;

    const progress = Math.max(0, Math.min(1, (now - hold.start) / HOLD_MS));
    hold.ring.style.strokeDashoffset = String(100 * (1 - progress));
    if (progress < 1) return true;
    if (hold.button === dogButton) {
      if (playDecodedBarks()) cancelHold();
      else dogHint.textContent = '松手播放';
      return true;
    }
    const { id } = hold;
    const { name, title: magazineTitle } = target;
    cancelHold();
    target = null;
    lightButton.hidden = true;
    if (id === record.id) {
      record.claim();
      newRecord = true;
      options.openKeepsake();
      options.rewardSounds.play('record');
      rememberAchievement('record-pending');
      showModal(recordFinale);
      playCelebration();
      return true;
    }
    if (roleUnlocked) {
      if (!roles.receive(id)) return true;
      options.rewardSounds.play('role');
      rolePanel.querySelector('b').textContent = ++roleCount;
      if (roleCount === roles.entries.length) celebrateRoles();
      else options.toast(`✦ 已领取 ${name}`);
      return true;
    }
    if (!magazines.light(id)) return true;
    options.rewardSounds.play('magazine');
    counter.textContent = ++count;
    if (count === total) {
      celebrateMagazines();
    } else if (count === total - 1) {
      options.toast('✦ 还差 1 本，打开导览可查看位置');
    } else {
      options.toast(`✦ 已点亮 ${magazineTitle}`);
    }
    return true;
  }

  return {
    update,
    completeForTesting,
    get open() { return modalOpen(); },
    get count() { return count; },
    get barkPlays() { return barkPlays; },
    get roleUnlocked() { return roleUnlocked; },
  };
}
