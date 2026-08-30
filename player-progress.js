import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';
import { getTrainingSessions } from './sessions.js';
import { make, currentTermKey, termLabel, termKey, formatShortDate } from './development-utils.js';

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

async function loadPlayerDevelopment(uid) {
  const [sessions, attendanceSnap, reflectionsSnap, commentsSnap] = await Promise.all([
    getTrainingSessions(),
    getDocs(query(collection(db, 'attendance'), where('studentUid', '==', uid))),
    getDocs(query(collection(db, 'reflections'), where('studentUid', '==', uid))),
    getDocs(query(collection(db, 'comments'), where('studentUid', '==', uid)))
  ]);
  return {
    sessions,
    attendance: attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    reflections: reflectionsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    comments: commentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}

function reflectionStreak(attendance, reflections) {
  const done = new Set(reflections.map(r => r.sessionId));
  const required = attendance
    .filter(a => a.status === 'attended')
    .sort((a, b) => String(b.trainingDate || '').localeCompare(String(a.trainingDate || '')));
  let streak = 0;
  for (const record of required) {
    if (!done.has(record.sessionId)) break;
    streak += 1;
  }
  return streak;
}

function latestReflection(reflections) {
  return [...reflections].sort((a, b) => String(b.trainingDate || '').localeCompare(String(a.trainingDate || '')))[0] || null;
}

function latestFeedback(comments, reflections) {
  const dates = new Map(reflections.map(r => [r.id, r.trainingDate || '']));
  return [...comments].sort((a, b) => String(dates.get(b.reflectionId) || '').localeCompare(String(dates.get(a.reflectionId) || '')))[0] || null;
}

function tagCounts(comments) {
  const counts = new Map();
  for (const comment of comments) {
    for (const tag of comment.developmentTags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function stat(value, label, helper) {
  const card = make('article', 'progress-stat');
  card.append(make('strong', '', String(value)), make('span', '', label), make('small', '', helper));
  return card;
}

async function renderTermReflection({ container, user, onMessage, availableTerms }) {
  const section = make('section', 'term-reflection-card');
  const top = make('div', 'term-reflection-top');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'TERM REFLECTION'),
    make('h3', '', 'Look back before moving forward'),
    make('p', '', 'Capture your biggest improvement, challenge, proudest moment and next-term goal.')
  );
  const termSelect = document.createElement('select');
  termSelect.className = 'term-select';
  const terms = [...new Set([...availableTerms, currentTermKey()])].sort().reverse();
  terms.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = termLabel(key);
    termSelect.append(option);
  });
  termSelect.value = currentTermKey();
  top.append(copy, termSelect);
  section.append(top);

  const formWrap = make('div', 'term-reflection-form-wrap');
  section.append(formWrap);

  async function drawForm() {
    formWrap.replaceChildren(make('div', 'loading-card', 'Loading term reflection…'));
    const id = `${user.uid}_${termSelect.value}`;
    const snap = await getDoc(doc(db, 'termReflections', id));
    const existing = snap.exists() ? snap.data() : {};
    formWrap.replaceChildren();

    const form = document.createElement('form');
    form.className = 'term-reflection-form';
    const fields = [
      ['biggestImprovement', 'My biggest improvement', 'What improved most this term?'],
      ['stillStruggle', 'Something I still struggle with', 'What remains difficult?'],
      ['proudestMoment', 'My proudest moment', 'What moment are you most proud of?'],
      ['nextTermGoal', 'My goal next term', 'What will you work towards next?']
    ];
    const controls = {};
    for (const [name, labelText, placeholder] of fields) {
      const label = make('label', 'field');
      label.append(make('span', '', labelText));
      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.maxLength = 800;
      textarea.required = true;
      textarea.placeholder = placeholder;
      textarea.value = existing[name] || '';
      controls[name] = textarea;
      label.append(textarea);
      form.append(label);
    }
    const save = make('button', 'primary-btn', snap.exists() ? 'Update term reflection' : 'Save term reflection');
    save.type = 'submit';
    form.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      save.textContent = 'Saving…';
      try {
        await setDoc(doc(db, 'termReflections', id), {
          studentUid: user.uid,
          studentEmail: user.email || '',
          termKey: termSelect.value,
          biggestImprovement: controls.biggestImprovement.value.trim(),
          stillStruggle: controls.stillStruggle.value.trim(),
          proudestMoment: controls.proudestMoment.value.trim(),
          nextTermGoal: controls.nextTermGoal.value.trim(),
          updatedAt: serverTimestamp(),
          ...(snap.exists() ? {} : { createdAt: serverTimestamp() })
        }, { merge: true });
        onMessage('Term reflection saved.', 'success');
        await drawForm();
      } catch (error) {
        console.error('Could not save term reflection:', error);
        onMessage(error?.message || 'Could not save term reflection.', 'error');
        save.disabled = false;
        save.textContent = snap.exists() ? 'Update term reflection' : 'Save term reflection';
      }
    });
    formWrap.append(form);
  }

  termSelect.addEventListener('change', drawForm);
  await drawForm();
  container.append(section);
}

export async function renderPlayerProgress({ container, user, onMessage }) {
  container.replaceChildren(make('div', 'loading-card', 'Building your progress view…'));
  try {
    const data = await loadPlayerDevelopment(user.uid);
    container.replaceChildren();

    const attended = data.attendance.filter(a => a.status === 'attended');
    const recorded = data.attendance.filter(a => ['attended', 'absent'].includes(a.status));
    const latest = latestReflection(data.reflections);
    const feedback = latestFeedback(data.comments, data.reflections);
    const tags = tagCounts(data.comments);
    const streak = reflectionStreak(data.attendance, data.reflections);

    const heading = make('div', 'section-heading');
    const copy = make('div');
    copy.append(
      make('span', 'section-kicker', 'MY PROGRESS'),
      make('h2', '', 'Player development'),
      make('p', '', 'Your training records should connect from one session to the next—not disappear after submission.')
    );
    heading.append(copy);
    container.append(heading);

    const stats = make('div', 'progress-stats');
    stats.append(
      stat(`${pct(attended.length, recorded.length)}%`, 'Attendance', `${attended.length} trainings attended`),
      stat(data.reflections.length, 'Reflections', 'Completed journal entries'),
      stat(streak, 'Reflection streak', streak === 1 ? '1 completed session in a row' : `${streak} completed sessions in a row`),
      stat(data.comments.length, 'Coach feedback', 'Feedback records received')
    );
    container.append(stats);

    const continuity = make('div', 'progress-continuity-grid');
    const goal = make('article', 'progress-feature-card goal-card');
    goal.append(make('span', 'section-kicker', 'CURRENT GOAL'), make('h3', '', latest?.nextGoal || 'Set your next goal in your next reflection.'));
    if (latest?.trainingDate) goal.append(make('small', '', `From ${formatShortDate(latest.trainingDate)}`));
    continuity.append(goal);

    const feedbackCard = make('article', 'progress-feature-card');
    feedbackCard.append(make('span', 'section-kicker', 'LATEST FEEDBACK'));
    feedbackCard.append(make('p', '', feedback?.comment || 'No coach feedback yet.'));
    if (feedback?.developmentTags?.length) {
      const chips = make('div', 'development-tag-row');
      feedback.developmentTags.forEach(tag => chips.append(make('span', 'development-tag', tag)));
      feedbackCard.append(chips);
    }
    continuity.append(feedbackCard);
    container.append(continuity);

    const development = make('article', 'development-areas-card');
    development.append(make('span', 'section-kicker', 'DEVELOPMENT AREAS'), make('h3', '', 'What coaches are highlighting'));
    if (!tags.length) {
      development.append(make('p', '', 'Development tags will appear here after Coach/Teacher feedback is tagged.'));
    } else {
      const list = make('div', 'development-area-list');
      tags.slice(0, 6).forEach(([tag, count]) => {
        const item = make('div', 'development-area-item');
        item.append(make('strong', '', tag), make('span', '', `${count} feedback${count === 1 ? '' : 's'}`));
        list.append(item);
      });
      development.append(list);
    }
    container.append(development);

    const availableTerms = data.sessions.map(s => termKey(s.trainingDate));
    await renderTermReflection({ container, user, onMessage, availableTerms });
  } catch (error) {
    console.error('Could not load player progress:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load player progress. Check Firestore rules and try again.'));
  }
}
