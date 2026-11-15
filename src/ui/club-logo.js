import { CLUB_LOGOS, clubLogo } from '../data/club-logos.js';
import { escapeHtml } from './html.js';

export function logoImage(id, className = 'team-logo') {
  const logo = clubLogo(id);
  return logo ? `<img class="${className}" src="${escapeHtml(logo.url)}" alt="" width="48" height="48" loading="lazy" decoding="async" />` : '';
}

export function logoPicker(selectedId) {
  return `<fieldset class="logo-picker"><legend>구단 로고 선택</legend><div class="logo-options-scroll" role="region" aria-label="구단 로고 목록" tabindex="0">${[...new Set(CLUB_LOGOS.map(logo => logo.kind))].map((kind, index) => {
    const logos = CLUB_LOGOS.filter(logo => logo.kind === kind);
    return `<div class="logo-group"><div class="logo-options">${logos.map(logo => {
      const label = `로고 ${index + 1} · ${logo.label.split(' / ')[1]}`;
      return `<label class="logo-option" title="${label}"><input type="radio" name="clubLogo" form="club-form" value="${logo.id}"${logo.id === selectedId ? ' checked' : ''} required /><span>${logoImage(logo.id)}<span class="sr-only">${label}</span></span></label>`;
    }).join('')}</div></div>`;
  }).join('')}</div></fieldset>`;
}
