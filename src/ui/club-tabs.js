export const CLUB_TABS = Object.freeze([
  { id: 'roster', label: '명단', heading: '#roster-title' },
  { id: 'development', label: '육성', heading: '#experience-title' },
  { id: 'contracts', label: '계약', heading: '#contracts-title' },
  { id: 'finance', label: '재정·스폰서', heading: '#finance-title' },
  { id: 'coaches', label: '코치', heading: '#coaches-title' },
  { id: 'facilities', label: '시설', heading: '#facilities-title' },
  { id: 'events', label: '이벤트', heading: '#player-events-title' },
]);
export function clubTabForFocus(selector, current = 'roster') {
  if (selector === '#stocks-title') return 'finance';
  return CLUB_TABS.find(tab => tab.heading === selector)?.id
    ?? (CLUB_TABS.some(tab => tab.id === current) ? current : 'roster');
}
export function clubTabsMarkup(active) {
  return `<div class="club-tab-list" role="tablist" aria-label="내 구단 관리">${CLUB_TABS.map(tab => `<button type="button" class="club-tab" role="tab" id="club-tab-${tab.id}" data-club-tab="${tab.id}" aria-controls="club-panel-${tab.id}" aria-selected="${tab.id === active}" tabindex="${tab.id === active ? 0 : -1}">${tab.label}</button>`).join('')}</div>`;
}
export function clubTabPanel(id, markup, active) {
  return `<div class="club-tab-panel" id="club-panel-${id}" role="tabpanel" aria-labelledby="club-tab-${id}" data-club-panel="${id}" tabindex="0" ${id === active ? '' : 'hidden'}>${markup}</div>`;
}
export function mountClubTabs(screen, onChange = () => {}) {
  mountTabs(screen, '[data-club-tab]', button => onChange(button.dataset.clubTab));
}

export function mountTabs(screen, selector, onChange) {
  const buttons = [...screen.querySelectorAll(selector)];
  const panels = buttons.map(button => screen.querySelector(`#${button.getAttribute('aria-controls')}`));
  function select(selected, focus = false) {
    buttons.forEach((button, index) => {
      const active = button === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      panels[index].hidden = !active;
    });
    if (focus) selected.focus({ preventScroll: true });
    onChange(selected);
  }
  screen.addEventListener('click', event => {
    const button = event.target.closest(selector);
    if (buttons.includes(button)) select(button);
  });
  screen.addEventListener('keydown', event => {
    const index = buttons.indexOf(event.target.closest(selector));
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    select(buttons[next], true);
  });
}
