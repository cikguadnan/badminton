import { firebaseConfig } from './firebase-config.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

const googleBtn = document.getElementById('googleSignInBtn');
const warning = document.getElementById('configWarning');

function show(message, isError = false) {
  if (!warning) return;
  warning.textContent = message;
  warning.className = `notice${isError ? ' error' : ''}`;
  warning.classList.remove('hidden');
}

function clearMessage() {
  if (!warning) return;
  warning.textContent = '';
  warning.className = 'notice hidden';
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') return 'This website is not authorised in Firebase. Add cikguadnan.github.io under Firebase Authentication → Settings → Authorized domains.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in Firebase Authentication.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google window. Redirecting to Google sign-in…';
  if (code === 'auth/network-request-failed') return 'Unable to reach Google/Firebase. Please check your connection and try again.';
  if (code === 'auth/popup-closed-by-user') return 'The Google sign-in window was closed before sign-in was completed.';
  return error?.message || 'Google sign-in could not start.';
}

let auth;
let provider;
let appLoaded = false;

try {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  window.__wrssAuthBootstrapReady = true;
} catch (error) {
  console.error('Firebase bootstrap failed:', error);
  show(`Firebase could not start: ${error?.message || error}`, true);
  if (googleBtn) googleBtn.disabled = true;
}

async function loadJournalApp() {
  if (appLoaded) return;
  appLoaded = true;
  try {
    await import('./app.js?v=2.2.7');
    if (googleBtn) googleBtn.removeEventListener('click', bootstrapSignIn);
  } catch (error) {
    appLoaded = false;
    console.error('Journal app failed to load after sign-in:', error);
    show(`Signed in to Google, but the journal could not load: ${error?.message || error}`, true);
  }
}

async function bootstrapSignIn() {
  if (!auth || !provider || !googleBtn) return;
  clearMessage();
  const original = googleBtn.innerHTML;
  googleBtn.disabled = true;
  googleBtn.innerHTML = '<span class="google-g">G</span><span>Opening Google…</span>';

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Google popup sign-in failed:', error);
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request') {
      show('Pop-up blocked. Redirecting to Google sign-in…');
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        console.error('Google redirect sign-in failed:', redirectError);
        show(friendlyError(redirectError), true);
      }
    } else {
      show(friendlyError(error), error?.code !== 'auth/popup-closed-by-user');
    }
  } finally {
    googleBtn.disabled = false;
    googleBtn.innerHTML = original;
  }
}

if (googleBtn && auth) googleBtn.addEventListener('click', bootstrapSignIn);

if (auth) {
  getRedirectResult(auth).catch(error => {
    console.error('Redirect result failed:', error);
    show(friendlyError(error), true);
  });

  onAuthStateChanged(auth, user => {
    if (user) loadJournalApp();
  });
}
