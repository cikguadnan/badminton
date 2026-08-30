import { loginWithGoogle, completeRedirectLogin, watchAuth, logout, getUserRole } from './auth.js';
import { renderTrainingSessions } from './sessions.js';
import { renderAttendance } from './attendance.js';

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
const trainingSection = document.getElementById('trainingSection');
const attendanceSection = document.getElementById('attendanceSection');
const dashboardMessage = document.getElementById('dashboardMessage');

let handlingUser = false;
let activeUser = null;
let activeRole = null;

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

function showDashboardMessage(message, type = 'success') {
  dashboardMessage.textContent = message;
  dashboardMessage.className = `dashboard-message ${type}`;
  dashboardMessage.hidden = false;
  window.clearTimeout(showDashboardMessage.timer);
  showDashboardMessage.timer = window.setTimeout(() => {
    dashboardMessage.hidden = true;
  }, 3200);
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') return 'This GitHub Pages domain is not authorised in Firebase Authentication.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in Firebase Authentication.';
  if (code === 'auth/network-request-failed') return 'Could not reach Firebase. Check your internet connection and try again.';
  if (code === 'permission-denied') return 'Google sign-in worked, but Firestore denied access while checking your role.';
  return error?.message || 'Something went wrong while signing in.';
}

function renderSignedOut() {
  handlingUser = false;
  activeUser = null;
  activeRole = null;
  dashboardView.hidden = true;
  loginView.hidden = false;
  googleButton.disabled = false;
  googleButton.innerHTML = '<span class="google-g">G</span><span>Continue with Google</span>';
}

async function renderSignedIn(user) {
  if (handlingUser) return;
  handlingUser = true;
  showStatus('Google sign-in successful. Loading your training hub…');

  try {
    const role = await getUserRole(user);
    activeUser = user;
    activeRole = role;

    dashboardName.textContent = user.displayName || 'WRSS Badminton Member';
    dashboardEmail.textContent = user.email || '';
    dashboardRole.textContent = role === 'coach' ? 'Coach' : 'Player';
    dashboardTitle.textContent = role === 'coach' ? 'Coach Dashboard' : 'Player Dashboard';
    dashboardCopy.textContent = role === 'coach'
      ? 'Create and manage the official badminton training schedule.'
      : 'Check the official training sessions created by your coach.';

    hideStatus();
    loginView.hidden = true;
    dashboardView.hidden = false;

    await renderTrainingSessions({
      container: trainingSection,
      role,
      user,
      onMessage: showDashboardMessage
    });

    await renderAttendance({
      container: attendanceSection,
      role,
      user,
      onMessage: showDashboardMessage
    });
  } catch (error) {
    console.error('Dashboard load failed:', error);
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
    if (!activeUser || activeUser.uid !== user.uid || !activeRole) renderSignedIn(user);
  } else {
    renderSignedOut();
  }
});
