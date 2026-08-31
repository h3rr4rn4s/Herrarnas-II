// ============================================================================
// REGISTER.JS — logik för register.html (offentligt anmälningsformulär)
// ============================================================================

function $(sel) { return document.querySelector(sel); }

async function loadStatus() {
  const settingsSnap = await HState.SETTINGS_REF().get();
  const settings = settingsSnap.exists ? settingsSnap.data() : { open: true, maxSeats: 30 };
  const regsSnap = await HState.REGISTRATIONS_COL().get();
  const count = regsSnap.size;
  const max = settings.maxSeats || 30;

  $('#seatsLeft').textContent = Math.max(max - count, 0);
  $('#seatsTotal').textContent = max;

  const full = count >= max;
  const closed = settings.open === false;

  if (full || closed) {
    $('#regForm').classList.add('hidden');
    $('#closedNotice').classList.remove('hidden');
    $('#closedNotice').textContent = closed ? 'Anmälan är stängd.' : 'Alla platser är tagna.';
  }
  return { settings, count, max };
}

async function submitRegistration(e) {
  e.preventDefault();
  const name = $('#regName').value.trim();
  const note = $('#regNote').value.trim();
  const btn = $('#regSubmitBtn');
  if (!name) return;

  btn.disabled = true;
  btn.textContent = 'SKICKAR...';

  try {
    // Läs aktuellt antal precis innan skrivning för att minska (men inte helt
    // eliminera) risk för att overshoota maxantalet vid samtidiga anmälningar.
    // Firestore Security Rules sätter ett hårt tak, se firestore.rules och
    // README-avsnittet om registreringens begränsningar.
    const { count, max } = await loadStatus();
    if (count >= max) {
      $('#regForm').classList.add('hidden');
      $('#closedNotice').classList.remove('hidden');
      $('#closedNotice').textContent = 'Tyvärr, alla platser blev precis tagna.';
      return;
    }

    await HState.REGISTRATIONS_COL().add({
      name, note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    $('#regForm').classList.add('hidden');
    $('#successBox').classList.remove('hidden');
    $('#seatNumber').textContent = count + 1;
  } catch (err) {
    alert('Något gick fel: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ANMÄL MIG';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  $('#regForm').addEventListener('submit', submitRegistration);
});
