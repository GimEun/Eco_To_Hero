import { STOCKS, stockHistoryRows } from '../game/stocks.js';
import { escapeHtml } from './html.js';

export function stockChartContent(market, stockId) {
  const stock = STOCKS.find(item => item.id === stockId);
  if (!stock) return null;
  const rows = stockHistoryRows(market).slice(-4);
  const prices = rows.map(row => row.prices[stockId]);
  const low = Math.min(...prices), high = Math.max(...prices);
  const points = prices.map((price, index) => ({ x: 55 + index * 150, y: high === low ? 110 : 180 - (price - low) / (high - low) * 140 }));
  return `<div class="stock-chart-heading"><div><p class="eyebrow">RECENT 4 WEEKS</p><h2 id="stock-chart-title">${escapeHtml(stock.name)} · 최근 4주</h2></div><form method="dialog"><button type="submit" class="button secondary" autofocus>닫기</button></form></div>
    <svg class="stock-chart" viewBox="0 0 560 230" role="img" aria-label="${escapeHtml(stock.name)} 최근 4주 가격 그래프">
      <line x1="35" y1="190" x2="525" y2="190" class="stock-chart-grid"/><line x1="35" y1="110" x2="525" y2="110" class="stock-chart-grid"/>
      <polyline points="${points.map(point => `${point.x},${point.y.toFixed(2)}`).join(' ')}" class="stock-chart-line"/>
      ${points.map((point, index) => `<circle cx="${point.x}" cy="${point.y.toFixed(2)}" r="5" class="stock-chart-dot"/><text x="${point.x}" y="${(point.y - 13).toFixed(2)}" text-anchor="middle">$${prices[index].toLocaleString('en-US')}</text><text x="${point.x}" y="218" text-anchor="middle">${rows[index].label}</text>`).join('')}
    </svg><div class="stock-chart-prices">${rows.map((row, index) => `<div><small>${row.label}${row.reference ? ' · 참고' : ''}</small><strong>$${prices[index].toLocaleString('en-US')}</strong></div>`).join('')}</div>
    ${rows.some(row => row.reference) ? '<p class="input-hint" data-description="참고 가격">창단 전 참고 시장 가격이 포함되어 있습니다.</p>' : ''}`;
}
export function openStockChart(dialog, market, stockId) {
  const markup = stockChartContent(market, stockId);
  if (!dialog || !markup) return false;
  dialog.innerHTML = markup;
  if (!dialog.open) dialog.showModal();
  return true;
}
