// ============================================================================
// ADMIN.JS — logik för admin.html, eventets kontrollcentral
// ============================================================================

let AD_STATE = HState.DEFAULT_EVENT_STATE;
let AD_POLLS = [];
let AD_PARTICIPANTS = [];

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Bekräftelsedialog för kritiska åtgärder ----------
function confirmAction(message) {
  return new Promise((resolve) => {
    $('#confirmText').textContent = message;
    $('#confirmOverlay').classList.add('show');
    const yes = $('#confirmYes');
    const no = $('#confirmNo');
    const cleanup = () => {
      $('#confirmOverlay').classList.remove('show');
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
    };
    const onYes = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
  });
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--red-bright)';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ---------- SCREEN CONTROLS ----------
function renderScreenControls() {
  $('#modeReadout').textContent = HState.fmtMode(AD_STATE.mode);
  $all('.screen-mode-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.mode === AD_STATE.mode);
  });
  $('#toggleOverlayBtn').classList.toggle('is-active', !!AD_STATE.showVoteOverlay);
  $('#toggleResultBtn').classList.toggle('is-active', !!AD_STATE.showVoteResult);
}

async function setScreenMode(mode) {
  const patch = { mode };
  if (mode !== 'vote' && mode !== 'result') {
    // lämnar poll-overlay av om vi går till ett läge utan koppling till omröstning
  }
  await HState.updateEventState(patch);
  toast(`Skärm satt till ${HState.fmtMode(mode)}`);
}

// ---------- MESSAGE ----------
async function sendMessage() {
  const text = $('#messageInput').value.trim();
  if (!text) return toast('Skriv ett meddelande först.', true);
  await HState.updateEventState({ message: text, mode: 'message' });
  toast('Meddelande visas på projektorn.');
}

// ---------- INSTRUCTION ----------
async function saveInstruction() {
  const text = $('#instructionInput').value.trim();
  if (!text) return toast('Skriv en instruktion först.', true);
  await HState.updateEventState({ instruction: text });
  toast('Instruktion publicerad till deltagarna.');
}

// ---------- LIVE ----------
async function showLive() {
  await HState.updateEventState({ mode: 'live' });
  toast('Projektorn visar nu livestreamen.');
}

// ---------- POLLS ----------
function renderPollsList() {
  const el = $('#pollsList');
  if (AD_POLLS.length === 0) {
    el.innerHTML = '<p class="muted">Inga omröstningar skapade ännu.</p>';
    return;
  }
  const sorted = [...AD_POLLS].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  el.innerHTML = sorted.map(p => {
    const active = AD_STATE.activePollId === p.id && (AD_STATE.mode === 'vote' || AD_STATE.mode === 'result');
    return `
    <div class="poll-card ${active ? 'is-active' : ''}">
      <div class="q">${escapeHtml(p.question)} <span class="badge ${p.status === 'active' ? 'live' : p.status === 'closed' ? 'off' : ''}">${p.status}</span></div>
      <div class="opts">${p.options.map(o => `${escapeHtml(o)}: ${p.votes?.[o] || 0}`).join(' · ')}</div>
      <div class="btn-row">
        <button class="btn btn-sm btn-primary" data-act="start" data-id="${p.id}">Starta</button>
        <button class="btn btn-sm" data-act="result" data-id="${p.id}">Visa resultat</button>
        <button class="btn btn-sm btn-danger" data-act="end" data-id="${p.id}">Avsluta</button>
        <button class="btn btn-sm btn-ghost" data-act="delete" data-id="${p.id}">Ta bort</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      try {
        if (act === 'start') { await HPolls.startPoll(id); toast('Omröstning startad.'); }
        if (act === 'result') { await HPolls.showResultOnScreen(id); toast('Resultat visas på projektorn.'); }
        if (act === 'end') { await HPolls.endPoll(id); toast('Omröstning avslutad.'); }
        if (act === 'delete') {
          const ok = await confirmAction('Ta bort den här omröstningen permanent?');
          if (ok) { await HPolls.deletePoll(id); toast('Omröstning borttagen.'); }
        }
      } catch (e) { toast(e.message, true); }
    });
  });
}

function addOptionField(value = '') {
  const wrap = $('#optionFields');
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.innerHTML = `<input type="text" class="opt-input" placeholder="Alternativ" value="${escapeHtml(value)}" style="margin-bottom:8px;">
    <button type="button" class="btn btn-sm btn-ghost remove-opt" style="flex:0 0 auto;">✕</button>`;
  wrap.appendChild(row);
  row.querySelector('.remove-opt').addEventListener('click', () => row.remove());
}

async function createPollFromForm() {
  const question = $('#pollQuestionInput').value;
  const options = Array.from($all('.opt-input')).map(i => i.value);
  try {
    await HPolls.createPoll({ question, options, prepared: true });
    toast('Omröstning skapad.');
    $('#pollQuestionInput').value = '';
    $('#optionFields').innerHTML = '';
    addOptionField(); addOptionField();
  } catch (e) { toast(e.message, true); }
}

// ---------- PARTICIPANT SELECTION ----------
function renderParticipantsList() {
  const el = $('#participantsList');
  if (AD_PARTICIPANTS.length === 0) {
    el.innerHTML = '<p class="muted">Inga deltagare tillagda ännu.</p>';
    return;
  }
  el.innerHTML = AD_PARTICIPANTS.map(p => `
    <div class="list-row ${AD_STATE.selectedParticipantId === p.id ? 'is-selected' : ''}">
      <span class="name">${escapeHtml(p.name)}</span>
      <div class="actions">
        <button class="btn btn-sm" data-select="${p.id}">Välj</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('button[data-select]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await HState.updateEventState({ selectedParticipantId: btn.dataset.select });
      toast('Deltagare vald.');
    });
  });
}

async function randomParticipant() {
  if (AD_PARTICIPANTS.length === 0) return toast('Inga deltagare att slumpa bland.', true);
  const pick = AD_PARTICIPANTS[Math.floor(Math.random() * AD_PARTICIPANTS.length)];
  await HState.updateEventState({ selectedParticipantId: pick.id });
  toast(`Slumpad: ${pick.name}`);
}

async function clearSelection() {
  await HState.updateEventState({ selectedParticipantId: null });
  toast('Val återställt.');
}

// ---------- MANUELLT LÄGGA TILL DELTAGARE ----------
async function addParticipantManually() {
  const name = $('#newPName').value.trim();
  const username = $('#newPUsername').value.trim().toLowerCase();
  const code = $('#newPCode').value.trim();
  if (!name || !username || !code) return toast('Fyll i namn, användarnamn och kod.', true);

  const existing = await HState.PARTICIPANTS_COL().where('username', '==', username).limit(1).get();
  if (!existing.empty) return toast('Användarnamnet är redan taget.', true);

  const codeHash = await HAuth.sha256Hex(code);
  await HState.PARTICIPANTS_COL().add({
    name, username, codeHash, authUid: null, selected: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  toast(`${name} tillagd.`);
  $('#newPName').value = ''; $('#newPUsername').value = ''; $('#newPCode').value = '';
}

// ---------- REGISTRERINGAR ----------
function listenRegistrations() {
  HState.REGISTRATIONS_COL().orderBy('createdAt').onSnapshot(snap => {
    const el = $('#registrationsList');
    if (snap.empty) { el.innerHTML = '<p class="muted">Inga registreringar ännu.</p>'; return; }
    let i = 0;
    el.innerHTML = Array.from(snap.docs).map(doc => {
      i++;
      const d = doc.data();
      return `<div class="list-row"><span>#${i} — ${escapeHtml(d.name)}</span></div>`;
    }).join('');
  });
}

async function saveRegistrationSettings() {
  const max = parseInt($('#maxSeatsInput').value, 10);
  const open = $('#registrationOpenToggle').checked;
  if (!Number.isFinite(max) || max < 1) return toast('Ange ett giltigt platsantal.', true);
  await HState.SETTINGS_REF().set({ maxSeats: max, open }, { merge: true });
  toast('Registreringsinställningar sparade.');
}

function listenSettings() {
  HState.SETTINGS_REF().onSnapshot(snap => {
    if (!snap.exists) return;
    const d = snap.data();
    $('#maxSeatsInput').value = d.maxSeats ?? 30;
    $('#registrationOpenToggle').checked = !!d.open;
  });
}

// ---------- INIT ----------
function initAdminPage() {
  HAuth.requireAdmin(async (user) => {
    $('#adminEmail').textContent = user.email;
    await HState.ensureEventState();

    addOptionField(); addOptionField();

    HState.listenEventState(state => {
      AD_STATE = state;
      renderScreenControls();
      renderPollsList();
      renderParticipantsList();
      $('#messageInput').value = state.message || '';
      $('#instructionInput').value = state.instruction || '';
    });

    HState.listenPolls(polls => { AD_POLLS = polls; renderPollsList(); });
    HState.listenParticipants(list => { AD_PARTICIPANTS = list; renderParticipantsList(); });
    listenRegistrations();
    listenSettings();

    // Wire up buttons
    $all('.screen-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setScreenMode(btn.dataset.mode));
    });
    $('#toggleOverlayBtn').addEventListener('click', () => {
      HState.updateEventState({ showVoteOverlay: !AD_STATE.showVoteOverlay });
    });
    $('#toggleResultBtn').addEventListener('click', () => {
      HState.updateEventState({ showVoteResult: !AD_STATE.showVoteResult });
    });
    $('#sendMessageBtn').addEventListener('click', sendMessage);
    $('#saveInstructionBtn').addEventListener('click', saveInstruction);
    $('#showLiveBtn').addEventListener('click', showLive);
    $('#addOptionBtn').addEventListener('click', () => addOptionField());
    $('#createPollBtn').addEventListener('click', createPollFromForm);
    $('#randomParticipantBtn').addEventListener('click', randomParticipant);
    $('#clearSelectionBtn').addEventListener('click', clearSelection);
    $('#addParticipantBtn').addEventListener('click', addParticipantManually);
    $('#saveRegSettingsBtn').addEventListener('click', saveRegistrationSettings);

    $('#logoutBtn').addEventListener('click', async () => {
      await HAuth.adminLogout();
      location.href = 'login.html';
    });
  });
}

document.addEventListener('DOMContentLoaded', initAdminPage);
