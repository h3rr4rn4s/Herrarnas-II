// ============================================================================
// PARTICIPANT.JS — logik för participant.html
// ============================================================================

let CURRENT_PARTICIPANT = null;
let CURRENT_POLL_UNSUB = null;
let CURRENT_POLL = null;
let MY_VOTE = null;

function $(sel) { return document.querySelector(sel); }

function renderInstruction(instruction) {
  $('#instructionText').textContent = instruction || '—';
}

function renderSelected(state, participants) {
  const box = $('#selectedBox');
  if (state.selectedParticipantId) {
    const p = participants.find(p => p.id === state.selectedParticipantId);
    box.classList.remove('hidden');
    $('#selectedName').textContent = p ? p.name : '???';
  } else {
    box.classList.add('hidden');
  }
}

async function renderPollSection(state) {
  const section = $('#pollSection');
  const pollId = state.activePollId;

  if (CURRENT_POLL_UNSUB) { CURRENT_POLL_UNSUB(); CURRENT_POLL_UNSUB = null; }

  if (!pollId || (state.mode !== 'vote' && state.mode !== 'result')) {
    section.classList.add('hidden');
    return;
  }
  section.classList.add('hidden'); // visas när data kommit

  CURRENT_POLL_UNSUB = HState.listenPoll(pollId, async (poll) => {
    CURRENT_POLL = poll;
    if (!poll) { section.classList.add('hidden'); return; }

    MY_VOTE = await HPolls.getMyVote(pollId, CURRENT_PARTICIPANT.id);
    section.classList.remove('hidden');
    $('#pollQuestion').textContent = poll.question;

    const optsEl = $('#pollOptions');
    const resultEl = $('#pollResults');
    const votedEl = $('#youVoted');

    const showResult = state.mode === 'result' || poll.status === 'closed' || MY_VOTE;

    if (showResult) {
      optsEl.classList.add('hidden');
      resultEl.classList.remove('hidden');
      const pct = HState.pollPercentages(poll);
      resultEl.innerHTML = poll.options.map(opt => `
        <div class="result-bar-row">
          <div class="result-bar-label"><span>${escapeHtml(opt)}</span><span>${pct[opt].pct}%</span></div>
          <div class="result-bar-track"><div class="result-bar-fill" style="width:${pct[opt].pct}%"></div></div>
        </div>`).join('');

      if (MY_VOTE) {
        votedEl.classList.remove('hidden');
        votedEl.innerHTML = `DU RÖSTADE PÅ: <b>${escapeHtml(MY_VOTE.option)}</b>`;
      } else {
        votedEl.classList.add('hidden');
      }
    } else {
      resultEl.classList.add('hidden');
      votedEl.classList.add('hidden');
      optsEl.classList.remove('hidden');
      optsEl.innerHTML = poll.options.map(opt => `
        <button class="poll-option" data-opt="${escapeHtml(opt)}">
          <span class="ring"></span><span>${escapeHtml(opt)}</span>
        </button>`).join('');

      optsEl.querySelectorAll('.poll-option').forEach(btn => {
        btn.addEventListener('click', () => submitVote(btn.dataset.opt));
      });
    }
  });
}

async function submitVote(option) {
  const buttons = document.querySelectorAll('.poll-option');
  buttons.forEach(b => b.disabled = true);
  try {
    await HPolls.castVote(CURRENT_POLL.id, CURRENT_PARTICIPANT.id, option);
  } catch (e) {
    showError(e.message);
    buttons.forEach(b => b.disabled = false);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showError(msg) {
  const box = $('#errorBox');
  box.textContent = msg;
  box.classList.add('show');
  setTimeout(() => box.classList.remove('show'), 4000);
}

function initParticipantPage() {
  HAuth.requireParticipant(async (participant) => {
    CURRENT_PARTICIPANT = participant;
    $('#welcomeName').textContent = participant.name;

    let latestParticipants = [];
    HState.listenParticipants(list => { latestParticipants = list; });

    HState.listenEventState(async (state) => {
      $('#modeBadge').textContent = HState.fmtMode(state.mode);
      $('#modeBadge').className = 'badge ' + (state.mode === 'live' || state.mode === 'vote' ? 'live' : 'off');
      renderInstruction(state.instruction);
      renderSelected(state, latestParticipants);
      await renderPollSection(state);
    });

    $('#logoutBtn').addEventListener('click', async () => {
      await HAuth.participantLogout();
      location.href = 'login.html';
    });
  });
}

document.addEventListener('DOMContentLoaded', initParticipantPage);
