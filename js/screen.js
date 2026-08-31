// ============================================================================
// SCREEN.JS — logik för screen.html, projektorvyn (ingen inloggning krävs)
// ============================================================================

let SC_STATE = HState.DEFAULT_EVENT_STATE;
let SC_POLL_UNSUB = null;
let SC_PARTICIPANTS = [];

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

function render() {
  const s = SC_STATE;

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
    $('#unmuteBtn').classList.add('hidden');
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
    if ($('#liveVideo').muted) $('#unmuteBtn').classList.remove('hidden');
  }
}

function initUnmuteButton() {
  $('#unmuteBtn').addEventListener('click', () => {
    const v = $('#liveVideo');
    v.muted = false;
    v.play().catch(err => console.warn('[screen] kunde inte spela upp med ljud:', err));
    $('#unmuteBtn').classList.add('hidden');
  });
}

function initScreenPage() {
  HState.ensureEventState().then(() => {
    HState.listenEventState(state => { SC_STATE = state; render(); });
    HState.listenParticipants(list => { SC_PARTICIPANTS = list; renderSelectedParticipant(); });
    HScreenRTC.initViewer($('#liveVideo'));
    initUnmuteButton();
  });
}

document.addEventListener('DOMContentLoaded', initScreenPage);
