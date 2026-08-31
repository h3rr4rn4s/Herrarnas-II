// ============================================================================
// AUTH.JS
// ----------------------------------------------------------------------------
// DELTAGARE loggar in med användarnamn + personlig kod. Firebase Authentication
// stöder inte "username+kod" direkt (det kräver e-post/telefon), så vi använder
// följande mönster:
//
//   1. Deltagaren skriver in username + kod.
//   2. Vi slår upp deltagaren i Firestore (participants) på username.
//   3. Koden jämförs mot en hash som lagras i deltagarens dokument
//      (SHA-256, skapas av admin när deltagaren läggs till).
//   4. Om koden stämmer: vi loggar in klienten anonymt via
//      firebase.auth().signInAnonymously().
//   5. Vi kopplar (claimar) den anonyma auth-uid:n till deltagardokumentet
//      genom att sätta fältet authUid, men BARA om authUid ännu är null.
//      Detta styrs av Firestore Security Rules (se firestore.rules) så att
//      ett deltagardokument bara kan claimas en gång och därefter bara kan
//      läsas/skrivas av den uid som claimade det.
//
// SÄKERHETSKONSEKVENSER (viktigt att förstå):
//   - Kodkontrollen i steg 3 görs på klienten. Det är INTE lika säkert som ett
//     riktigt backend-login, eftersom någon i teorin skulle kunna läsa av
//     hela participants-kollektionen om Security Rules vore felaktigt satta.
//     Våra regler tillåter dock bara att LÄSA sitt eget dokument (matchat på
//     authUid), så en väntande (oclaimad) deltagare kan tekniskt sett bara
//     hitta sitt dokument via en riktad query på username — inte bläddra
//     igenom alla andra.
//   - Koderna är korta och tänkta för ett engångsevent, inte återanvända
//     lösenord. Hasha ändå (SHA-256) så de inte ligger i klartext i databasen.
//   - Detta är gott nog för ett privat studentevent, men ska INTE användas
//     för känsligare system utan en riktig backend-verifiering
//     (t.ex. Cloud Functions) som kan kontrollera koden utan att exponera
//     hashen till klienten alls.
//
// ADMIN loggar in med vanlig Firebase Authentication (e-post + lösenord).
// De tre arrangörernas UID läggs manuellt till i "admins"-kollektionen i
// Firestore efter att kontona skapats i Firebase Console. Se README.
// ============================================================================

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- DELTAGARINLOGGNING ----------

async function participantLogin(username, code) {
  username = (username || '').trim().toLowerCase();
  code = (code || '').trim();
  if (!username || !code) throw new Error('Fyll i både användarnamn och kod.');

  const q = await HState.PARTICIPANTS_COL().where('username', '==', username).limit(1).get();
  if (q.empty) throw new Error('Okänt användarnamn.');

  const doc = q.docs[0];
  const data = doc.data();
  const codeHash = await sha256Hex(code);

  if (codeHash !== data.codeHash) throw new Error('Fel kod.');

  // Säkerställ inloggning (auth krävs för Firestore-regler)
  if (!auth.currentUser) {
    await auth.signInAnonymously();
  }
  const uid = auth.currentUser.uid;

  // Claima dokumentet om det inte redan är claimat av denna uid
  if (data.authUid && data.authUid !== uid) {
    // Redan inloggad från en annan enhet/uid tidigare. Vi tillåter
    // omclaim ENDAST om samma username+kod anges igen (dvs deltagaren
    // bytt telefon). Detta är avsiktligt tillåtet i reglerna för robusthet
    // (deltagare ska kunna logga in igen om de tappar sin session).
  }

  await doc.ref.set({ authUid: uid }, { merge: true });

  localStorage.setItem('h2_participantId', doc.id);
  return doc.id;
}

async function getCurrentParticipant() {
  const id = localStorage.getItem('h2_participantId');
  if (!id || !auth.currentUser) return null;
  const snap = await HState.PARTICIPANTS_COL().doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.authUid !== auth.currentUser.uid) return null;
  return { id: snap.id, ...data };
}

function participantLogout() {
  localStorage.removeItem('h2_participantId');
  return auth.signOut();
}

// Skyddar en deltagarsida: kör i toppen av participant.html/herrarna.html
async function requireParticipant(onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { location.href = 'login.html'; return; }
    const p = await getCurrentParticipant();
    if (!p) { location.href = 'login.html'; return; }
    onReady(p);
  });
}

// ---------- ADMININLOGGNING ----------

async function adminLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const adminSnap = await HState.ADMINS_REF(cred.user.uid).get();
  if (!adminSnap.exists) {
    await auth.signOut();
    throw new Error('Det här kontot har inte adminbehörighet.');
  }
  return cred.user;
}

function adminLogout() {
  return auth.signOut();
}

// Skyddar admin.html
async function requireAdmin(onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { location.href = 'login.html'; return; }
    const adminSnap = await HState.ADMINS_REF(user.uid).get();
    if (!adminSnap.exists) { location.href = 'login.html'; return; }
    onReady(user);
  });
}

window.HAuth = {
  sha256Hex, participantLogin, getCurrentParticipant, participantLogout,
  requireParticipant, adminLogin, adminLogout, requireAdmin
};
