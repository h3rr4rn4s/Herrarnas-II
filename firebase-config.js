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
  apiKey: "AIzaSyBv71mi3f1pMUV8Fco2-Mf0DKMvd05cmI8",
  authDomain: "herrarnas-ii.firebaseapp.com",
  projectId: "herrarnas-ii",
  storageBucket: "herrarnas-ii.firebasestorage.app",
  messagingSenderId: "159538478716",
  appId: "1:159538478716:web:3f8da2139b8938138a13f9",
  measurementId: "G-HV6JC0BMXZ"
};

// Initiera Firebase (kompat-SDK laddas via <script>-taggar i varje HTML-fil)
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

// Gör tillgängligt globalt för övriga js-filer (vi kör utan bundler/moduler
// för att hålla det enkelt för en student att förstå och köra direkt i browsern)
window.db = db;
window.auth = auth;
