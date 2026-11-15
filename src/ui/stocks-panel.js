import { STOCKS, stockPrice, stockTradingIssue, stockHistoryRows } from '../game/stocks.js';
import { stockNewsText } from '../game/stock-news.js';
import { escapeHtml } from './html.js';

const money = cents => {
  const value = BigInt(cents), absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}$${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`;
};
export function stocksPanel(club) {
  const market = club.stocks, issue = stockTradingIssue(club);
  const value = STOCKS.reduce((sum, stock) => sum + BigInt(stockPrice(market, stock.id)) * BigInt(market.positions[stock.id].quantity) * 100n, 0n);
  const basis = STOCKS.reduce((sum, stock) => sum + BigInt(market.positions[stock.id].costBasisCents), 0n);
  const rows = stockHistoryRows(market), previous = rows.at(-2);
  return `<section class="sponsor-contracts stock-market" aria-labelledby="stocks-title">
    <h3 id="stocks-title" tabindex="-1">주식 투자</h3><div class="world-summary"><span class="tag">평가액 ${money(value)}</span><span class="tag muted-tag">평가손익 ${money(value - basis)}</span><span class="tag muted-tag">누적 실현손익 ${money(market.realizedProfitCents)}</span></div>
    ${issue ? `<p role="status">${issue}</p>` : ''}<p data-description="주식 거래 규칙">새 주 시작에 거래할 수 있습니다. 매수·매도 수수료 각각 1%($1 단위 올림) · 정수 1주부터 거래 · 보유 자금으로만 매수</p>
    <div class="table-scroll" role="region" aria-label="주식 보유·거래" tabindex="0"><table class="stock-holdings-table"><thead><tr><th scope="col">종목</th><th scope="col">현재 주가·등락률</th><th scope="col">보유·평균 매입가</th><th scope="col">평가손익</th><th scope="col">수량·거래</th></tr></thead><tbody>${STOCKS.map(stock => {
      const price = stockPrice(market, stock.id), held = market.positions[stock.id];
      const prior = previous?.prices[stock.id], change = prior ? (price - prior) / prior * 100 : 0;
      const profit = BigInt(price) * BigInt(held.quantity) * 100n - BigInt(held.costBasisCents);
      return `<tr><th scope="row"><button type="button" class="stock-name-button" data-action="open-stock-chart" data-stock-id="${stock.id}" aria-label="${stock.name} 최근 4주 그래프">${stock.name} ↗</button><br><small>${stock.sector} · 변동률 ±${stock.range}%</small></th><td data-label="현재 주가·등락률">${money(BigInt(price) * 100n)}<br><small>${change > 0 ? '+' : ''}${change.toFixed(2)}%</small></td><td data-label="보유·평균 매입가">${held.quantity.toLocaleString('en-US')}주<br><small>평균 ${held.quantity ? money(Math.round(held.costBasisCents / held.quantity)) : '—'}</small></td><td data-label="평가손익">${money(profit)}</td><td data-label="수량·거래"><div class="roster-actions"><input type="number" class="stock-quantity" data-stock-quantity min="1" step="1" value="1" aria-label="${stock.name} 거래 수량"><button class="button secondary" data-action="buy-stock" data-stock-id="${stock.id}" ${issue || club.balance < price + Math.ceil(price / 100) ? 'disabled' : ''}>매수</button><button class="button secondary" data-action="sell-stock" data-stock-id="${stock.id}" ${issue || !held.quantity ? 'disabled' : ''}>매도</button><button class="button secondary" data-action="sell-all-stock" data-stock-id="${stock.id}" ${issue || !held.quantity ? 'disabled' : ''}>전량 매도</button></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p data-description="주가와 손익 계산">주간 정산 날짜에 종목별 가격을 추첨한 뒤 $1 단위로 반올림합니다(최저 $1). 반올림으로 실제 등락률은 추첨 범위와 조금 다를 수 있습니다. 평균 매입가는 매수 수수료를 포함하며 부분 매도 원가는 평균 원가로 배분합니다. 평가손익은 예상 매도 수수료를 제외한 값이고 실현손익은 매도 수수료를 반영합니다.</p>
    <section class="stock-information" data-description-scope aria-labelledby="stock-information-title"><h4 id="stock-information-title">정보</h4><p data-description="시장 소식">이번 시장 소식입니다. 다음 주 가격에 영향을 줄 수 있지만 실제 흐름은 다를 수 있습니다.</p><ul>${STOCKS.map(stock => `<li><strong>${stock.name}</strong><p>${escapeHtml(stockNewsText(market, stock.id))}</p></li>`).join('')}</ul></section>
    <details><summary>최근 12주 가격</summary><div class="table-scroll" role="region" aria-label="최근 12주 주가" tabindex="0"><table class="stock-history-table"><thead><tr><th scope="col">시점</th>${STOCKS.map(stock => `<th scope="col">${stock.name}</th>`).join('')}</tr></thead><tbody>${[...rows].reverse().map(entry => `<tr><th scope="row">${entry.label}${entry.reference ? ' · 참고' : ''}</th>${STOCKS.map(stock => `<td data-label="${stock.name}">${money(BigInt(entry.prices[stock.id]) * 100n)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    <details><summary>최근 거래 (${market.trades.length}건)</summary>${market.trades.length ? `<ol>${[...market.trades].reverse().map(entry => `<li>${Math.floor((entry.day - 1) / 7) + 1}주 차 · ${STOCKS.find(stock => stock.id === entry.stockId).name} ${entry.quantity.toLocaleString('en-US')}주 ${entry.kind === 'buy' ? '매수' : '매도'} · 주당 ${money(BigInt(entry.price) * 100n)} · 수수료 ${money(BigInt(entry.fee) * 100n)}${entry.kind === 'sell' ? ` · 실현손익 ${money(entry.profitCents)}` : ''}</li>`).join('')}</ol>` : '<p>아직 거래 내역이 없습니다.</p>'}</details>
    <p data-description="주식 평가액과 구단 해체">주식 평가액은 운영 자금에 포함되지 않습니다. 주식을 보유해도 자금이 -$10,000 이하면 구단이 해체되고 주식 거래도 종료됩니다. 변경 후 구단 저장으로 보관하세요.</p></section><dialog id="stock-chart-dialog" class="stock-chart-dialog" aria-labelledby="stock-chart-title"></dialog>`;
}
