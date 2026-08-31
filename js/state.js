// ============================================================================
// STATE.JS
// Central helpers kring Firestore-kollektionerna. Alla andra js-filer
// (admin.js, participant.js, screen.js, herrarna.js) bygger på dessa.
// ============================================================================

const EVENT_STATE_REF = () => db.collection('eventState').doc('current');
const ADMINS_REF = (uid) => db.collection('admins').doc(uid);
const PARTICIPANTS_COL = () => db.collection('participants');
const POLLS_COL = () => db.collection('polls');
const VOTES_COL = () => db.collection('votes');
const REGISTRATIONS_COL = () => db.collection('registrations');
const SETTINGS_REF = () => db.collection('eventSettings').doc('registration');
const SIGNAL_REF = () => db.collection('webrtc').doc('herrarna-live');

// Default-struktur för event state. Skapas automatiskt om den saknas.
const DEFAULT_EVENT_STATE = {
  mode: 'idle',            // idle | message | intro | live | vote | result
  message: '',
  instruction: 'Välkomna. Vänta på nästa instruktion.',
  activePollId: null,
  showVoteOverlay: false,  // visa fråga+alternativ ovanpå live
  showVoteResult: false,   // visa resultat ovanpå live / i vote-läge
  selectedParticipantId: null,
  updatedAt: null
};

async function ensureEventState() {
  const snap = await EVENT_STATE_REF().get();
  if (!snap.exists) {
    await EVENT_STATE_REF().set({
      ...DEFAULT_EVENT_STATE,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

function listenEventState(callback) {
  return EVENT_STATE_REF().onSnapshot((snap) => {
    if (!snap.exists) { callback(DEFAULT_EVENT_STATE); return; }
    callback(snap.data());
  }, (err) => console.error('[state] eventState listener error', err));
}

async function updateEventState(patch) {
  await EVENT_STATE_REF().set({
    ...patch,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function listenPolls(callback) {
  return POLLS_COL().onSnapshot((snap) => {
    const polls = [];
    snap.forEach(doc => polls.push({ id: doc.id, ...doc.data() }));
    callback(polls);
  }, (err) => console.error('[state] polls listener error', err));
}

function listenPoll(pollId, callback) {
  return POLLS_COL().doc(pollId).onSnapshot((snap) => {
    callback(snap.exists ? { id: snap.id, ...snap.data() } : null);
  });
}

function listenParticipants(callback) {
  return PARTICIPANTS_COL().onSnapshot((snap) => {
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv'));
    callback(list);
  }, (err) => console.error('[state] participants listener error', err));
}

// Enkel hjälpfunktion: hämta procentandelar för en polls resultat
function pollPercentages(poll) {
  const votes = poll.votes || {};
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const out = {};
  (poll.options || []).forEach(opt => {
    const c = votes[opt] || 0;
    out[opt] = { count: c, pct: total > 0 ? Math.round((c / total) * 100) : 0 };
  });
  return out;
}

function fmtMode(mode) {
  const map = {
    idle: 'IDLE', message: 'MEDDELANDE', intro: 'INTRO',
    live: 'LIVE', vote: 'OMRÖSTNING', result: 'RESULTAT'
  };
  return map[mode] || mode;
}

window.HState = {
  EVENT_STATE_REF, ADMINS_REF, PARTICIPANTS_COL, POLLS_COL, VOTES_COL,
  REGISTRATIONS_COL, SETTINGS_REF, SIGNAL_REF,
  DEFAULT_EVENT_STATE, ensureEventState, listenEventState, updateEventState,
  listenPolls, listenPoll, listenParticipants, pollPercentages, fmtMode
};
