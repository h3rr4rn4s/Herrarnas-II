// ============================================================================
// SCREEN.JS — logik för screen.html, projektorvyn (ingen inloggning krävs)
// ============================================================================

let SC_STATE = HState.DEFAULT_EVENT_STATE;
let SC_POLL_UNSUB = null;
let SC_PARTICIPANTS = [];
let SC_LAST_MODE = null;

function $(sel) { return document.querySelector(sel); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showOnly(id) {
  ['#viewIdle', '#viewMessage', '#viewIntro', '#viewLive', '#viewResult'].forEach(sel => {
    $(sel).classList.toggle('hidden', sel !== id);
  });
}

function renderVoteOverlay(poll) {
  const overlay = $('#voteOverlay');
  if (!poll || !SC_STATE.showVoteOverlay) { overlay.classList.add('hidden'); return; }
  overlay.classList.remove('hidden');
  overlay.classList.toggle('no-result', !SC_STATE.showVoteResult);

  const pct = HState.pollPercentages(poll);
  overlay.innerHTML = `
    <div class="q">${escapeHtml(poll.question)}</div>
    ${poll.options.map(opt => `
      <div class="opt-row">
        <div class="lbl">${escapeHtml(opt)}</div>
        <div class="track"><div class="fill" style="width:${SC_STATE.showVoteResult ? pct[opt].pct : 0}%"></div></div>
        <div class="pct">${SC_STATE.showVoteResult ? pct[opt].pct + '%' : ''}</div>
      </div>`).join('')}
  `;
}

function watchActivePoll() {
  if (SC_POLL_UNSUB) { SC_POLL_UNSUB(); SC_POLL_UNSUB = null; }
  if (!SC_STATE.activePollId) { renderVoteOverlay(null); return; }
  SC_POLL_UNSUB = HState.listenPoll(SC_STATE.activePollId, (poll) => {
    if (SC_STATE.mode === 'live' || SC_STATE.mode === 'vote') {
      renderVoteOverlay(poll);
    }
    if (SC_STATE.mode === 'result') renderResultView(poll);
  });
}

function renderResultView(poll) {
  if (!poll) return;
  const pct = HState.pollPercentages(poll);
  $('#resultQuestion').textContent = poll.question;
  $('#resultBars').innerHTML = poll.options.map(opt => `
    <div class="opt-row" style="font-size:2vw;">
      <div class="lbl">${escapeHtml(opt)}</div>
      <div class="track" style="height:2vw;"><div class="fill" style="width:${pct[opt].pct}%"></div></div>
      <div class="pct">${pct[opt].pct}%</div>
    </div>`).join('');
}

function renderSelectedParticipant() {
  const p = SC_PARTICIPANTS.find(p => p.id === SC_STATE.selectedParticipantId);
  $('#selectedName').textContent = p ? p.name : '—';
}

function syncLiveVideoAudioState(mode) {
  const liveVideo = $('#liveVideo');
  if (!liveVideo) return;

  // OBS: vi pausar ALDRIG live-videoelementet här längre. WebRTC-strömmen
  // (js/webrtc.js) fortsätter rulla i bakgrunden så fort Herrarnas sänder,
  // oavsett vilket läge admin valt — vi styr bara om ljudet hörs. Att
  // pausa videon och sedan aldrig starta om den var orsaken till att
  // bilden blev svart efter ett lägesbyte.
  if (mode === 'live') {
    liveVideo.muted = false;
    liveVideo.volume = 1;
  } else {
    liveVideo.muted = true;
    liveVideo.volume = 0;
  }

  // Självläkning: om webbläsaren av någon anledning pausat videon
  // (t.ex. bakgrundsflik), starta om den tyst — muted autoplay kräver
  // aldrig en klick-interaktion.
  if (liveVideo.paused && liveVideo.srcObject) {
    const wantMuted = liveVideo.muted;
    liveVideo.muted = true;
    liveVideo.play().then(() => { liveVideo.muted = wantMuted; }).catch(() => {});
  }
}

function syncIntroVideoState(previousMode, nextMode) {
  const introVideo = $('#introVideo');
  if (!introVideo) return;

  if (nextMode === 'intro') {
    if (previousMode !== 'intro' || introVideo.paused || introVideo.ended) {
      introVideo.currentTime = 0;
      // Webbläsare tillåter alltid muted autoplay, men blockerar ofta en
      // NY uppspelning MED ljud som inte utlösts av en klick-interaktion.
      // Vi startar därför tyst och slår sedan på ljudet programmatiskt på
      // en redan igångsatt uppspelning — det räknas inte som en ny
      // "autoplay med ljud" och blockeras därför normalt inte.
      introVideo.muted = true;
      introVideo.play().then(() => {
        introVideo.muted = false;
      }).catch(err => console.warn('[screen] introVideo.play() misslyckades:', err));
    }
    return;
  }

  introVideo.pause();
  introVideo.currentTime = 0;
  introVideo.muted = true;
}

function render() {
  const s = SC_STATE;
  const previousMode = SC_LAST_MODE;

  if (s.mode === 'message') {
    showOnly('#viewMessage');
    $('#messageText').textContent = s.message || '';
  } else if (s.mode === 'intro') {
    showOnly('#viewIntro');
  } else if (s.mode === 'live') {
    showOnly('#viewLive');
    watchActivePoll();
  } else if (s.mode === 'vote') {
    // Omröstning utan live-bild: visa som overlay ovanpå mörk bakgrund
    showOnly('#viewLive');
    $('#liveVideo').classList.add('hidden');
    $('#liveBadge').classList.add('hidden');
    watchActivePoll();
  } else if (s.mode === 'result') {
    showOnly('#viewResult');
    watchActivePoll();
    renderSelectedParticipant();
  } else {
    showOnly('#viewIdle');
  }

  if (s.mode === 'live') {
    $('#liveVideo').classList.remove('hidden');
    $('#liveBadge').classList.remove('hidden');
  }

  syncLiveVideoAudioState(s.mode);
  syncIntroVideoState(previousMode, s.mode);
  SC_LAST_MODE = s.mode;
}

function initScreenPage() {
  HState.ensureEventState().then(() => {
    HState.listenEventState(state => { SC_STATE = state; render(); });
    HState.listenParticipants(list => { SC_PARTICIPANTS = list; renderSelectedParticipant(); });
    HScreenRTC.initViewer($('#liveVideo'));
    // Så fort en ny WebRTC-ström kopplas upp: synka ljud/volym direkt mot
    // aktuellt läge (täcker fallet att admin redan klickat "LIVE" innan
    // Herrarnas startade sändningen).
    $('#liveVideo').addEventListener('hstream-connected', () => syncLiveVideoAudioState(SC_STATE.mode));
  });
}

document.addEventListener('DOMContentLoaded', initScreenPage);
