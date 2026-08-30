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
import { getUserProfile } from './profile.js';

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

function reflectionId(uid, sessionId) {
  return `${uid}_${sessionId}`;
}

async function getPlayerRecords(uid) {
  const [attendanceSnapshot, reflectionSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'attendance'), where('studentUid', '==', uid))),
    getDocs(query(collection(db, 'reflections'), where('studentUid', '==', uid)))
  ]);
  return {
    attendance: attendanceSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
    reflections: reflectionSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
  };
}

async function getCommentsForReflection(reflectionIdValue) {
  const snapshot = await getDocs(query(collection(db, 'comments'), where('reflectionId', '==', reflectionIdValue)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function saveReflection({ user, session, values }) {
  const profile = await getUserProfile(user.uid);
  const reference = doc(db, 'reflections', reflectionId(user.uid, session.id));
  await setDoc(reference, {
    studentUid: user.uid,
    studentEmail: user.email || '',
    studentName: profile?.name || user.displayName || 'Player',
    className: profile?.className || '',
    sessionId: session.id,
    trainingDate: session.trainingDate,
    activities: values.activities,
    wentWell: values.wentWell,
    improvement: values.improvement,
    nextGoal: values.nextGoal,
    effort: values.effort,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });
}

function addTextAreaField(form, labelText, name, value, placeholder) {
  const label = make('label', 'field field-wide');
  label.append(make('span', '', labelText));
  const textarea = document.createElement('textarea');
  textarea.name = name;
  textarea.rows = 4;
  textarea.maxLength = 1000;
  textarea.required = true;
  textarea.placeholder = placeholder;
  textarea.value = value || '';
  label.append(textarea);
  form.append(label);
  return textarea;
}

function buildReflectionForm({ session, existing, user, onSaved, onCancel, onMessage }) {
  const form = document.createElement('form');
  form.className = 'reflection-form';

  const intro = make('div', 'reflection-form-intro field-wide');
  intro.append(
    make('strong', '', session.title || 'Badminton Training'),
    make('span', '', `${formatDate(session.trainingDate)} • Due ${formatDate(session.dueDate)}`)
  );
  form.append(intro);

  const activitiesField = make('fieldset', 'activities-field field-wide');
  const legend = document.createElement('legend');
  legend.textContent = 'What did you work on?';
  activitiesField.append(legend);
  const activitiesGrid = make('div', 'activity-options');
  const activityOptions = ['Warm-up', 'Footwork', 'Stroke drills', 'Serving & receiving', 'Match play', 'Fitness'];
  const selected = new Set(existing?.activities || []);
  for (const activity of activityOptions) {
    const label = make('label', 'activity-chip');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = activity;
    input.checked = selected.has(activity);
    label.append(input, make('span', '', activity));
    activitiesGrid.append(label);
  }
  activitiesField.append(activitiesGrid);
  form.append(activitiesField);

  const wentWell = addTextAreaField(form, 'What went well today?', 'wentWell', existing?.wentWell, 'Describe one thing you did well.');
  const improvement = addTextAreaField(form, 'What do you need to improve?', 'improvement', existing?.improvement, 'Be specific about one area to work on.');
  const nextGoal = addTextAreaField(form, 'What is your goal for the next training?', 'nextGoal', existing?.nextGoal, 'Write one clear and achievable goal.');

  const effortField = make('label', 'field field-wide effort-field');
  effortField.append(make('span', '', 'Effort today'));
  const effortSelect = document.createElement('select');
  effortSelect.required = true;
  effortSelect.innerHTML = `
    <option value="">Choose 1–5</option>
    <option value="1">1 — Very low</option>
    <option value="2">2 — Low</option>
    <option value="3">3 — Good</option>
    <option value="4">4 — Strong</option>
    <option value="5">5 — Excellent</option>
  `;
  if (existing?.effort) effortSelect.value = String(existing.effort);
  effortField.append(effortSelect);
  form.append(effortField);

  const actions = make('div', 'reflection-form-actions field-wide');
  const cancelButton = make('button', 'secondary-btn', 'Cancel');
  cancelButton.type = 'button';
  const saveButton = make('button', 'primary-btn', existing ? 'Update reflection' : 'Submit reflection');
  saveButton.type = 'submit';
  actions.append(cancelButton, saveButton);
  form.append(actions);

  cancelButton.addEventListener('click', onCancel);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const activities = [...activitiesGrid.querySelectorAll('input:checked')].map(input => input.value);
    if (!activities.length) {
      onMessage('Choose at least one training activity.', 'error');
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    try {
      await saveReflection({
        user,
        session,
        values: {
          activities,
          wentWell: wentWell.value.trim(),
          improvement: improvement.value.trim(),
          nextGoal: nextGoal.value.trim(),
          effort: Number(effortSelect.value)
        }
      });
      onMessage(existing ? 'Reflection updated.' : 'Reflection submitted.', 'success');
      await onSaved();
    } catch (error) {
      console.error('Could not save reflection:', error);
      onMessage(error?.message || 'Could not save reflection.', 'error');
      saveButton.disabled = false;
      saveButton.textContent = existing ? 'Update reflection' : 'Submit reflection';
    }
  });

  return form;
}

async function buildPlayerReflectionCard({ session, attendance, reflection, user, refresh, onMessage }) {
  const card = make('article', 'reflection-card');
  const header = make('div', 'reflection-card-header');
  const left = make('div');
  left.append(
    make('span', 'section-kicker', formatDate(session.trainingDate)),
    make('h3', '', session.title || 'Badminton Training'),
    make('p', '', `Reflection closes ${formatDate(session.dueDate)}`)
  );
  header.append(left);
  card.append(header);

  const state = sessionState(session);

  if (attendance?.status === 'absent') {
    card.append(make('div', 'reflection-note', 'You were marked absent for this session, so no reflection is required.'));
    return card;
  }

  if (attendance?.status !== 'attended') {
    card.append(make('div', 'reflection-note', 'Mark your attendance first. Reflections are available after you attend training.'));
    return card;
  }

  if (reflection) {
    const summary = make('div', 'reflection-summary');
    summary.append(
      make('div', '', `Effort: ${reflection.effort}/5`),
      make('div', '', `Activities: ${(reflection.activities || []).join(', ')}`)
    );
    card.append(summary);

    const qa = make('div', 'reflection-answers');
    for (const [label, value] of [
      ['Went well', reflection.wentWell],
      ['Improve', reflection.improvement],
      ['Next goal', reflection.nextGoal]
    ]) {
      const item = make('div', 'reflection-answer');
      item.append(make('strong', '', label), make('p', '', value || '—'));
      qa.append(item);
    }
    card.append(qa);

    const comments = await getCommentsForReflection(reflection.id);
    if (comments.length) {
      const feedback = make('div', 'coach-feedback-box');
      feedback.append(make('span', 'section-kicker', 'COACH FEEDBACK'));
      for (const comment of comments) feedback.append(make('p', '', comment.comment || ''));
      card.append(feedback);
    }

    if (state === 'open') {
      const editButton = make('button', 'secondary-btn reflection-edit-btn', 'Edit reflection');
      editButton.type = 'button';
      const formWrap = make('div', 'reflection-form-wrap');
      formWrap.hidden = true;
      editButton.addEventListener('click', () => {
        editButton.hidden = true;
        formWrap.hidden = false;
      });
      formWrap.append(buildReflectionForm({
        session,
        existing: reflection,
        user,
        onSaved: refresh,
        onCancel: () => {
          formWrap.hidden = true;
          editButton.hidden = false;
        },
        onMessage
      }));
      card.append(editButton, formWrap);
    }
    return card;
  }

  if (state === 'closed') {
    card.append(make('div', 'reflection-note', 'The 7-day reflection window has closed.'));
    return card;
  }

  const startButton = make('button', 'primary-btn reflection-start-btn', 'Complete reflection');
  startButton.type = 'button';
  const formWrap = make('div', 'reflection-form-wrap');
  formWrap.hidden = true;
  startButton.addEventListener('click', () => {
    startButton.hidden = true;
    formWrap.hidden = false;
  });
  formWrap.append(buildReflectionForm({
    session,
    existing: null,
    user,
    onSaved: refresh,
    onCancel: () => {
      formWrap.hidden = true;
      startButton.hidden = false;
    },
    onMessage
  }));
  card.append(startButton, formWrap);
  return card;
}

async function renderPlayerReflections({ container, user, onMessage }) {
  const [sessions, records] = await Promise.all([
    getTrainingSessions(),
    getPlayerRecords(user.uid)
  ]);

  container.replaceChildren();
  const heading = make('div', 'section-heading player-sessions-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'JOURNAL'),
    make('h2', '', 'Training reflections'),
    make('p', '', 'Reflect on attended sessions within the 7-day window. You can return and edit while the window is open.')
  );
  heading.append(copy);
  container.append(heading);

  const attendanceMap = new Map(records.attendance.map(item => [item.sessionId, item]));
  const reflectionMap = new Map(records.reflections.map(item => [item.sessionId, item]));
  const list = make('div', 'reflection-list');

  const refresh = async () => {
    await renderPlayerReflections({ container, user, onMessage });
  };

  const eligible = sessions.filter(session => attendanceMap.has(session.id) || sessionState(session) !== 'upcoming');
  if (!eligible.length) {
    list.append(make('div', 'empty-card', 'No reflection tasks yet.'));
  } else {
    for (const session of [...eligible].sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))) {
      list.append(await buildPlayerReflectionCard({
        session,
        attendance: attendanceMap.get(session.id),
        reflection: reflectionMap.get(session.id),
        user,
        refresh,
        onMessage
      }));
    }
  }
  container.append(list);
}

async function getCoachReflectionData() {
  const [sessions, reflectionsSnapshot, commentsSnapshot] = await Promise.all([
    getTrainingSessions(),
    getDocs(collection(db, 'reflections')),
    getDocs(collection(db, 'comments'))
  ]);
  return {
    sessions,
    reflections: reflectionsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
    comments: commentsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
  };
}

async function saveCoachComment({ reflection, user, comment }) {
  const commentId = `${reflection.id}_${user.uid}`;
  await setDoc(doc(db, 'comments', commentId), {
    reflectionId: reflection.id,
    studentUid: reflection.studentUid,
    teacherUid: user.uid,
    teacherName: user.displayName || user.email || 'Coach',
    comment: comment.trim(),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });
}

function buildCoachReflectionCard({ reflection, existingComment, user, onSaved, onMessage }) {
  const card = make('article', 'coach-reflection-card');
  const top = make('div', 'coach-reflection-top');
  const player = make('div');
  player.append(
    make('h3', '', reflection.studentName || 'Player'),
    make('p', '', `${reflection.className || 'Class not set'} • ${reflection.studentEmail || ''}`)
  );
  top.append(player, make('span', 'effort-badge', `Effort ${reflection.effort || '—'}/5`));
  card.append(top);

  if (reflection.activities?.length) {
    const chips = make('div', 'reflection-chips');
    for (const activity of reflection.activities) chips.append(make('span', '', activity));
    card.append(chips);
  }

  const answers = make('div', 'reflection-answers coach');
  for (const [label, value] of [
    ['Went well', reflection.wentWell],
    ['Needs improvement', reflection.improvement],
    ['Next goal', reflection.nextGoal]
  ]) {
    const item = make('div', 'reflection-answer');
    item.append(make('strong', '', label), make('p', '', value || '—'));
    answers.append(item);
  }
  card.append(answers);

  const feedbackForm = document.createElement('form');
  feedbackForm.className = 'coach-feedback-form';
  const field = make('label', 'field');
  field.append(make('span', '', 'Coach feedback'));
  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.maxLength = 800;
  textarea.required = true;
  textarea.placeholder = 'Give specific, encouraging feedback and a next step.';
  textarea.value = existingComment?.comment || '';
  field.append(textarea);
  const button = make('button', 'primary-btn', existingComment ? 'Update feedback' : 'Send feedback');
  button.type = 'submit';
  feedbackForm.append(field, button);
  card.append(feedbackForm);

  feedbackForm.addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await saveCoachComment({ reflection, user, comment: textarea.value });
      onMessage('Coach feedback saved.', 'success');
      await onSaved();
    } catch (error) {
      console.error('Could not save coach feedback:', error);
      onMessage(error?.message || 'Could not save feedback.', 'error');
      button.disabled = false;
      button.textContent = existingComment ? 'Update feedback' : 'Send feedback';
    }
  });

  return card;
}

async function renderCoachReflections({ container, user, onMessage }) {
  const data = await getCoachReflectionData();
  container.replaceChildren();

  const heading = make('div', 'section-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'REFLECTIONS'),
    make('h2', '', 'Player reflections & feedback'),
    make('p', '', 'Review player reflections and give individual coach feedback.')
  );
  heading.append(copy);
  container.append(heading);

  if (!data.sessions.length) {
    container.append(make('div', 'empty-card', 'No training sessions yet.'));
    return;
  }

  const filter = make('label', 'field attendance-session-filter');
  filter.append(make('span', '', 'Training session'));
  const select = document.createElement('select');
  for (const session of [...data.sessions].sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))) {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = `${formatDate(session.trainingDate)} — ${session.title || 'Badminton Training'}`;
    select.append(option);
  }
  filter.append(select);
  container.append(filter);

  const target = make('div', 'coach-reflections-target');
  container.append(target);

  const refresh = async () => {
    await renderCoachReflections({ container, user, onMessage });
  };

  const draw = () => {
    target.replaceChildren();
    const selectedSession = data.sessions.find(item => item.id === select.value) || data.sessions[0];
    const reflections = data.reflections
      .filter(item => item.sessionId === selectedSession.id)
      .sort((a, b) => String(a.studentName || '').localeCompare(String(b.studentName || '')));

    if (!reflections.length) {
      target.append(make('div', 'empty-card', 'No reflections submitted for this training session yet.'));
      return;
    }

    for (const reflection of reflections) {
      const existingComment = data.comments.find(comment =>
        comment.reflectionId === reflection.id && comment.teacherUid === user.uid
      );
      target.append(buildCoachReflectionCard({
        reflection,
        existingComment,
        user,
        onSaved: refresh,
        onMessage
      }));
    }
  };

  select.addEventListener('change', draw);
  draw();
}

export async function renderReflections({ container, role, user, onMessage }) {
  container.replaceChildren(make('div', 'loading-card', 'Loading reflections…'));
  try {
    if (role === 'coach') {
      await renderCoachReflections({ container, user, onMessage });
    } else {
      await renderPlayerReflections({ container, user, onMessage });
    }
  } catch (error) {
    console.error('Could not load reflections:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load reflections. Check Firestore rules and try again.'));
  }
}
