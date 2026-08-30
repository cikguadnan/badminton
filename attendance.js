import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
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

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(`${dateString}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function sessionState(session) {
  const now = new Date();
  const opensAt = session.opensAt?.toDate?.() || new Date(`${session.trainingDate}T00:00:00+08:00`);
  const closesAt = session.closesAt?.toDate?.() || new Date(`${session.dueDate}T23:59:59+08:00`);
  if (now < opensAt) return 'upcoming';
  if (now > closesAt) return 'closed';
  return 'open';
}

function attendanceDocId(uid, sessionId) {
  return `${uid}_${sessionId}`;
}

async function getMyAttendance(uid) {
  const snapshot = await getDocs(query(collection(db, 'attendance'), where('studentUid', '==', uid)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function saveAttendance({ user, session, status, reason = '', details = '' }) {
  const reference = doc(db, 'attendance', attendanceDocId(user.uid, session.id));
  await setDoc(reference, {
    studentUid: user.uid,
    studentEmail: user.email || '',
    studentName: user.displayName || 'Player',
    sessionId: session.id,
    trainingDate: session.trainingDate,
    status,
    absenceReason: status === 'absent' ? reason : '',
    absenceDetails: status === 'absent' ? details : '',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });
}

function buildPlayerAttendanceCard({ session, record, user, refresh, onMessage }) {
  const card = make('article', 'attendance-card');
  const header = make('div', 'attendance-card-header');
  const left = make('div');
  left.append(
    make('span', 'section-kicker', formatDate(session.trainingDate)),
    make('h3', '', session.title || 'Badminton Training'),
    make('p', '', session.focus || 'General badminton training')
  );

  const state = sessionState(session);
  let statusClass = 'pending';
  let statusText = 'No response';
  if (record?.status === 'attended') {
    statusClass = 'attended';
    statusText = 'Attended';
  } else if (record?.status === 'absent') {
    statusClass = 'absent';
    statusText = 'Absent';
  } else if (state === 'closed') {
    statusClass = 'closed';
    statusText = 'Closed';
  }

  header.append(left, make('span', `attendance-status ${statusClass}`, statusText));
  card.append(header);

  if (record?.status === 'absent') {
    const reasonText = record.absenceDetails || record.absenceReason || 'Absence recorded';
    card.append(make('div', 'attendance-note', reasonText));
    return card;
  }

  if (record?.status === 'attended') {
    card.append(make('div', 'attendance-note success', 'Attendance recorded. Reflection will be added in the next V3 step.'));
    return card;
  }

  if (state === 'closed') {
    card.append(make('div', 'attendance-note', 'This session is closed and attendance can no longer be submitted.'));
    return card;
  }

  const actions = make('div', 'attendance-actions');

  if (state === 'open') {
    const attendedButton = make('button', 'primary-btn', 'I attended');
    attendedButton.type = 'button';
    attendedButton.addEventListener('click', async () => {
      attendedButton.disabled = true;
      try {
        await saveAttendance({ user, session, status: 'attended' });
        onMessage('Attendance recorded.', 'success');
        await refresh();
      } catch (error) {
        console.error('Could not save attendance:', error);
        onMessage(error?.message || 'Could not save attendance.', 'error');
        attendedButton.disabled = false;
      }
    });
    actions.append(attendedButton);
  }

  const absentButton = make('button', 'danger-outline-btn', state === 'upcoming' ? 'Report absence' : 'I was absent');
  absentButton.type = 'button';

  const absenceForm = make('form', 'absence-inline-form');
  absenceForm.hidden = true;

  const reasonLabel = make('label', 'field');
  reasonLabel.append(make('span', '', 'Reason for absence'));
  const reasonSelect = document.createElement('select');
  reasonSelect.required = true;
  reasonSelect.innerHTML = `
    <option value="">Choose a reason</option>
    <option>Not feeling well</option>
    <option>School commitment</option>
    <option>Family commitment</option>
    <option>Injury</option>
    <option>Transport issue</option>
    <option>Other</option>
  `;
  reasonLabel.append(reasonSelect);

  const detailsLabel = make('label', 'field');
  detailsLabel.append(make('span', '', 'Additional details (optional)'));
  const detailsInput = document.createElement('input');
  detailsInput.type = 'text';
  detailsInput.maxLength = 300;
  detailsInput.placeholder = 'Short explanation';
  detailsLabel.append(detailsInput);

  const formActions = make('div', 'attendance-actions');
  const cancelButton = make('button', 'secondary-btn', 'Cancel');
  cancelButton.type = 'button';
  const submitButton = make('button', 'danger-btn', 'Submit absence');
  submitButton.type = 'submit';
  formActions.append(cancelButton, submitButton);

  absenceForm.append(reasonLabel, detailsLabel, formActions);

  absentButton.addEventListener('click', () => {
    absenceForm.hidden = false;
    actions.hidden = true;
    reasonSelect.focus();
  });

  cancelButton.addEventListener('click', () => {
    absenceForm.reset();
    absenceForm.hidden = true;
    actions.hidden = false;
  });

  absenceForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!reasonSelect.value) return;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';
    try {
      await saveAttendance({
        user,
        session,
        status: 'absent',
        reason: reasonSelect.value,
        details: detailsInput.value.trim()
      });
      onMessage('Absence submitted.', 'success');
      await refresh();
    } catch (error) {
      console.error('Could not save absence:', error);
      onMessage(error?.message || 'Could not save absence.', 'error');
      submitButton.disabled = false;
      submitButton.textContent = 'Submit absence';
    }
  });

  actions.append(absentButton);
  card.append(actions, absenceForm);
  return card;
}

async function renderPlayerAttendance({ container, user, onMessage }) {
  const [sessions, records] = await Promise.all([
    getTrainingSessions(),
    getMyAttendance(user.uid)
  ]);

  container.replaceChildren();

  const heading = make('div', 'section-heading player-sessions-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'ATTENDANCE'),
    make('h2', '', 'My attendance'),
    make('p', '', 'Mark your attendance only for official training sessions. Upcoming sessions allow early absence reporting.')
  );
  heading.append(copy);
  container.append(heading);

  const list = make('div', 'attendance-list');
  const recordMap = new Map(records.map(record => [record.sessionId, record]));

  const refresh = async () => {
    await renderPlayerAttendance({ container, user, onMessage });
  };

  if (!sessions.length) {
    list.append(make('div', 'empty-card', 'No official training sessions yet.'));
  } else {
    for (const session of sessions) {
      list.append(buildPlayerAttendanceCard({
        session,
        record: recordMap.get(session.id),
        user,
        refresh,
        onMessage
      }));
    }
  }

  container.append(list);
}

async function getCoachAttendanceData() {
  const [sessionList, attendanceSnapshot, usersSnapshot] = await Promise.all([
    getTrainingSessions(),
    getDocs(collection(db, 'attendance')),
    getDocs(collection(db, 'users'))
  ]);

  const attendance = attendanceSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const players = usersSnapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(user => user.role === 'student' || user.role === 'player');

  return { sessionList, attendance, players };
}

function renderCoachTable({ target, session, attendance, players }) {
  target.replaceChildren();

  const sessionRecords = attendance.filter(record => record.sessionId === session.id);
  const byUid = new Map(sessionRecords.map(record => [record.studentUid, record]));

  const uniquePlayers = [...players];
  for (const record of sessionRecords) {
    if (!uniquePlayers.some(player => (player.uid || player.id) === record.studentUid)) {
      uniquePlayers.push({
        uid: record.studentUid,
        name: record.studentName || 'Player',
        email: record.studentEmail || '',
        className: record.className || ''
      });
    }
  }

  const attended = sessionRecords.filter(record => record.status === 'attended').length;
  const absent = sessionRecords.filter(record => record.status === 'absent').length;
  const noResponse = Math.max(0, uniquePlayers.length - byUid.size);

  const summary = make('div', 'attendance-summary');
  for (const [value, label] of [[attended, 'Attended'], [absent, 'Absent'], [noResponse, 'No response']]) {
    const box = make('div', 'attendance-summary-box');
    box.append(make('strong', '', String(value)), make('span', '', label));
    summary.append(box);
  }
  target.append(summary);

  if (!uniquePlayers.length) {
    target.append(make('div', 'empty-card', 'No player profiles or attendance records are available yet.'));
    return;
  }

  const wrapper = make('div', 'attendance-table-wrap');
  const table = document.createElement('table');
  table.className = 'attendance-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Player', 'Class', 'Status', 'Reason'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  uniquePlayers
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .forEach(player => {
      const uid = player.uid || player.id;
      const record = byUid.get(uid);
      const row = document.createElement('tr');

      const playerCell = document.createElement('td');
      playerCell.append(make('strong', '', player.name || 'Player'));
      if (player.email) playerCell.append(make('small', '', player.email));

      const classCell = document.createElement('td');
      classCell.textContent = player.className || '—';

      const statusCell = document.createElement('td');
      const status = record?.status || 'pending';
      statusCell.append(make(
        'span',
        `attendance-status ${status === 'attended' ? 'attended' : status === 'absent' ? 'absent' : 'pending'}`,
        status === 'attended' ? 'Attended' : status === 'absent' ? 'Absent' : 'No response'
      ));

      const reasonCell = document.createElement('td');
      reasonCell.textContent = record?.status === 'absent'
        ? (record.absenceDetails || record.absenceReason || '—')
        : '—';

      row.append(playerCell, classCell, statusCell, reasonCell);
      tbody.append(row);
    });

  table.append(thead, tbody);
  wrapper.append(table);
  target.append(wrapper);
}

async function renderCoachAttendance({ container }) {
  const { sessionList, attendance, players } = await getCoachAttendanceData();
  container.replaceChildren();

  const heading = make('div', 'section-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'ATTENDANCE'),
    make('h2', '', 'Training attendance'),
    make('p', '', 'Review player attendance by official training session.')
  );
  heading.append(copy);
  container.append(heading);

  if (!sessionList.length) {
    container.append(make('div', 'empty-card', 'Add a training session before reviewing attendance.'));
    return;
  }

  const filter = make('label', 'field attendance-session-filter');
  filter.append(make('span', '', 'Training session'));
  const select = document.createElement('select');
  for (const session of [...sessionList].sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))) {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = `${formatDate(session.trainingDate)} — ${session.title || 'Badminton Training'}`;
    select.append(option);
  }
  filter.append(select);
  container.append(filter);

  const target = make('div', 'coach-attendance-target');
  container.append(target);

  const draw = () => {
    const session = sessionList.find(item => item.id === select.value) || sessionList[0];
    renderCoachTable({ target, session, attendance, players });
  };

  select.addEventListener('change', draw);
  draw();
}

export async function renderAttendance({ container, role, user, onMessage }) {
  container.replaceChildren(make('div', 'loading-card', 'Loading attendance…'));
  try {
    if (role === 'coach') {
      await renderCoachAttendance({ container });
    } else {
      await renderPlayerAttendance({ container, user, onMessage });
    }
  } catch (error) {
    console.error('Could not load attendance:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load attendance. Check Firestore rules and try again.'));
  }
}
