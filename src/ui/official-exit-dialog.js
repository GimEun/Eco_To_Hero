export function confirmOfficialExit(playoff = false, winsNeeded = 2) {
  const dialog = document.createElement('dialog');
  dialog.className = 'club-replacement-dialog';
  dialog.setAttribute('aria-labelledby', 'official-exit-title');
  dialog.innerHTML = `<form method="dialog"><div class="club-replacement-heading"><span class="tag muted-tag">OFFICIAL MATCH</span><h2 id="official-exit-title">경기에서 나갈까요?</h2></div><p class="club-replacement-notice">${playoff ? `지금 나가면 BO${winsNeeded*2-1} 시리즈 기권패입니다. 이미 이긴 맵은 유지하고 상대가 ${winsNeeded}승이 될 때까지 남은 맵을 0:13으로 처리합니다.` : '지금 나가면 0:13 기권패로 처리됩니다.'} 경기 중간 저장은 지원하지 않습니다.</p><div class="club-replacement-actions"><button class="button secondary" value="no" autofocus>아니오 · 경기 유지</button><button class="button primary" value="yes">예 · 기권하고 나가기</button></div></form>`;
  return new Promise((resolve, reject) => {
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close('no'); });
    dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'yes'; if (globalThis.CSS?.supports('transition-behavior', 'allow-discrete')) setTimeout(() => dialog.remove(), 140); else dialog.remove(); resolve(confirmed); }, { once: true });
    document.body.append(dialog);
    try { dialog.showModal(); } catch (error) { dialog.remove(); reject(error); }
  });
}
