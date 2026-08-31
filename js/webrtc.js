// ============================================================================
// WEBRTC.JS
// ----------------------------------------------------------------------------
// Peer-to-peer livestream mellan Herrarnas-mobilen/iPaden (broadcaster) och
// projektorsidan (viewer), utan någon betald streamingtjänst.
//
// HUR DET FUNGERAR:
//   Firestore används enbart som "signaleringsserver" — dvs för att de två
//   webbläsarna ska hitta varandra och byta de tekniska meddelanden (SDP-
//   offer/answer + ICE-candidates) som krävs för att öppna en direkt
//   WebRTC-anslutning. Själva videoströmmen går ALDRIG genom Firestore eller
//   någon server — den skickas direkt mellan de två enheterna (peer-to-peer)
//   när anslutningen väl är upprättad.
//
// VAD SOM KRÄVS FÖR ATT DET SKA FUNGERA:
//   - Båda sidor måste ligga på HTTPS (kameraåtkomst kräver det, och
//     GitHub Pages serveras alltid över HTTPS — så det är uppfyllt).
//   - Ett STUN-server används (Googles publika, gratis) för att enheterna
//     ska kunna ta reda på sin publika nätverksadress.
//   - Detta är TILLRÄCKLIGT i de allra flesta fall när båda enheterna sitter
//     på SAMMA lokala Wi-Fi (vilket är fallet på Herrarnas — mobilen och
//     projektordatorn bör vara på samma nätverk).
//   - OM anslutningen ändå inte upprättas (t.ex. pga en ovanlig router/brand-
//     vägg) kan en TURN-server behövas som reläserver. Det finns inget gratis,
//     garanterat pålitligt sådant utan konto. Om ni stöter på problem, lägg
//     till en TURN-server (t.ex. från Twilio, Cloudflare eller det öppna
//     projektet "openrelay.metered.ca" som har en gratisnivå) i
//     ICE_SERVERS nedan. Testa alltid på plats i lokalen innan eventet.
//   - Om livestreamen av någon anledning inte går att koppla upp: resten av
//     systemet (omröstningar, meddelanden, adminpanel) fungerar oberoende av
//     detta, se README/FALLBACKS.
// ============================================================================

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
    // Lägg ev. till en TURN-server här om STUN inte räcker på plats, ex:
    // { urls: 'turn:din-turn-server', username: '...', credential: '...' }
  ]
};

function sigDoc() { return HState.SIGNAL_REF(); }
function broadcasterCandidatesCol() { return sigDoc().collection('broadcasterCandidates'); }
function viewerCandidatesCol() { return sigDoc().collection('viewerCandidates'); }

async function clearCollection(colRef) {
  const snap = await colRef.get();
  const batch = db.batch();
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// ---------------------------------------------------------------------------
// BROADCASTER (körs i herrarna.html)
// ---------------------------------------------------------------------------
const HBroadcastRTC = (() => {
  let pc = null;
  let localStream = null;
  let unsubDoc = null;
  let unsubCandidates = null;

  async function start(videoEl, { audio = true, video = true } = {}) {
    await stop(); // städa ev. gammal session INNAN vi hämtar en ny kameraström

    localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
    videoEl.srcObject = localStream;
    videoEl.muted = true; // undvik egen-eko på broadcaster-enheten
    await videoEl.play().catch(() => {});

    await clearCollection(broadcasterCandidatesCol());
    await clearCollection(viewerCandidatesCol());
    await sigDoc().set({ offer: null, answer: null, live: true }, { merge: true });

    pc = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) broadcasterCandidatesCol().add(e.candidate.toJSON());
    };
    pc.oniceconnectionstatechange = () => console.log('[webrtc][broadcaster] iceConnectionState:', pc.iceConnectionState);
    pc.onconnectionstatechange = () => console.log('[webrtc][broadcaster] connectionState:', pc.connectionState);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sigDoc().set({ offer: { sdp: offer.sdp, type: offer.type } }, { merge: true });

    unsubDoc = sigDoc().onSnapshot(async (snap) => {
      const data = snap.data();
      if (data && data.answer && pc.currentRemoteDescription === null) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    unsubCandidates = viewerCandidatesCol().onSnapshot((snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && pc) {
          pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
        }
      });
    });

    return pc;
  }

  async function stop() {
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
    if (unsubCandidates) { unsubCandidates(); unsubCandidates = null; }
    if (pc) { pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    await sigDoc().set({ live: false }, { merge: true }).catch(() => {});
  }

  function connectionState() { return pc ? pc.connectionState : 'closed'; }

  return { start, stop, connectionState };
})();

// ---------------------------------------------------------------------------
// VIEWER (körs i screen.html)
// ---------------------------------------------------------------------------
const HScreenRTC = (() => {
  let pc = null;
  let broadcasterCandidatesUnsub = null;
  let lastOfferKey = null;

  function resetViewer(videoEl) {
    if (broadcasterCandidatesUnsub) {
      broadcasterCandidatesUnsub();
      broadcasterCandidatesUnsub = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    if (videoEl) {
      const stream = videoEl.srcObject;
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach(track => track.stop());
      }
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.muted = true;
      videoEl.volume = 0;
    }
    lastOfferKey = null;
  }

  async function connectViewer(videoEl, offer) {
    const offerKey = JSON.stringify(offer);
    if (lastOfferKey === offerKey) return; // redan uppkopplad mot/på väg mot denna offer

    resetViewer(videoEl); // OBS: nollställer lastOfferKey, därför sätts den igen direkt nedan

    // Sätts DIREKT, innan några await-anrop. Annars hinner Firestores
    // onSnapshot-lyssnare (som triggas igen av att VI skriver "answer" till
    // samma dokument några rader ner) tro att en ny offer kommit in och
    // startar om hela anslutningen mitt i — vilket orsakade en oändlig
    // reconnect-loop (syns som "play() interrupted by pause()" i konsolen).
    lastOfferKey = offerKey;

    pc = new RTCPeerConnection(ICE_SERVERS);

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.volume = 0;
      videoEl.play()
        .then(() => {
          videoEl.dispatchEvent(new Event('hstream-connected'));
        })
        .catch(err => console.warn('[webrtc][viewer] videoEl.play() misslyckades:', err));
    };
    pc.oniceconnectionstatechange = () => console.log('[webrtc][viewer] iceConnectionState:', pc.iceConnectionState);
    pc.onconnectionstatechange = () => console.log('[webrtc][viewer] connectionState:', pc.connectionState);
    pc.onicecandidate = (e) => {
      if (e.candidate) viewerCandidatesCol().add(e.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sigDoc().set({ answer: { sdp: answer.sdp, type: answer.type } }, { merge: true });

    broadcasterCandidatesUnsub = broadcasterCandidatesCol().onSnapshot((csnap) => {
      csnap.docChanges().forEach(change => {
        if (change.type === 'added' && pc) {
          pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
        }
      });
    });
  }

  async function initViewer(videoEl) {
    sigDoc().onSnapshot(async (snap) => {
      const data = snap.data() || {};

      if (!data.live || !data.offer) {
        resetViewer(videoEl);
        return;
      }

      const offerKey = JSON.stringify(data.offer);
      if (lastOfferKey === offerKey) return;
      await connectViewer(videoEl, data.offer);
    });
  }

  return { initViewer, resetViewer };
})();

window.HBroadcastRTC = HBroadcastRTC;
window.HScreenRTC = HScreenRTC;
