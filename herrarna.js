// ============================================================================
// HERRARNA.JS — logik för herrarna.html
// Enheten inne på Herrarnas: visar egen kamerabild, kan starta/stoppa
// livesändning, och visar aktuell omröstning + ev. resultat.
// ============================================================================

let HR_STATE = HState.DEFAULT_EVENT_STATE;
let HR_POLL_UNSUB = null;
let HR_BROADCASTING = false;

function $(sel) { return document.querySelector(sel); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function toggleBroadcast() {
  const btn = $('#broadcastBtn');
  if (!HR_BROADCASTING) {
    btn.disabled = true;
    btn.textContent = 'STARTAR...';
    try {
      await HBroadcastRTC.start($('#selfVideo'));
      HR_BROADCASTING = true;
      btn.textContent = 'STOPPA LIVE';
      btn.classList.add('is-active');
      $('#broadcastStatus').innerHTML = '<span class="dot rec"></span> SÄNDER LIVE';
    } catch (e) {
      alert('Kunde inte starta kamera/mikrofon: ' + e.message);
      btn.textContent = 'STARTA LIVE';
    } finally {
      btn.disabled = false;
    }
  } else {
    await HBroadcastRTC.stop();
    HR_BROADCASTING = false;
    btn.textContent = 'STARTA LIVE';
    btn.classList.remove('is-active');
    $('#broadcastStatus').innerHTML = '<span class="dot off"></span> EJ SÄNDANDE';
  }
}

function renderInstruction(state) {
  $('#instructionText').textContent = state.instruction || '—';
}

function watchPoll(state) {
  if (HR_POLL_UNSUB) { HR_POLL_UNSUB(); HR_POLL_UNSUB = null; }
  const section = $('#pollSection');
  if (!state.activePollId || (state.mode !== 'vote' && state.mode !== 'result' && state.mode !== 'live')) {
    section.classList.add('hidden');
    return;
  }
  HR_POLL_UNSUB = HState.listenPoll(state.activePollId, (poll) => {
    if (!poll) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    $('#pollQuestion').textContent = poll.question;

    const showResult = state.mode === 'result' || (state.mode !== 'vote' && state.showVoteResult);
    const optsEl = $('#pollOptionsList');
    if (showResult) {
      const pct = HState.pollPercentages(poll);
      optsEl.innerHTML = poll.options.map(o => `<div>${escapeHtml(o)}: <b>${pct[o].pct}%</b></div>`).join('');
    } else {
      optsEl.innerHTML = poll.options.map(o => `<div>• ${escapeHtml(o)}</div>`).join('');
    }
  });
}

function initHerrarnaPage() {
  HAuth.requireParticipant(async () => {
    // Alla inbjudna/inloggade deltagare kan öppna sidan om admin ger dem
    // länken på plats — men i praktiken är det bara Herrarnas-mobilen/iPaden
    // som faktiskt trycker "Starta live".
    HState.listenEventState(state => {
      HR_STATE = state;
      renderInstruction(state);
      watchPoll(state);
    });

    $('#broadcastBtn').addEventListener('click', toggleBroadcast);

    window.addEventListener('beforeunload', () => {
      if (HR_BROADCASTING) HBroadcastRTC.stop();
    });
  });
}

document.addEventListener('DOMContentLoaded', initHerrarnaPage);
