// ============================================================================
// POLLS.JS
// Delad logik för omröstningar. Röstantal räknas med en Firestore-transaktion
// direkt på poll-dokumentet (votes-map), samt en separat "votes"-post per
// deltagare för att spärra dubbelröstning och kunna visa "du röstade på X".
// ============================================================================

async function createPoll({ question, options, prepared = true }) {
  options = options.map(o => o.trim()).filter(Boolean);
  if (!question.trim() || options.length < 2) {
    throw new Error('En omröstning behöver en fråga och minst två alternativ.');
  }
  const votes = {};
  options.forEach(o => votes[o] = 0);

  const ref = await HState.POLLS_COL().add({
    question: question.trim(),
    options,
    votes,
    status: 'draft', // draft | active | closed
    prepared,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function updatePoll(pollId, patch) {
  await HState.POLLS_COL().doc(pollId).set(patch, { merge: true });
}

async function deletePoll(pollId) {
  await HState.POLLS_COL().doc(pollId).delete();
}

// Startar en omröstning: sätter den aktiv i eventState + status=active på poll
async function startPoll(pollId) {
  await HState.POLLS_COL().doc(pollId).set({ status: 'active' }, { merge: true });
  await HState.updateEventState({
    mode: 'vote',
    activePollId: pollId,
    showVoteOverlay: true,
    showVoteResult: false
  });
}

async function endPoll(pollId) {
  await HState.POLLS_COL().doc(pollId).set({ status: 'closed' }, { merge: true });
}

async function showResultOnScreen(pollId) {
  await HState.updateEventState({
    mode: 'result',
    activePollId: pollId,
    showVoteOverlay: true,
    showVoteResult: true
  });
}

// Deltagare röstar. participantId = deltagarens dokument-id.
async function castVote(pollId, participantId, option) {
  const voteId = `${pollId}_${participantId}`;
  const voteRef = HState.VOTES_COL().doc(voteId);
  const pollRef = HState.POLLS_COL().doc(pollId);

  await db.runTransaction(async (tx) => {
    const voteSnap = await tx.get(voteRef);
    if (voteSnap.exists) {
      throw new Error('Du har redan röstat på den här omröstningen.');
    }
    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists) throw new Error('Omröstningen finns inte längre.');
    const poll = pollSnap.data();
    if (poll.status !== 'active') throw new Error('Omröstningen är stängd.');
    if (!poll.options.includes(option)) throw new Error('Ogiltigt alternativ.');

    const votes = { ...(poll.votes || {}) };
    votes[option] = (votes[option] || 0) + 1;

    tx.set(voteRef, {
      pollId, participantId, option,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    tx.set(pollRef, { votes }, { merge: true });
  });
}

async function getMyVote(pollId, participantId) {
  const snap = await HState.VOTES_COL().doc(`${pollId}_${participantId}`).get();
  return snap.exists ? snap.data() : null;
}

window.HPolls = {
  createPoll, updatePoll, deletePoll, startPoll, endPoll,
  showResultOnScreen, castVote, getMyVote
};
