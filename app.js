import { loginWithGoogle, completeRedirectLogin, watchAuth, logout, getUserRole } from './auth.js';
import { renderTrainingSessions } from './sessions.js';
import { renderAttendance } from './attendance.js';
import { ensureUserProfile, renderProfile } from './profile.js';
import { renderReflections } from './staff-reflections.js';
import { renderOverview } from './overview.js';
import { initAppNavigation } from './navigation.js';

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
const overviewSection = document.getElementById('overviewSection');
const trainingSection = document.getElementById('trainingSection');
const attendanceSection = document.getElementById('attendanceSection');
const reflectionsSection = document.getElementById('reflectionsSection');
const profileSection = document.getElementById('profileSection');
const dashboardMessage = document.getElementById('dashboardMessage');
const profileNavLabel = document.getElementById('profileNavLabel');
const avatarCircle = document.getElementById('avatarCircle');

let handlingUser = false;
let activeUser = null;
let activeRole = null;
let activeProfile = null;

function showStatus(message, type = 'info') { statusBox.textContent = message; statusBox.className = `status-box ${type}`; statusBox.hidden = false; }
function hideStatus() { statusBox.hidden = true; statusBox.textContent = ''; statusBox.className = 'status-box info'; }
function showDashboardMessage(message, type = 'success') { dashboardMessage.textContent = message; dashboardMessage.className = `dashboard-message ${type}`; dashboardMessage.hidden = false; window.clearTimeout(showDashboardMessage.timer); showDashboardMessage.timer = window.setTimeout(() => { dashboardMessage.hidden = true; }, 3400); }
function friendlyError(error) { const code = error?.code || ''; if (code === 'auth/unauthorized-domain') return 'This GitHub Pages domain is not authorised in Firebase Authentication.'; if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in Firebase Authentication.'; if (code === 'auth/network-request-failed') return 'Could not reach Firebase. Check your internet connection and try again.'; if (code === 'permission-denied') return 'Firebase denied access to part of the training hub. Check the Firestore rules.'; return error?.message || 'Something went wrong while loading the training hub.'; }

function roleLabel(role) { return role === 'teacher' ? 'Teacher' : role === 'coach' ? 'Coach' : 'Player'; }
function setIdentity(profile, user, role) {
  const displayName = profile?.name || user.displayName || 'WRSS Badminton Member';
  dashboardName.textContent = displayName;
  dashboardEmail.textContent = role === 'player'
    ? `${profile?.className ? `${profile.className} • ` : ''}${user.email || ''}`
    : `${user.email || ''} • ${roleLabel(role)} access`;
  avatarCircle.textContent = displayName.trim().charAt(0).toUpperCase() || '✓';
}

function setRoleVisibility(role) {
  document.body.classList.toggle('coach-mode', role === 'coach');
  const restricted = role === 'coach';
  trainingSection.hidden = restricted;
  attendanceSection.hidden = restricted;
  document.querySelectorAll('a[href="#trainingSection"],a[href="#attendanceSection"],.bottom-nav-btn[data-page="training"],.bottom-nav-btn[data-page="attendance"]').forEach(el => {
    el.hidden = restricted;
  });
}

function renderCoachOverview() {
  overviewSection.innerHTML = `
    <article class="next-action-card complete">
      <div class="next-action-copy">
        <span class="section-kicker">COACH ACCESS</span>
        <h2>Review player development</h2>
        <p>Read player reflections, filter by level, and leave individual feedback. Training schedules and attendance management are handled by Teacher accounts.</p>
      </div>
      <button class="primary-btn compact-btn" type="button" id="coachReflectionShortcut">View reflections</button>
    </article>`;
  overviewSection.querySelector('#coachReflectionShortcut')?.addEventListener('click', () => {
    document.querySelector('.bottom-nav-btn[data-page="reflections"]')?.click();
    reflectionsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderSignedOut() {
  handlingUser = false;
  activeUser = null;
  activeRole = null;
  activeProfile = null;
  document.body.classList.remove('coach-mode');
  dashboardView.hidden = true;
  loginView.hidden = false;
  googleButton.disabled = false;
  googleButton.innerHTML = '<span class="google-g">G</span><span>Continue with Google</span>';
}

async function loadDashboardSections({ role, user, profile }) {
  const jobs = [];

  if (role === 'coach') {
    renderCoachOverview();
  } else if (role === 'teacher') {
    jobs.push(renderOverview({ container: overviewSection, role: 'coach', user, profile }));
  } else {
    jobs.push(renderOverview({ container: overviewSection, role, user, profile }));
  }

  if (role === 'teacher') {
    // Existing schedule/attendance modules use "coach" as their legacy full-staff mode.
    jobs.push(renderTrainingSessions({ container: trainingSection, role: 'coach', user, onMessage: showDashboardMessage }));
    jobs.push(renderAttendance({ container: attendanceSection, role: 'coach', user, onMessage: showDashboardMessage }));
  } else if (role === 'player') {
    jobs.push(renderTrainingSessions({ container: trainingSection, role, user, onMessage: showDashboardMessage }));
    jobs.push(renderAttendance({ container: attendanceSection, role, user, onMessage: showDashboardMessage }));
  }

  jobs.push(renderReflections({ container: reflectionsSection, role, user, onMessage: showDashboardMessage }));
  jobs.push(renderProfile({
    container: profileSection,
    role,
    user,
    profile,
    onMessage: showDashboardMessage,
    onProfileUpdated: async updated => {
      activeProfile = updated;
      setIdentity(updated, user, role);
      if (role === 'player') await renderOverview({ container: overviewSection, role, user, profile: updated });
    }
  }));

  const results = await Promise.allSettled(jobs);
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) console.warn(`${failed.length} dashboard section(s) did not load.`, failed);
}

async function renderSignedIn(user) {
  if (handlingUser) return;
  handlingUser = true;
  showStatus('Google sign-in successful. Loading your training hub…');
  try {
    const role = await getUserRole(user);
    const profile = await ensureUserProfile(user, role);
    activeUser = user;
    activeRole = role;
    activeProfile = profile;

    setIdentity(profile, user, role);
    setRoleVisibility(role);
    dashboardRole.textContent = roleLabel(role);
    dashboardTitle.textContent = role === 'teacher' ? 'Teacher Dashboard' : role === 'coach' ? 'Coach Dashboard' : 'Player Dashboard';
    dashboardCopy.textContent = role === 'teacher'
      ? 'Manage training, attendance, reflections and player development.'
      : role === 'coach'
        ? 'Review player reflections and give targeted coaching feedback.'
        : 'See what is next, check in for training and keep your reflections up to date.';
    profileNavLabel.textContent = role === 'player' ? 'Profile' : 'Players';

    hideStatus();
    loginView.hidden = true;
    dashboardView.hidden = false;
    initAppNavigation(role);
    await loadDashboardSections({ role, user, profile });
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
  try { const result = await loginWithGoogle(); if (result?.user) await renderSignedIn(result.user); }
  catch (error) { console.error('Google login failed:', error); showStatus(friendlyError(error), 'error'); }
  finally { googleButton.disabled = false; googleButton.innerHTML = '<span class="google-g">G</span><span>Continue with Google</span>'; }
});

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try { await logout(); } catch (error) { console.error('Sign out failed:', error); }
  finally { signOutButton.disabled = false; }
});

try { const redirectResult = await completeRedirectLogin(); if (redirectResult?.user) await renderSignedIn(redirectResult.user); }
catch (error) { console.error('Redirect completion failed:', error); showStatus(friendlyError(error), 'error'); }

watchAuth(user => { if (user) { if (!activeUser || activeUser.uid !== user.uid || !activeRole) renderSignedIn(user); } else renderSignedOut(); });
