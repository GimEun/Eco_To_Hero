import { escapeHtml } from './html.js';

export function confirmClubReplacement({ currentClubName, savedClubName, nextClubName, canSave = true, mode = 'new' }) {
  const loading = mode === 'load';
  const dialog = document.createElement('dialog');
  dialog.className = 'club-replacement-dialog';
  dialog.setAttribute('aria-labelledby', 'club-replacement-title');
  dialog.setAttribute('aria-describedby', 'club-replacement-description');
  dialog.innerHTML = `<form method="dialog">
    <div class="club-replacement-heading"><span class="tag muted-tag">${loading ? 'CONTINUE YOUR CLUB' : 'NEW CHAPTER'}</span><h2 id="club-replacement-title">${loading ? '저장된 구단을 불러올까요?' : '새 구단으로 시작할까요?'}</h2><p data-description="구단 교체 확인">${loading ? '현재 구단과 이어서 운영할 구단을 확인하세요.' : '지금까지 운영한 구단과 교체할 구단을 확인하세요.'}</p></div>
    <dl class="club-replacement-teams">
      ${currentClubName ? `<div><dt>현재 구단</dt><dd>${escapeHtml(currentClubName)}</dd></div>` : ''}
      ${!loading && savedClubName ? `<div><dt>저장된 구단</dt><dd>${escapeHtml(savedClubName)}</dd></div>` : ''}
      <div class="club-replacement-next"><dt>${loading ? '불러올 구단' : '새로 시작할 구단'}</dt><dd>${escapeHtml(nextClubName)}</dd></div>
    </dl>
    <p id="club-replacement-description" class="club-replacement-notice" data-description="구단 교체와 저장">${loading
      ? '현재 창의 구단을 저장된 구단으로 교체합니다. 저장하지 않은 진행 내용은 사라집니다.'
      : canSave
      ? '시작하면 기존 저장 슬롯을 새 구단으로 덮어씁니다. 보관할 구단은 취소 후 JSON 백업을 먼저 내려받아 주세요.'
      : '저장소를 읽지 못해 현재 창의 구단만 교체합니다. 기존 저장은 변경하지 않습니다.'}</p>
    <div class="club-replacement-actions"><button class="button secondary" value="cancel" autofocus>취소 · ${loading ? '현재' : '기존'} 구단 유지</button><button class="button primary" value="replace">${loading ? '저장된 구단 이어하기' : '새 구단으로 시작'} →</button></div>
  </form>`;

  return new Promise((resolve, reject) => {
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close('cancel'); });
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'replace';
      if (globalThis.CSS?.supports('transition-behavior', 'allow-discrete')) setTimeout(() => dialog.remove(), 140); else dialog.remove();
      resolve(confirmed);
    }, { once: true });
    // 저장 작업 중 #app은 inert 상태이므로 모달은 바깥에 배치한다.
    document.body.append(dialog);
    try { dialog.showModal(); }
    catch (error) { dialog.remove(); reject(error); }
  });
}
