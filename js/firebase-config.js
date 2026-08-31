// ============================================================================
// FIREBASE CONFIG
// ----------------------------------------------------------------------------
// Fyll i värdena nedan med er egen Firebase-projektkonfiguration.
// Hittas i: Firebase Console -> Project settings -> Your apps -> SDK setup.
//
// Detta är INTE hemligt / känsligt att lägga i klientkoden (det är avsett
// att vara publikt). Det som faktiskt skyddar er data är Firestore Security
// Rules (se firestore.rules) och Firebase Authentication.
// ============================================================================

const firebaseConfig = {
  apiKey: "DIN_API_KEY",
  authDomain: "DITT_PROJEKT.firebaseapp.com",
  projectId: "DITT_PROJEKT",
  storageBucket: "DITT_PROJEKT.appspot.com",
  messagingSenderId: "DITT_SENDER_ID",
  appId: "DIN_APP_ID"
};

// Initiera Firebase (kompat-SDK laddas via <script>-taggar i varje HTML-fil)
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

// Gör tillgängligt globalt för övriga js-filer (vi kör utan bundler/moduler
// för att hålla det enkelt för en student att förstå och köra direkt i browsern)
window.db = db;
window.auth = auth;
