import {startNextYear} from './game/season-years.js';
import { availableCounsels,answerCounseling } from './game/counseling.js';
import { openCounselingDialog } from './ui/counseling-dialog.js';
import { activeYearAdvance, beginYearAdvance, cancelYearAdvance, yearAdvanceIssue } from './game/year-advance.js';
import { runYearAdvance } from './game/run-year-advance.js';
import { showYearAdvanceProgress } from './ui/year-advance-panel.js';
import { GAME } from './config/game.js';
import { createClub } from './game/create-club.js';
import { menuScreen, newGameScreen, createClubScreen, clubScreen } from './ui/screens.js';
import { createSave, validateSave, restoreWorld, parseBackup, serializeBackup, MAX_BACKUP_BYTES, SCHEMA_VERSION } from './storage/save-data.js';
import { recruitPlayer, releasePlayer, replaceStarter } from './game/roster.js';
import { renewContract } from './game/contracts.js';
import { createWorld } from './game/create-world.js';
import { CLUB_LOGOS } from './data/club-logos.js';
import { PLAYER_IDENTITY_VERSION } from './game/player-identities.js';
import { CLUB_IDENTITY_VERSION } from './game/club-names.js';
import { advanceWeek } from './game/calendar.js';
import { negotiateTransfer, sellPlayer } from './game/transfers.js';
import { selectWeeklyActions } from './game/training.js';
import { TRAINING_SKILLS, TRAINING_LABELS } from './config/training.js';
import { beginTeamTraining } from './game/team-training.js';
import { pendingPlayerEvent, resolvePlayerEvent } from './game/player-events.js';
import { getClubView } from './game/world-selectors.js';
import { worldScreen, playersScreen } from './ui/world-screens.js';
import { seasonScreen } from './ui/season-screen.js';
import { beginOfficialMatch, nextOfficialFixture, createOfficialPractice, finishOfficialWeek, advanceAiTiebreaks, advanceAiPlayoffs } from './game/official-match.js';
import { findOfficialFixture, officialSeason } from './game/pc-season.js';
import { enterCitySeason } from './game/city-season.js';
import { enterDomesticSeason,selectDomesticMap } from './game/domestic-season.js';
import { enterWorldGroups,selectWorldMap } from './game/world-groups.js';
import { enterWorldRanked } from './game/world-ranked.js';
import { confirmOfficialExit } from './ui/official-exit-dialog.js';
import { showMatchIntro } from './ui/match-intro.js';
import { officialWeekStatus } from './game/weekly-official.js';
import { practiceScreen, mountPractice } from './ui/practice-screen.js';
import { readSavedGame, writeSavedGame } from './storage/save-store.js';
import { confirmClubReplacement } from './ui/club-replacement-dialog.js';
import { signSponsor } from './game/sponsors.js';
import { changeCoach } from './game/coaches.js';
import { upgradeFacility } from './game/facilities.js';
import { clubTabForFocus } from './ui/club-tabs.js';
import { mountFinanceSections } from './ui/finance-panel.js';
import { bankruptcyIssue } from './game/bankruptcy.js';
import { changeLoan } from './game/loans.js';
import { tradeStock } from './game/stocks.js';
import { openStockChart } from './ui/stock-chart.js';
import { mountDescriptionNotes } from './ui/description-notes.js';
import './styles.css';

const app = document.querySelector('#app');
let world = null;
let seasonYearView = null;
let selectedLeague = 'pc';
let selectedClubId = null;
let playerPage = 0;
let playerSort = 'default';
let playerSortDirection = 'asc';
let draftName = '';
let draftLogoId = CLUB_LOGOS[0].id;
let currentScreen = 'menu';
let selectedClubTab = 'roster';
let selectedFinanceSection = 'sponsors';
let savedEntry = null;
let loadedRevision = null;
let busy = false;
let isSaved = false;
let storageChecked = false;
let disposePractice = null;
let officialFixture = null;
let officialScore = null;
let officialSettlement = null;
let counselDialog = null;
let weeklyActionPurpose = 'week';

const yieldMatchWork = () => new Promise(resolve => setTimeout(resolve, 0));

async function persistOfficial(candidate) {
  const entry = await writeSavedGame(createSave(candidate), loadedRevision);
  world = candidate;
  savedEntry = entry;
  loadedRevision = entry.revision;
  isSaved = true;
}

async function saveStrategyLibrary(library) {
  if (busy) throw new Error('다른 저장 작업이 끝난 뒤 다시 보관하세요.');
  setBusy(true);
  try {
    const candidate = structuredClone(world);
    candidate.strategyLibrary = library;
    const entry = await writeSavedGame(createSave(candidate), loadedRevision);
    // 관전·훈련 화면이 참조하는 세계 객체를 유지한다.
    world.strategyLibrary = library;
    savedEntry = entry; loadedRevision = entry.revision; isSaved = true;
  } finally { setBusy(false); }
}

async function progressYearAdvance() {
  let cancelled = false;
  let failure = null;
  const progress = showYearAdvanceProgress(() => { cancelled = true; });
  progress.update(world);
  try {
    await runYearAdvance(world, { commit: persistOfficial, cancelled: () => cancelled,
      onCheckpoint: async saved => { progress.update(saved); await yieldMatchWork(); } });
  } catch (error) {
    failure = error;
  } finally {
    progress.close();
    render(world.teamTraining?.status === 'pending' ? 'practice' : 'club');
  }
  if (failure) showYearAdvanceError(failure);
}

function showYearAdvanceError(error) {
  const message = document.createElement('p');
  message.className = 'input-hint';
  message.setAttribute('role', 'alert');
  message.textContent = `자동 저장을 완료하지 못해 진행을 멈췄습니다. ${error.message || '저장 공간을 확인하세요.'} 마지막 저장 이후의 주간 계산은 반영하지 않았습니다.`;
  main.prepend(message);
}

async function settleOfficial(score = officialScore, forfeit = false) {
  if (officialSettlement) return officialSettlement;
  if (!(world && officialSeason(world).activeMatchId)) return;
  officialScore = score;
  setBusy(true);
  officialSettlement = (async () => {
    const candidate = await finishOfficialWeek(world, { score, forfeit, yieldWork: yieldMatchWork });
    await persistOfficial(candidate);
    const active = findOfficialFixture(officialSeason(candidate), officialSeason(candidate).activeMatchId);
    if (['playoff','city','province','national','world','world-final'].includes(active?.kind) && active.awaitingNextMap) {
      officialScore = null;
      const view = createOfficialPractice(candidate, active);
      return { nextMap: true, notice: `${view.seriesLength===5?'BO5':'BO3'} ${view.seriesScore.home}:${view.seriesScore.away} · 다음 맵으로 계속하세요. 중도 이탈은 시리즈 기권패입니다.` };
    }
    return {notice:officialWeekStatus(candidate).phase === 'settling' ? officialWeekStatus(candidate).message : '',counselCount:availableCounsels(candidate).length};
  })();
  try { return await officialSettlement; }
  finally { officialSettlement = null; setBusy(false); }
}

async function startOfficial() {
  const fixture = nextOfficialFixture(world);
  if (!fixture) return;
  const candidate = structuredClone(world);
  beginOfficialMatch(candidate, fixture.id);
  await persistOfficial(candidate);
  officialFixture = findOfficialFixture(officialSeason(world), fixture.id);
  officialScore = null;
  const match = createOfficialPractice(world, officialFixture);
  await showMatchIntro(match.home, match.away);
  render('official');
}

function openCounseling(id=null) {
  if(!world || bankruptcyIssue(world))return;
  if(counselDialog?.isConnected && counselDialog.open)return counselDialog;
  const trigger=document.activeElement;
  const dialog=openCounselingDialog({getWorld:()=>world,id,required:availableCounsels(world).length>0,
    onAnswer:async(counselId,choiceId)=>{
      if(busy)throw new Error('다른 저장 작업이 끝난 뒤 다시 선택해 주세요.');
      setBusy(true);
      try {
        const candidate=structuredClone(world),result=answerCounseling(candidate,counselId,choiceId);
        if(!result.ok)throw new Error(result.message);
        await persistOfficial(candidate);
      } finally {setBusy(false);}
    },
    onClub:()=>render('club','#experience-title'),
    onClose:()=>{
      if(currentScreen==='club'){render('club','#experience-title');return;}
      if(currentScreen==='official') {
        const button=main.querySelector('.practice-result-buttons [data-action="open-counseling"]'),count=availableCounsels(world).length;
        if(button){button.hidden=!count;button.textContent=`선수 상담 ${count}건`;}
      }
      if(trigger?.isConnected && !trigger.hidden)trigger.focus({preventScroll:true});
      else main.querySelector('.practice-result-buttons [data-action="club"]')?.focus({preventScroll:true});
    },
  });
  counselDialog=dialog;
  dialog?.addEventListener('close',()=>{if(counselDialog===dialog)counselDialog=null;},{once:true});
  return dialog;
}

function requirePendingCounseling() {
  if(!world || bankruptcyIssue(world) || !availableCounsels(world).length)return false;
  openCounseling();
  return true;
}

window.addEventListener('beforeunload', event => {
  if (!(world && officialSeason(world).activeMatchId)) return;
  event.preventDefault();
  event.returnValue = '';
});

app.innerHTML = `
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-identity"><button class="brand-mark" data-action="menu" aria-label="ETH 메인 메뉴">ETH</button><span>구단 운영실</span></div>
      <div class="sidebar-section">구단 관리</div>
      <nav aria-label="주 메뉴">
        <button class="nav-button" data-action="menu"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg><span>메인 메뉴</span></button>
        <button class="nav-button" data-action="club" disabled><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 7v6c0 4 9 8 9 8s9-4 9-8V7Z"/><path d="m8 12 3 3 5-6"/></svg><span>내 구단</span></button>
        <button class="nav-button" data-action="world" disabled><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg><span>리그·구단</span></button>
        <button class="nav-button" data-action="season" disabled><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2"/></svg><span>정규 시즌</span></button>
        <button class="nav-button" data-action="players" disabled><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m3-17a3 3 0 0 1 0 6m0 5a5 5 0 0 1 3 4v2"/></svg><span>선수 영입</span></button>
        <button class="nav-button" data-action="practice" disabled><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg><span>팀 연습</span></button>
      </nav>
      <div class="sidebar-bottom"><span class="status-dot" aria-hidden="true"></span>싱글플레이<small>경영 · 육성 · 전술</small></div>
    </aside>
    <div class="workspace"><header class="topbar"><div><span class="brand-title"></span><span class="brand-subtitle"></span></div><span class="build-label">구단 경영 <span>v0.1</span></span></header><main id="main-content" tabindex="-1"></main><footer class="footer"><span data-description="저장 방식">이 브라우저에 저장 · JSON 백업 지원</span></footer></div>
  </div>
  <input id="backup-file" type="file" accept=".json,application/json" hidden aria-label="JSON 백업 파일 선택" />
`;
app.querySelector('.brand-title').textContent = GAME.title;
app.querySelector('.brand-subtitle').textContent = GAME.subtitle;
const main = app.querySelector('#main-content');
const fileInput = app.querySelector('#backup-file');
mountDescriptionNotes(document.body);

let noticeTimer = null;
function notify(message, error = false) {
  if (error) console.error(message);
  clearTimeout(noticeTimer);
  document.querySelector('.game-notice')?.remove();
  const notice = document.createElement('aside');
  notice.className = `game-notice${error ? ' is-error' : ''}`;
  notice.setAttribute('role', error ? 'alert' : 'status');
  const text = document.createElement('p');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-button';
  close.textContent = '닫기';
  close.setAttribute('aria-label', '구단 알림 닫기');
  const dismiss = () => {
    clearTimeout(noticeTimer);
    notice.dataset.closing = 'true';
    noticeTimer = setTimeout(() => notice.remove(), 120);
  };
  close.addEventListener('click', dismiss);
  notice.append(text, close);
  document.body.append(notice);
  noticeTimer = error ? null : setTimeout(dismiss, 6000);
}

function savedName(entry) {
  try {
    const data = validateSave(entry.data);
    return data.schemaVersion === 1 ? data.club.name : getClubView(data.world).name;
  }
  catch { return '검증할 수 없는 저장'; }
}

function setBusy(value) {
  busy = value;
  app.inert = value;
  app.setAttribute('aria-busy', String(value));
}

async function runOperation(operation) {
  if (busy) return;
  setBusy(true);
  try { await operation(); }
  catch (error) { notify(error.message || '작업을 완료하지 못했습니다.', true); }
  finally {
    setBusy(false);
    if(!requirePendingCounseling())(main.querySelector('#club-name') ?? main.querySelector('h1'))?.focus({ preventScroll: true });
  }
}

function render(screenName, focusSelector = null) {
  disposePractice?.();
  disposePractice = null;
  const club = getClubView(world);
  if (world && bankruptcyIssue(world) && ['club', 'world', 'season', 'players', 'practice'].includes(screenName)) screenName = 'club';
  currentScreen = screenName;
  let screen;
  switch (screenName) {
    case 'new-game': screen = newGameScreen(); break;
    case 'create-club': screen = createClubScreen(draftName, Boolean(club), draftLogoId); break;
    case 'club':
      selectedClubTab = clubTabForFocus(focusSelector, selectedClubTab);
      if (focusSelector === '#stocks-title') selectedFinanceSection = 'stocks';
      screen = club ? clubScreen(club, isSaved, world, { activeTab: selectedClubTab, financeSection: selectedFinanceSection, onTabChange: tab => { selectedClubTab = tab; } }) : menuScreen(false, savedEntry ? savedName(savedEntry) : null, storageChecked);
      break;
    case 'world': screen = worldScreen(world, selectedLeague, selectedClubId); break;
    case 'season': screen = seasonScreen(world,seasonYearView); break;
    case 'players': screen = playersScreen(world, playerPage, playerSort, playerSortDirection); break;
    case 'practice': case 'official': screen = practiceScreen(); break;
    default: screen = menuScreen(Boolean(club), savedEntry ? savedName(savedEntry) : null, storageChecked);
  }
  main.replaceChildren(screen);
  if (screenName === 'club' && world && activeYearAdvance(world)) {
    const next = screen.querySelector('[data-action="advance-week"]');
    if (next) {
      next.dataset.action = 'resume-year-advance';
      if (!pendingPlayerEvent(world) && world.teamTraining?.status !== 'pending') next.textContent = '연말 일정 계속 ▶';
    }
  }
  if (screenName === 'club' && club && !bankruptcyIssue(world)) mountFinanceSections(screen, id => { selectedFinanceSection = id; });
  if (screenName === 'practice') disposePractice = mountPractice(screen, world, { onStrategySave: saveStrategyLibrary, onTrainingReward: message => {
    isSaved = false;
    if (activeYearAdvance(world)) void runOperation(async () => {
      const candidate = structuredClone(world);
      candidate.yearAdvance.message = '팀 연습을 마쳤습니다. 내 구단에서 계속 진행을 눌러 일정을 재개하세요.';
      await persistOfficial(candidate);
    });
    notify(message);
  } });
  if (screenName === 'official') disposePractice = mountPractice(screen, world, {
    onStrategySave: saveStrategyLibrary,
    official: createOfficialPractice(world, officialFixture),
    onOfficialComplete: score => settleOfficial(score),
    onCounselingRequired: requirePendingCounseling,
  });
  document.title = `${GAME.title} · ${screenName === 'club' && club ? club.name : '구단 경영'}`;
  for (const button of app.querySelectorAll('.nav-button')) {
    const selected = button.dataset.action === (screenName === 'official' ? 'season' : ['club', 'world', 'season', 'players', 'practice'].includes(screenName) ? screenName : 'menu');
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    if (['club', 'world', 'season', 'players', 'practice'].includes(button.dataset.action)) button.disabled = !world;
  }
  const focusTarget = (focusSelector ? screen.querySelector(focusSelector) : null) ?? screen.querySelector('#club-name') ?? screen.querySelector('h1');
  focusTarget?.focus({ preventScroll: true });
  if (!focusSelector) window.scrollTo({ top: 0, behavior: 'instant' });
  if (screenName === 'club' && world && !bankruptcyIssue(world) && pendingPlayerEvent(world)) screen.querySelector('#player-event-dialog')?.showModal();
}

async function refreshSavedGame() {
  savedEntry = await readSavedGame();
  storageChecked = true;
  render(currentScreen);
}

async function confirmReplacement(nextClub, entry, canSave = true) {
  const club = getClubView(world);
  if (!club && !entry) return true;
  return confirmClubReplacement({ currentClubName: club?.name, savedClubName: entry ? savedName(entry) : null, nextClubName: nextClub.name, canSave });
}

function resetWorldNavigation() {
  seasonYearView=null;
  selectedClubTab = 'roster';
  selectedFinanceSection = 'sponsors';
  selectedLeague = 'pc';
  selectedClubId = world.playerClubId;
  playerPage = 0;
  playerSort = 'default';
  playerSortDirection = 'asc';
}

async function applyCandidate(nextWorld) {
  if (officialSeason(nextWorld).activeMatchId) nextWorld = await finishOfficialWeek(nextWorld, { forfeit: true, yieldWork: yieldMatchWork });
  const nextClub = getClubView(nextWorld);
  let readError = null;
  try { savedEntry = await readSavedGame(); storageChecked = true; }
  catch (error) { readError = error; storageChecked = false; }
  if (!(await confirmReplacement(nextClub, savedEntry, !readError))) { notify('구단 교체를 취소했습니다.'); return; }
  let saveError = readError;
  if (!readError) {
    try {
      savedEntry = await writeSavedGame(createSave(nextWorld), savedEntry?.revision ?? null);
      loadedRevision = savedEntry.revision;
    } catch (error) {
      if (error.name === 'SaveConflictError') throw error;
      saveError = error;
    }
  }
  world = nextWorld;
  resetWorldNavigation();
  isSaved = !saveError;
  if (saveError) loadedRevision = null;
  draftName = '';
  draftLogoId = CLUB_LOGOS[0].id;
  render('club');
  notify(saveError
    ? `${saveError.message} 현재 구단은 이 창에만 유지됩니다. 새로고침 전에 JSON 백업을 내려받아 주세요.`
    : `「${nextClub.name}」 구단과 58팀·600명의 세계를 이 브라우저에 저장했습니다.`, Boolean(saveError));
}

async function continueGame() {
  const club = getClubView(world);
  const entry = await readSavedGame();
  storageChecked = true;
  savedEntry = entry;
  if (!entry) { render('menu'); notify('저장된 구단이 없습니다. 새 게임을 시작해 주세요.'); return; }
  const data = validateSave(entry.data);
  const nextWorld = restoreWorld(data);
  const nextClub = getClubView(nextWorld);
  if (club && (!isSaved || loadedRevision !== entry.revision)
    && !(await confirmClubReplacement({ currentClubName: club.name, nextClubName: nextClub.name, mode: 'load' }))) return;
  world = nextWorld;
  resetWorldNavigation();
  loadedRevision = entry.revision;
  if (officialSeason(world).activeMatchId) {
    await persistOfficial(await finishOfficialWeek(world, { forfeit: true, yieldWork: yieldMatchWork }));
    render('season');
    return;
  }
  const identitiesUpdated = data.world?.playerIdentityVersion !== PLAYER_IDENTITY_VERSION;
  const clubNamesUpdated = data.world?.clubIdentityVersion !== CLUB_IDENTITY_VERSION;
  isSaved = entry.data.schemaVersion === SCHEMA_VERSION && !identitiesUpdated && !clubNamesUpdated;
  render('club');
  notify(entry.data.schemaVersion < 12
    ? entry.data.schemaVersion < 10
      ? `「${nextClub.name}」 구단과 세계를 불러왔습니다.`
      : entry.data.schemaVersion < 11
        ? '기존 구단 상태를 보존하고 행복도 70·빈 행동 기록으로 시작합니다. 과거 행동은 소급하지 않습니다. 구단 저장을 눌러 보관해 주세요.'
        : '기존 행복도·행동·능력·계약·재정을 보존하고 선수 이벤트를 추가했습니다. 과거 이벤트는 소급하지 않습니다. 구단 저장을 눌러 보관해 주세요.'
    : identitiesUpdated ? `선수 이름·닉네임을 갱신했습니다. 능력·소속·계약·자금은 유지됩니다. 구단 저장을 눌러 반영해 주세요.`
    : `「${nextClub.name}」 구단과 세계를 불러왔습니다.`);
}

async function saveCurrentClub() {
  const club = getClubView(world);
  if (!club) return;
  const entry = await readSavedGame();
  storageChecked = true;
  savedEntry = entry;
  if (entry && entry.revision !== loadedRevision && !(await confirmReplacement(club, entry))) return;
  try {
    savedEntry = await writeSavedGame(createSave(world), entry?.revision ?? null);
  } catch (error) {
    isSaved = false;
    render('club');
    throw error;
  }
  loadedRevision = savedEntry.revision;
  isSaved = true;
  render('club');
  notify(`「${club.name}」 구단을 저장했습니다.`);
}

function exportBackup() {
  if (!world) return;
  const source = serializeBackup(world);
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `eco-to-hero-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('JSON 백업 다운로드를 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.');
}

function progressWeeklySchedule(teamTraining, prefix = '') {
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const before = new Map(world.players.filter(player => club.playerIds.includes(player.id)).map(player => [player.id, TRAINING_SKILLS.map(skill => player[skill])]));
  const result = teamTraining ? beginTeamTraining(world, { events: true, official: true }) : advanceWeek(world, { events: true, official: true });
  if (result.advancedDays > 0 || result.ok || officialSeason(world).weekSchedule) isSaved = false;
  const target = teamTraining && result.ok ? 'practice' : ['ready', 'tiebreak', 'tiebreak-ai', 'playoff', 'playoff-ai'].includes(officialWeekStatus(world).phase) ? 'season' : 'club';
  render(target, target === 'club' ? '[data-action="advance-week"]' : null);
  if (!result.ok && !result.eventPending && !result.bankrupt && !result.officialPending && !result.tiebreakPending) notify(prefix + result.message, true);
  else if (!result.bankrupt) {
    const changes = world.players.filter(player => before.has(player.id)).flatMap(player => TRAINING_SKILLS.flatMap((skill, index) => {
      const previous = before.get(player.id)[index], delta = player[skill] - previous;
      return delta ? [`${player.nickname} · ${TRAINING_LABELS[skill].replace(' 훈련', '')} ${previous} → ${player[skill]} (${delta > 0 ? '+' : ''}${delta})`] : [];
    }));
    if (changes.length) notify(`선수 능력 변화 · ${changes.length}건\n${changes.slice(0, 6).join('\n')}${changes.length > 6 ? `\n외 ${changes.length - 6}건 · 육성 탭에서 확인` : ''}`);
  }
}

let exitDialogPending = false;
app.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled || currentScreen !== 'official' || !(world && officialSeason(world).activeMatchId)) return;
  if (button.dataset.action === 'next-playoff-map') return;
  event.stopImmediatePropagation();
  if (busy || exitDialogPending) return;
  const action = button.dataset.action;
  void (async () => {
    exitDialogPending = true;
    try {
      // 종료 후 저장 실패는 기권으로 덮지 않고 같은 종료 결과의 저장을 재시도한다.
      if (!officialScore && !(await confirmOfficialExit(['playoff','city','province','national','world','world-final'].includes(officialFixture?.kind),officialFixture?.kind==='world-final'?3:2))) return;
      await runOperation(async () => {
        const hadScore = Boolean(officialScore);
        await settleOfficial(officialScore, !officialScore);
        if (hadScore && ['playoff','city','province','national','world','world-final'].includes(officialFixture?.kind) && officialSeason(world).activeMatchId) {
          for (const next of main.querySelectorAll('[data-action="next-playoff-map"]')) next.hidden = false;
          if (!(await confirmOfficialExit(true,officialFixture?.kind==='world-final'?3:2))) return;
          await settleOfficial(null, true);
        }
        render(action);
      });
    } finally { exitDialogPending = false; }
  })().catch(error => notify(error.message, true));
}, true);

app.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (busy) return;
  if(requirePendingCounseling())return;
  if(action==='open-counseling'){openCounseling(button.dataset.counselId??null);return;}
  if (action === 'start-year-advance') {
    if (!world || yearAdvanceIssue(world)) return;
    render('club');
    weeklyActionPurpose = 'year';
    const dialog = main.querySelector('#weekly-action-dialog');
    dialog.querySelector('#training-title').textContent = '연말까지 반복할 선수 행동 선택';
    dialog.querySelector('[data-description="선수 행동 선택"]').textContent = '선택한 행동을 연말까지 반복합니다. 연속 행동 불이익도 적용합니다. 이벤트·팀 연습·계약 문제에서 멈추며, 해결 후 직접 계속 진행하세요. 매주 자동 저장하고 목표일에서 멈춥니다.';
    dialog.querySelector('[data-action="confirm-week"]').textContent = '선택 완료 · 연말까지 진행 ▶';
    dialog.showModal();
    return;
  }
  if (action === 'resume-year-advance') {
    if (!world || !activeYearAdvance(world)) return;
    if (pendingPlayerEvent(world)) { render('club'); return; }
    if (world.teamTraining?.status === 'pending') { render('practice'); return; }
    void runOperation(progressYearAdvance);
    return;
  }
  if (action === 'cancel-year-advance') {
    if (!world || !activeYearAdvance(world)) return;
    void runOperation(async () => {
      const candidate = structuredClone(world);
      cancelYearAdvance(candidate);
      await persistOfficial(candidate);
      render('club');
    });
    return;
  }
  if(action==='view-season-year') {
    seasonYearView=button.dataset.year==='current'?null:Number(button.dataset.year);render('season');return;
  }
  if(action==='start-next-year') {
    void runOperation(async()=>{const candidate=structuredClone(world);startNextYear(candidate);await persistOfficial(candidate);seasonYearView=null;render('season');});return;
  }
  if(action==='enter-city') {
    void runOperation(async()=>{const candidate=structuredClone(world);enterCitySeason(candidate);await persistOfficial(candidate);render('season');});
    return;
  }
  if(action==='enter-province' || action==='enter-national') {
    void runOperation(async()=>{const candidate=structuredClone(world);enterDomesticSeason(candidate,action==='enter-national'?'national':'province');await persistOfficial(candidate);render('season');});
    return;
  }
  if(action==='enter-world') {
    void runOperation(async()=>{const candidate=structuredClone(world);enterWorldGroups(candidate);await persistOfficial(candidate);render('season');});
    return;
  }
  if(action==='enter-world-ranked') {
    void runOperation(async()=>{const candidate=structuredClone(world);enterWorldRanked(candidate);await persistOfficial(candidate);render('season');});
    return;
  }
  if(action==='pick-world-map') {
    void runOperation(async()=>{const candidate=structuredClone(world);selectWorldMap(candidate,button.dataset.fixtureId,button.dataset.mapId);await persistOfficial(candidate);render('season');});
    return;
  }
  if(action==='pick-city-map' || action==='pick-domestic-map') {
    void runOperation(async()=>{const candidate=structuredClone(world);selectDomesticMap(candidate,button.dataset.fixtureId,button.dataset.mapId);await persistOfficial(candidate);render('season');});
    return;
  }
  if (action === 'recruitment-limits') {
    const dialog = main.querySelector('#recruitment-limits-dialog');
    if (dialog && !dialog.open) dialog.showModal();
    return;
  }
  if (action === 'advance-playoff-ai') {
    void runOperation(async () => { await persistOfficial(await advanceAiPlayoffs(world, { yieldWork: yieldMatchWork })); render('season'); });
    return;
  }
  if (action === 'next-playoff-map') {
    void runOperation(startOfficial);
    return;
  }
  if (action === 'advance-tiebreak-ai') {
    void runOperation(async () => {
      const status = main.querySelector('.official-status');
      if (status) status.textContent = 'AI 순위 결정전 계산·저장 중…';
      try { await persistOfficial(await advanceAiTiebreaks(world, { yieldWork: yieldMatchWork })); render('season'); }
      catch (error) { if (status) status.textContent = `결정전 진행 실패: ${error.message}`; throw error; }
    });
    return;
  }
  if (action === 'start-official') {
    void runOperation(async () => {
      try { await startOfficial(); }
      catch (error) {
        const status = main.querySelector('.official-status');
        if (status) status.textContent = `경기를 시작하지 못했습니다: ${error.message}`;
        throw error;
      }
    });
    return;
  }
  if (action === 'training-help') {
    const topic = button.dataset.helpTopic;
    if (['actions', 'growth', 'happiness', 'fatigue'].includes(topic)) {
      const dialog = main.querySelector(`#training-help-${topic}`);
      if (dialog && !dialog.open) dialog.showModal();
    }
    return;
  }
  if (action === 'continue') { void runOperation(continueGame); return; }
  if (action === 'save') { void runOperation(saveCurrentClub); return; }
  if (action === 'export') { void runOperation(exportBackup); return; }
  if (action === 'import') { fileInput.click(); return; }
  if (world && bankruptcyIssue(world) && !['menu', 'new-game', 'create-club', 'refresh-save', 'club', 'world', 'season', 'players', 'practice'].includes(action)) {
    render('club'); notify(bankruptcyIssue(world), true); return;
  }
  if (['borrow-loan', 'repay-loan', 'repay-all-loan'].includes(action)) {
    if (!world) return;
    const amount = action === 'repay-all-loan' ? getClubView(world).finance.loan.principal : Number(main.querySelector('#loan-amount')?.value);
    const result = changeLoan(world, action === 'borrow-loan' ? 'borrow' : 'repay', amount);
    if (result.ok) { isSaved = false; render('club', '#finance-title'); }
    notify(result.message + (result.ok ? ' · 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (['buy-stock', 'sell-stock', 'sell-all-stock'].includes(action)) {
    if (!world) return;
    const quantity = action === 'sell-all-stock' ? world.stocks.positions[button.dataset.stockId]?.quantity
      : Number(button.closest('tr').querySelector('[data-stock-quantity]').value);
    const result = tradeStock(world, button.dataset.stockId, action === 'buy-stock' ? 'buy' : 'sell', quantity);
    if (result.ok) { isSaved = false; render('club', '#stocks-title'); }
    notify(result.message + (result.ok ? ' · 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (action === 'open-stock-chart') {
    if (world) openStockChart(main.querySelector('#stock-chart-dialog'), world.stocks, button.dataset.stockId);
    return;
  }
  if (action === 'sign-sponsor') {
    if (!world) return;
    const result = signSponsor(world, button.dataset.sponsorKind, Number(button.dataset.sponsorTier ?? 1));
    if (result.ok) { isSaved = false; render('club', '#finance-title'); }
    notify(result.message + (result.ok ? ' · 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (action === 'change-coach') {
    if (!world) return;
    const result = changeCoach(world, button.dataset.coach === 'none' ? null : button.dataset.coach);
    if (result.ok) { isSaved = false; render('club', '#coaches-title'); }
    notify(result.message + (result.ok ? ' · 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (action === 'upgrade-facility') {
    if (!world) return;
    const result = upgradeFacility(world, button.dataset.facility);
    if (result.ok) { isSaved = false; render('club', '#facilities-title'); }
    notify(result.message + (result.ok ? ' · 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (action === 'open-player-event') {
    main.querySelector('#player-event-dialog')?.showModal(); return;
  }
  if (action === 'postpone-player-event') {
    main.querySelector('#player-event-dialog')?.close(); return;
  }
  if (action === 'resolve-player-event') {
    if (!world) return;
    if (activeYearAdvance(world)) {
      void runOperation(async () => {
        const candidate = structuredClone(world);
        const result = resolvePlayerEvent(candidate, button.dataset.eventChoice);
        if (!result.ok) { notify(result.message, true); return; }
        candidate.yearAdvance.message = '이벤트를 선택했습니다. 계속 진행을 눌러 일정을 재개하세요.';
        await persistOfficial(candidate);
        render('club');
      });
      return;
    }
    const teamTraining = world.playerEvents.week?.teamTraining;
    const result = resolvePlayerEvent(world, button.dataset.eventChoice);
    if (!result.ok) { notify(result.message, true); return; }
    isSaved = false;
    main.querySelector('#player-event-dialog')?.close();
    progressWeeklySchedule(teamTraining, result.message + ' ');
    return;
  }
  if (action === 'advance-week') {
    if (!world) return;
    if (pendingPlayerEvent(world)) { render('club'); return; }
    if (world.teamTraining?.status === 'pending') { render('practice'); return; }
    if (activeYearAdvance(world)) { render('club'); return; }
    const week = officialWeekStatus(world);
    if (['ready', 'tiebreak', 'tiebreak-ai', 'playoff', 'playoff-ai'].includes(week.phase)) { render('season'); return; }
    if (officialSeason(world).weekSchedule || world.weekDaysRemaining || world.playerEvents.week) {
      const team = officialSeason(world).weekSchedule?.phase === 'settling' ? false
        : officialSeason(world).weekSchedule?.teamTraining ?? world.playerEvents.week?.teamTraining
          ?? getClubView(world).lineupIds.every(id => world.players.find(player => player.id === id).training.focus === 'team');
      progressWeeklySchedule(team);
      return;
    }
    render('club', '[data-action="advance-week"]');
    weeklyActionPurpose = 'week';
    main.querySelector('#weekly-action-dialog').showModal();
    return;
  }
  if (action === 'cancel-week') {
    main.querySelector('#weekly-action-dialog')?.close();
    return;
  }
  if (action === 'confirm-week') {
    if (!world) return;
    const dialog = main.querySelector('#weekly-action-dialog');
    if (!dialog?.open) return;
    const choices = [...dialog.querySelectorAll('[data-week-action-player]')].map(select => ({ playerId: select.dataset.weekActionPlayer, action: select.value }));
    if (weeklyActionPurpose === 'year') {
      void runOperation(async () => {
        const candidate = structuredClone(world), result = beginYearAdvance(candidate, choices);
        if (!result.ok) { notify(result.message, true); return; }
        dialog.close();
        weeklyActionPurpose = 'week';
        try { await persistOfficial(candidate); }
        catch (error) { render('club'); showYearAdvanceError(error); return; }
        await progressYearAdvance();
      });
      return;
    }
    const selected = selectWeeklyActions(world, choices);
    if (!selected.ok) { notify(selected.message, true); return; }
    isSaved = false;
    dialog.close();
    if (world.playerEvents.week) world.playerEvents.week.teamTraining = selected.teamTraining;
    progressWeeklySchedule(selected.teamTraining);
    return;
  }
  if (action === 'negotiate-transfer') {
    if (!world) return;
    const rate = Number(button.closest('td').querySelector('[data-transfer-rate]').value);
    const result = negotiateTransfer(world, button.dataset.playerId, rate);
    if (result.ok) {
      isSaved = false;
      render('players', '#player-sort');
    }
    notify(result.message + (result.ok ? ' · 양 구단 변경을 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (action === 'refresh-save') {
    void runOperation(async () => { await refreshSavedGame(); notify('저장 슬롯을 다시 확인했습니다.'); });
    return;
  }
  if (action === 'sell-player') {
    if (!world) return;
    const result = sellPlayer(world, button.dataset.playerId);
    if (result.ok) { isSaved = false; render('club', '#roster-title'); }
    notify(result.message + (result.ok ? ' · 변경 내용을 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (['recruit-player', 'release-player', 'renew-contract'].includes(action)) {
    if (!world) return;
    const result = action === 'recruit-player' ? recruitPlayer(world, button.dataset.playerId)
      : action === 'release-player' ? releasePlayer(world, button.dataset.playerId)
      : renewContract(world, button.dataset.playerId, Number(button.closest('tr').querySelector('[data-contract-duration]').value));
    if (result.ok) {
      isSaved = false;
      render(action === 'recruit-player' ? 'players' : 'club', action === 'recruit-player' ? '#player-sort' : action === 'renew-contract' ? '#contracts-title' : null);
    }
    notify(result.message + (result.ok ? ' · 변경 내용을 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (action === 'view-club') {
    if (!world?.clubs.some(club => club.id === button.dataset.clubId)) return;
    const listScrollTop = main.querySelector('.club-list')?.scrollTop ?? 0;
    selectedClubId = button.dataset.clubId;
    render('world', '[data-selected-roster]');
    const clubList = main.querySelector('.club-list');
    if (clubList) clubList.scrollTop = listScrollTop;
    return;
  }
  if (action === 'player-page') {
    playerPage = Number(button.dataset.page);
    render('players', '#player-sort');
    return;
  }
  if (action === 'player-sort-direction') {
    if (!world || !['asc', 'desc'].includes(button.dataset.direction)) return;
    playerSortDirection = button.dataset.direction;
    playerPage = 0;
    render('players', `[data-action="player-sort-direction"][data-direction="${playerSortDirection}"]`);
    return;
  }
  if (['club', 'world', 'season', 'players', 'practice'].includes(action) && !world) return;
  render(action);
});

app.addEventListener('change', (event) => {
  if (busy) return;
  if (event.target.name === 'clubLogo') {
    draftLogoId = event.target.value;
    return;
  }
  if (!world || bankruptcyIssue(world)) return;
  if (event.target.dataset.weekActionPlayer) {
    const dialog = main.querySelector('#weekly-action-dialog');
    const club = getClubView(world);
    const choices = [...dialog.querySelectorAll('[data-week-action-player]')];
    if (event.target.value === 'team' && club.lineupIds.includes(event.target.dataset.weekActionPlayer)) {
      for (const select of choices) if (club.lineupIds.includes(select.dataset.weekActionPlayer)) select.value = 'team';
    }
    const teamTraining = choices.some(select => select.value === 'team' && club.lineupIds.includes(select.dataset.weekActionPlayer));
    dialog.querySelector('[data-action="confirm-week"]').textContent = weeklyActionPurpose === 'year' ? '선택 완료 · 연말까지 진행 ▶' : teamTraining ? '선택 완료 · 팀 훈련 진행 ▶' : `선택 완료 · ${club.weekDaysRemaining ? `남은 ${club.weekDaysRemaining}일` : '1주'} 진행 ▶`;
    return;
  }
  if (event.target.dataset.lineupPlayer) {
    const playerId = event.target.dataset.lineupPlayer;
    const targetId = event.target.value;
    if (!targetId) return;
    const club = getClubView(world);
    const isStarter = club.lineupIds.includes(playerId);
    const result = isStarter ? replaceStarter(world, targetId, playerId) : replaceStarter(world, playerId, targetId);
    if (result.ok) isSaved = false;
    render('club', 'h1');
    notify(result.message + (result.ok ? ' · 변경 내용을 구단 저장으로 보관하세요.' : ''), !result.ok);
    return;
  }
  if (event.target.id === 'league-filter') {
    selectedLeague = event.target.value;
    selectedClubId = world.clubs.find(club => club.leagueId === selectedLeague)?.id;
    render('world', '#league-filter');
  }
  if (event.target.id === 'player-sort') {
    playerSort = event.target.value;
    playerPage = 0;
    render('players', '#player-sort');
  }
});

app.addEventListener('input', (event) => {
  if (event.target.id !== 'club-name') return;
  draftName = event.target.value;
  event.target.removeAttribute('aria-invalid');
  main.querySelector('#name-error').textContent = '';
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  void runOperation(async () => {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('백업 파일은 32MB 이하여야 합니다.');
    const data = parseBackup(await file.text());
    await applyCandidate(restoreWorld(data));
  });
});

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'club-form' || currentScreen !== 'create-club') return;
  event.preventDefault();
  if (busy) return;
  const input = event.target.elements.clubName;
  const result = createClub(input.value);
  if (result.error) {
    main.querySelector('#name-error').textContent = result.error;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  result.club.logoId = event.target.elements.clubLogo.value;
  void runOperation(() => applyCandidate(createWorld(result.club)));
});

render('menu');
notify('저장 슬롯을 확인하고 있습니다…');
void runOperation(async () => {
  await refreshSavedGame();
  notify(savedEntry ? '저장된 구단이 있습니다. 이어하기로 불러올 수 있습니다.' : '새 구단을 창단하면 이 브라우저에 자동 저장합니다.');
});
