import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';
import { getTrainingSessions } from './sessions.js';

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${value}T00:00:00+08:00`));
}

function levelFromClass(className = '') {
  const match = String(className).trim().match(/(?:sec(?:ondary)?\s*)?([123])|^([123])/i);
  const level = match?.[1] || match?.[2];
  return level ? `sec${level}` : 'other';
}

function sessionState(session) {
  const now = new Date();
  const opensAt = session.opensAt?.toDate?.() || new Date(`${session.trainingDate}T00:00:00+08:00`);
  const closesAt = session.closesAt?.toDate?.() || new Date(`${session.dueDate}T23:59:59+08:00`);
  const attendanceOpensAt = new Date(opensAt.getTime() - 7 * 86400000);
  if (now < attendanceOpensAt) return 'not-open';
  if (now < opensAt) return 'attendance-open';
  if (now > closesAt) return 'closed';
  return 'active';
}

function buildPersonRow(player, status, tone) {
  const row = make('div', 'monitor-person-row');
  const avatar = make('div', 'monitor-avatar', (player.name || '?').trim().charAt(0).toUpperCase() || '?');
  const body = make('div', 'monitor-person-main');
  body.append(
    make('strong', '', player.name || 'Player'),
    make('span', '', `${player.className || 'Class not set'}${player.role === 'captain' ? ' • Captain' : ''}`)
  );
  row.append(avatar, body, make('span', `monitor-status ${tone}`, status));
  return row;
}

export async function renderTeamMonitor({ container }) {
  container.replaceChildren(make('div', 'loading-card', 'Checking team completion…'));
  try {
    const [sessions, usersSnap, attendanceSnap, reflectionsSnap] = await Promise.all([
      getTrainingSessions(),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'attendance')),
      getDocs(collection(db, 'reflections'))
    ]);

    const players = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => ['student', 'player', 'captain'].includes(String(p.role || '').toLowerCase()))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const reflections = reflectionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    container.replaceChildren();
    const heading = make('div', 'section-heading');
    const copy = make('div');
    copy.append(
      make('span', 'section-kicker', 'CAPTAIN TOOLS'),
      make('h2', '', 'Team monitor'),
      make('p', '', 'See who still needs a reminder for attendance or reflection. Use this to follow up with teammates.')
    );
    heading.append(copy);
    container.append(heading);

    if (!sessions.length || !players.length) {
      container.append(make('div', 'empty-card', !sessions.length ? 'No training sessions yet.' : 'No player profiles yet.'));
      return;
    }

    const controls = make('div', 'monitor-controls');
    const sessionField = make('label', 'field');
    sessionField.append(make('span', '', 'Training session'));
    const sessionSelect = document.createElement('select');
    [...sessions].sort((a,b) => b.trainingDate.localeCompare(a.trainingDate)).forEach(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${formatDate(session.trainingDate)} — ${session.title || 'Badminton Training'}`;
      sessionSelect.append(option);
    });
    sessionField.append(sessionSelect);

    const levelField = make('label', 'field');
    levelField.append(make('span', '', 'Player level'));
    const levelSelect = document.createElement('select');
    levelSelect.innerHTML = '<option value="all">All players</option><option value="sec1">Sec 1</option><option value="sec2">Sec 2</option><option value="sec3">Sec 3</option>';
    levelField.append(levelSelect);
    controls.append(sessionField, levelField);
    container.append(controls);

    const target = make('div', 'monitor-target');
    container.append(target);

    function draw() {
      target.replaceChildren();
      const session = sessions.find(s => s.id === sessionSelect.value) || sessions[0];
      const state = sessionState(session);
      const filteredPlayers = players.filter(p => levelSelect.value === 'all' || levelFromClass(p.className) === levelSelect.value);
      const sessionAttendance = attendance.filter(a => a.sessionId === session.id);
      const sessionReflections = reflections.filter(r => r.sessionId === session.id);
      const attendanceByUid = new Map(sessionAttendance.map(a => [a.studentUid, a]));
      const reflectionUids = new Set(sessionReflections.map(r => r.studentUid));

      const missingAttendance = state === 'not-open' ? [] : filteredPlayers.filter(p => !attendanceByUid.has(p.uid || p.id));
      const pendingReflection = filteredPlayers.filter(p => attendanceByUid.get(p.uid || p.id)?.status === 'attended' && !reflectionUids.has(p.uid || p.id));
      const complete = filteredPlayers.filter(p => {
        const uid = p.uid || p.id;
        const record = attendanceByUid.get(uid);
        return record?.status === 'absent' || (record?.status === 'attended' && reflectionUids.has(uid));
      });

      const stats = make('div', 'monitor-stats');
      [[missingAttendance.length,'Attendance missing','warn'],[pendingReflection.length,'Reflection pending','warn'],[complete.length,'Complete','good']].forEach(([value,label,tone]) => {
        const card = make('div', `monitor-stat ${tone}`);
        card.append(make('strong','',String(value)), make('span','',label));
        stats.append(card);
      });
      target.append(stats);

      if (state === 'not-open') {
        target.append(make('div', 'monitor-info', 'Attendance has not opened yet for this session. It opens 7 days before training.'));
      }

      const columns = make('div', 'monitor-columns');
      const attendanceBox = make('section', 'monitor-box');
      attendanceBox.append(make('h3', '', 'Attendance to chase'));
      if (!missingAttendance.length) attendanceBox.append(make('p', 'monitor-empty', state === 'not-open' ? 'Not open yet.' : 'Everyone has responded.'));
      else missingAttendance.forEach(p => attendanceBox.append(buildPersonRow(p, 'Missing', 'warn')));

      const reflectionBox = make('section', 'monitor-box');
      reflectionBox.append(make('h3', '', 'Reflections to chase'));
      if (!pendingReflection.length) reflectionBox.append(make('p', 'monitor-empty', 'No pending reflections.'));
      else pendingReflection.forEach(p => reflectionBox.append(buildPersonRow(p, 'Pending', 'warn')));
      columns.append(attendanceBox, reflectionBox);
      target.append(columns);
    }

    sessionSelect.addEventListener('change', draw);
    levelSelect.addEventListener('change', draw);
    draw();
  } catch (error) {
    console.error('Could not load captain monitor:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load the team monitor. Check Firestore rules and try again.'));
  }
}
