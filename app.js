import { loginWithGoogle, completeRedirectLogin, watchAuth, logout, getUserRole } from './auth.js';

const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const googleButton = document.getElementById('googleSignInBtn');
const statusBox = document.getElementById('statusBox');
const signOutButton = document.getElementById('signOutBtn');
const dashboardName = document.getElementById('dashboardName');
const dashboardEmail = document.getElementById('dashboardEmail');
const dashboardRole = document.getElementById('dashboardRole');
const dashboardTitle = document.getElementById('dashboardTitle');
const dashboardCopy = document.getElementById('dashboardCopy');

let handlingUser = false;

function showStatus(message, type = 'info') {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
  statusBox.hidden = false;
}

function hideStatus() {
  statusBox.hidden = true;
  statusBox.textContent = '';
  statusBox.className = 'status-box info';
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return 'This GitHub Pages domain is not authorised in Firebase Authentication.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not enabled in Firebase Authentication.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Could not reach Firebase. Check your internet connection and try again.';
  }
  if (code === 'permission-denied') {
    return 'Google sign-in worked, but Firestore denied access while checking your role.';
  }
  return error?.message || 'Something went wrong while signing in.';
}

function renderSignedOut() {
  handlingUser = false;
  dashboardView.hidden = true;
  loginView.hidden = false;
  googleButton.disabled = false;
  googleButton.innerHTML = '<span class="google-g">G</span><span>Continue with Google</span>';
}

async function renderSignedIn(user) {
  if (handlingUser) return;
  handlingUser = true;
  showStatus('Google sign-in successful. Checking your account…');

  try {
    const role = await getUserRole(user);
    dashboardName.textContent = user.displayName || 'WRSS Badminton Member';
    dashboardEmail.textContent = user.email || '';
    dashboardRole.textContent = role === 'coach' ? 'Coach' : 'Player';
    dashboardTitle.textContent = role === 'coach' ? 'Coach Dashboard' : 'Player Dashboard';
    dashboardCopy.textContent = role === 'coach'
      ? 'V3 login is working. Training management will be added next.'
      : 'V3 login is working. Your training sessions will be added next.';

    hideStatus();
    loginView.hidden = true;
    dashboardView.hidden = false;
  } catch (error) {
    console.error('Role check failed:', error);
    handlingUser = false;
    showStatus(friendlyError(error), 'error');
  }
}

googleButton.addEventListener('click', async () => {
  hideStatus();
  googleButton.disabled = true;
  googleButton.innerHTML = '<span class="google-g">G</span><span>Opening Google…</span>';

  try {
    const result = await loginWithGoogle();
    if (result?.user) await renderSignedIn(result.user);
  } catch (error) {
    console.error('Google login failed:', error);
    showStatus(friendlyError(error), 'error');
  } finally {
    googleButton.disabled = false;
    googleButton.innerHTML = '<span class="google-g">G</span><span>Continue with Google</span>';
  }
});

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try {
    await logout();
  } catch (error) {
    console.error('Sign out failed:', error);
  } finally {
    signOutButton.disabled = false;
  }
});

try {
  const redirectResult = await completeRedirectLogin();
  if (redirectResult?.user) await renderSignedIn(redirectResult.user);
} catch (error) {
  console.error('Redirect completion failed:', error);
  showStatus(friendlyError(error), 'error');
}

watchAuth(user => {
  if (user) {
    renderSignedIn(user);
  } else {
    renderSignedOut();
  }
});
