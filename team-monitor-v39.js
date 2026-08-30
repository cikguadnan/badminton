import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';
import { getTrainingSessions } from './sessions.js';
import { make, secondaryLevel, formatShortDate } from './development-utils.js';

function monitorState(session) {
  const now = new Date();
  const opensAt = session.opensAt?.toDate?.() || new Date(`${session.trainingDate}T00:00:00+08:00`);
  const closesAt = session.closesAt?.toDate?.() || new Date(`${session.dueDate}T23:59:59+08:00`);
  const attendanceOpensAt = new Date(opensAt.getTime() - 7 * 86400000);
  if (now < attendanceOpensAt) return 'not-open';
  if (now > closesAt) return 'closed';
  if (now < opensAt) return 'attendance-open';
  return 'active';
}

function personRow(player, reason, tone) {
  const row = make('div', 'monitor-person-row');
  const avatar = make('div', 'monitor-avatar', (player.name || '?').trim().charAt(0).toUpperCase() || '?');
  const body = make('div', 'monitor-person-main');
  body.append(
    make('strong', '', player.name || 'Player'),
    make('span', '', `${player.className || 'Class not set'}${player.role === 'captain' ? ' • Captain' : ''}`)
  );
  row.append(avatar, body, make('span', `monitor-status ${tone}`, reason));
  return row;
}

function classify(player, session, attendanceByUid, reflectionUids) {
  const uid = player.uid || player.id;
  const attendance = attendanceByUid.get(uid);
  const state = monitorState(session);
  if (state === 'not-open') return { bucket: 'waiting', reason: 'Not open yet' };
  if (!attendance) return state === 'closed'
    ? { bucket: 'chase', reason: 'Attendance overdue' }
    : { bucket: 'pending', reason: 'Attendance pending' };
  if (attendance.status === 'absent') return { bucket: 'done', reason: 'Absent recorded' };
  if (attendance.status === 'attended' && !reflectionUids.has(uid)) return state === 'closed'
    ? { bucket: 'chase', reason: 'Reflection overdue' }
    : { bucket: 'pending', reason: 'Reflection pending' };
  return { bucket: 'done', reason: 'Complete' };
}

function bucketBox(title, helper, items, tone) {
  const box = make('section', `monitor-box monitor-bucket ${tone}`);
  box.append(make('h3', '', title), make('p', 'monitor-bucket-helper', helper));
  if (!items.length) box.append(make('p', 'monitor-empty', title === 'Done' ? 'No completed players yet.' : 'Nobody here right now.'));
  else items.forEach(({ player, reason }) => box.append(personRow(player, reason, tone)));
  return box;
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
      .filter(p => ['student','player','captain'].includes(String(p.role || '').toLowerCase()))
      .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
    const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const reflections = reflectionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    container.replaceChildren();
    const heading = make('div', 'section-heading');
    const copy = make('div');
    copy.append(
      make('span', 'section-kicker', 'CAPTAIN TOOLS'),
      make('h2', '', 'Team monitor'),
      make('p', '', 'Focus your follow-up: chase overdue work first, then remind players who are still within the submission window.')
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
      option.textContent = `${formatShortDate(session.trainingDate)} — ${session.title || 'Badminton Training'}`;
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
      const filtered = players.filter(p => levelSelect.value === 'all' || secondaryLevel(p.className) === levelSelect.value);
      const sessionAttendance = attendance.filter(a => a.sessionId === session.id);
      const attendanceByUid = new Map(sessionAttendance.map(a => [a.studentUid, a]));
      const reflectionUids = new Set(reflections.filter(r => r.sessionId === session.id).map(r => r.studentUid));
      const buckets = { chase: [], pending: [], done: [], waiting: [] };
      filtered.forEach(player => {
        const result = classify(player, session, attendanceByUid, reflectionUids);
        buckets[result.bucket].push({ player, reason: result.reason });
      });

      const stats = make('div', 'monitor-stats');
      [['chase','Chase now','danger'],['pending','Pending','warn'],['done','Done','good']].forEach(([key,label,tone]) => {
        const card = make('div', `monitor-stat ${tone}`);
        card.append(make('strong','',String(buckets[key].length)), make('span','',label));
        stats.append(card);
      });
      target.append(stats);

      if (buckets.waiting.length) {
        target.append(make('div', 'monitor-info', `Attendance has not opened yet. ${buckets.waiting.length} player${buckets.waiting.length === 1 ? '' : 's'} will move into Pending when the 7-day attendance window opens.`));
      }

      const columns = make('div', 'monitor-columns priority-columns');
      columns.append(
        bucketBox('Chase now', 'Submission window has closed. Follow up personally.', buckets.chase, 'danger'),
        bucketBox('Pending', 'Still within the allowed window. A reminder may be useful.', buckets.pending, 'warn'),
        bucketBox('Done', 'Attendance/reflection requirement settled.', buckets.done, 'good')
      );
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
