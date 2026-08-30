import {
  collection,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';
import { getTrainingSessions } from './sessions.js';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function sessionState(session) {
  const now = new Date();
  const opensAt = session.opensAt?.toDate?.() || new Date(`${session.trainingDate}T00:00:00+08:00`);
  const closesAt = session.closesAt?.toDate?.() || new Date(`${session.dueDate}T23:59:59+08:00`);
  if (now < opensAt) return 'upcoming';
  if (now > closesAt) return 'closed';
  return 'open';
}

function formatShortDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(`${dateString}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date);
}

function daysUntil(dateString) {
  const today = new Date();
  const target = new Date(`${dateString}T00:00:00+08:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((target - start) / 86400000);
}

function statCard(value, label, helper, tone = '') {
  const card = make('article', `overview-stat ${tone}`.trim());
  card.append(
    make('strong', '', String(value)),
    make('span', '', label),
    make('small', '', helper)
  );
  return card;
}

function actionCard({ kicker, title, copy, button, target, tone = '' }) {
  const card = make('article', `next-action-card ${tone}`.trim());
  const content = make('div', 'next-action-copy');
  content.append(
    make('span', 'section-kicker', kicker),
    make('h2', '', title),
    make('p', '', copy)
  );
  card.append(content);

  if (button && target) {
    const action = make('button', 'primary-btn compact-btn', button);
    action.type = 'button';
    action.addEventListener('click', () => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    card.append(action);
  }
  return card;
}

async function getPlayerOverview(user) {
  const [sessions, attendanceSnapshot, reflectionSnapshot] = await Promise.all([
    getTrainingSessions(),
    getDocs(query(collection(db, 'attendance'), where('studentUid', '==', user.uid))),
    getDocs(query(collection(db, 'reflections'), where('studentUid', '==', user.uid)))
  ]);

  const attendance = attendanceSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const reflections = reflectionSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const attendanceMap = new Map(attendance.map(item => [item.sessionId, item]));
  const reflectionMap = new Map(reflections.map(item => [item.sessionId, item]));

  const attendedCount = attendance.filter(item => item.status === 'attended').length;
  const recordedCount = attendance.filter(item => item.status === 'attended' || item.status === 'absent').length;
  const attendanceRate = recordedCount ? Math.round((attendedCount / recordedCount) * 100) : 0;

  const pendingReflections = sessions.filter(session =>
    sessionState(session) === 'open' &&
    attendanceMap.get(session.id)?.status === 'attended' &&
    !reflectionMap.has(session.id)
  );

  const upcoming = sessions
    .filter(session => sessionState(session) === 'upcoming')
    .sort((a, b) => a.trainingDate.localeCompare(b.trainingDate))[0];

  const current = sessions
    .filter(session => sessionState(session) === 'open')
    .sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))[0];

  return { sessions, attendance, reflections, attendanceRate, pendingReflections, upcoming, current };
}

async function renderPlayerOverview({ container, user, profile }) {
  const data = await getPlayerOverview(user);
  container.replaceChildren();

  let action;
  if (data.pendingReflections.length) {
    const session = data.pendingReflections[0];
    action = actionCard({
      kicker: 'NEXT ACTION',
      title: 'Complete your reflection',
      copy: `${session.title || 'Badminton Training'} • ${formatShortDate(session.trainingDate)}. Submit by ${formatShortDate(session.dueDate)}.`,
      button: 'Go to reflection',
      target: 'reflectionsSection',
      tone: 'attention'
    });
  } else if (data.current && !data.attendance.some(item => item.sessionId === data.current.id)) {
    action = actionCard({
      kicker: 'TODAY / OPEN SESSION',
      title: 'Record your attendance',
      copy: `${data.current.title || 'Badminton Training'} is open now. Check in before completing your reflection.`,
      button: 'Check in',
      target: 'attendanceSection'
    });
  } else if (data.upcoming) {
    const remaining = daysUntil(data.upcoming.trainingDate);
    action = actionCard({
      kicker: 'NEXT TRAINING',
      title: data.upcoming.title || 'Badminton Training',
      copy: `${formatShortDate(data.upcoming.trainingDate)}${remaining >= 0 ? ` • ${remaining === 0 ? 'Today' : `in ${remaining} day${remaining === 1 ? '' : 's'}`}` : ''}${data.upcoming.focus ? ` • ${data.upcoming.focus}` : ''}`,
      button: 'View schedule',
      target: 'trainingSection'
    });
  } else {
    action = actionCard({
      kicker: 'ALL CAUGHT UP',
      title: 'Nothing pending right now',
      copy: 'Your attendance and reflections are up to date. Keep building on your next training goal.',
      button: 'Review reflections',
      target: 'reflectionsSection',
      tone: 'complete'
    });
  }

  container.append(action);

  const stats = make('div', 'overview-stats');
  stats.append(
    statCard(`${data.attendanceRate}%`, 'Attendance rate', data.attendance.length ? 'Based on recorded sessions' : 'No attendance recorded yet'),
    statCard(data.reflections.length, 'Reflections', 'Completed training reflections'),
    statCard(data.pendingReflections.length, 'Pending', data.pendingReflections.length ? 'Reflection action needed' : 'You are caught up', data.pendingReflections.length ? 'warn' : 'good'),
    statCard(data.sessions.length, 'Sessions', 'Official training dates')
  );
  container.append(stats);

  if (!profile?.className) {
    const reminder = make('button', 'profile-reminder');
    reminder.type = 'button';
    reminder.innerHTML = '<strong>Complete your profile</strong><span>Add your class so your coach can identify your submissions.</span><b>Update →</b>';
    reminder.addEventListener('click', () => {
      document.getElementById('profileSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    container.append(reminder);
  }
}

async function getCoachOverview() {
  const [sessions, usersSnapshot, attendanceSnapshot, reflectionsSnapshot] = await Promise.all([
    getTrainingSessions(),
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'attendance')),
    getDocs(collection(db, 'reflections'))
  ]);

  const players = usersSnapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.role === 'student' || item.role === 'player');
  const attendance = attendanceSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const reflections = reflectionsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));

  const upcoming = sessions
    .filter(session => sessionState(session) === 'upcoming')
    .sort((a, b) => a.trainingDate.localeCompare(b.trainingDate))[0];
  const open = sessions
    .filter(session => sessionState(session) === 'open')
    .sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))[0];
  const focusSession = open || upcoming || [...sessions].sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))[0];
  const focusAttendance = focusSession ? attendance.filter(item => item.sessionId === focusSession.id) : [];
  const focusReflections = focusSession ? reflections.filter(item => item.sessionId === focusSession.id) : [];

  return { sessions, players, upcoming, open, focusSession, focusAttendance, focusReflections };
}

async function renderCoachOverview({ container }) {
  const data = await getCoachOverview();
  container.replaceChildren();

  if (data.open) {
    container.append(actionCard({
      kicker: 'OPEN TRAINING',
      title: data.open.title || 'Badminton Training',
      copy: `${formatShortDate(data.open.trainingDate)} • ${data.focusAttendance.length}/${data.players.length || 0} players have recorded attendance • ${data.focusReflections.length} reflections submitted.`,
      button: 'Review attendance',
      target: 'attendanceSection'
    }));
  } else if (data.upcoming) {
    const remaining = daysUntil(data.upcoming.trainingDate);
    container.append(actionCard({
      kicker: 'NEXT TRAINING',
      title: data.upcoming.title || 'Badminton Training',
      copy: `${formatShortDate(data.upcoming.trainingDate)} • in ${remaining} day${remaining === 1 ? '' : 's'}${data.upcoming.focus ? ` • ${data.upcoming.focus}` : ''}`,
      button: 'Manage schedule',
      target: 'trainingSection'
    }));
  } else {
    container.append(actionCard({
      kicker: 'SCHEDULE',
      title: data.sessions.length ? 'No upcoming training' : 'Create your first training date',
      copy: data.sessions.length ? 'Add the next official session when the schedule is confirmed.' : 'Start by adding the official training dates for the term.',
      button: 'Manage training',
      target: 'trainingSection',
      tone: 'attention'
    }));
  }

  const outstanding = data.focusSession ? Math.max(0, data.players.length - data.focusAttendance.length) : 0;
  const stats = make('div', 'overview-stats');
  stats.append(
    statCard(data.players.length, 'Players', 'Signed-in player profiles'),
    statCard(data.sessions.length, 'Sessions', 'Official training dates'),
    statCard(data.focusAttendance.length, 'Attendance replies', data.focusSession ? `For ${formatShortDate(data.focusSession.trainingDate)}` : 'No session selected'),
    statCard(data.focusReflections.length, 'Reflections', outstanding ? `${outstanding} attendance replies outstanding` : 'Latest session progress', outstanding ? 'warn' : 'good')
  );
  container.append(stats);
}

export async function renderOverview({ container, role, user, profile }) {
  container.replaceChildren(make('div', 'overview-loading', 'Preparing your dashboard…'));
  try {
    if (role === 'coach') {
      await renderCoachOverview({ container });
    } else {
      await renderPlayerOverview({ container, user, profile });
    }
  } catch (error) {
    console.error('Could not load dashboard overview:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load the dashboard overview. The rest of the hub is still available below.'));
  }
}
