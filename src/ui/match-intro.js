import { logoImage } from './club-logo.js';
import { escapeHtml } from './html.js';

const arenaUrl = new URL('../../Image/경기장.png', import.meta.url).href;

export function showMatchIntro(home, away) {
  const dialog = document.createElement('dialog');
  dialog.className = 'match-intro';
  dialog.setAttribute('aria-label', `${home.name} 대 ${away.name} 공식 경기 시작`);
  const team = club => `<div class="match-intro-team">${logoImage(club.logoId).replace('loading="lazy"', 'loading="eager"')}<strong>${escapeHtml(club.name)}</strong></div>`;
  dialog.innerHTML = `<div class="match-intro-stage"><img class="match-intro-arena" src="${arenaUrl}" alt="" decoding="async" /><div class="match-intro-board">${team(home)}<span class="match-intro-vs">VS</span>${team(away)}</div></div><button type="button" class="match-intro-skip" autofocus>ESC 또는 클릭으로 건너뛰기 · 3초 후 경기 시작</button>`;

  return new Promise(resolve => {
    let timer = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      dialog.removeEventListener('click', finish);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', finish);
      if (dialog.open) dialog.close();
      if (globalThis.CSS?.supports('transition-behavior', 'allow-discrete')) setTimeout(() => dialog.remove(), 140); else dialog.remove();
      resolve();
    };
    const onCancel = event => { event.preventDefault(); finish(); };
    dialog.addEventListener('click', finish);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', finish);
    // 공식 경기 시작 저장 중 앱이 inert여도 스킵 입력을 받을 수 있게 바깥에 배치한다.
    document.body.append(dialog);
    try {
      dialog.showModal();
      timer = setTimeout(finish, 3000);
    } catch { finish(); }
  });
}
