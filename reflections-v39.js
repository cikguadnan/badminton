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
import { renderReflections as renderBaseReflections } from './staff-reflections.js';

const DEVELOPMENT_TAGS = ['Footwork', 'Serve', 'Technique', 'Tactics', 'Stamina', 'Mental', 'Teamwork'];

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

async function addPlayerGoalContinuity(container, user) {
  if (container.querySelector('.journal-goal-banner')) return;
  const snap = await getDocs(query(collection(db, 'reflections'), where('studentUid', '==', user.uid)));
  const reflections = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => String(b.trainingDate || '').localeCompare(String(a.trainingDate || '')));
  const latestGoal = reflections.find(r => String(r.nextGoal || '').trim());
  if (!latestGoal) return;

  const banner = make('article', 'journal-goal-banner');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'GOAL FROM LAST TRAINING'),
    make('h3', '', latestGoal.nextGoal),
    make('p', '', 'Keep this in mind during your next session. When you reflect again, consider whether you moved closer to this goal.')
  );
  banner.append(copy);
  const heading = container.querySelector('.section-heading');
  if (heading) heading.after(banner); else container.prepend(banner);
}

async function staffDataForSelectedSession(container) {
  const sessionSelect = container.querySelector('.attendance-session-filter select');
  if (!sessionSelect?.value) return null;
  const [refSnap, commentSnap] = await Promise.all([
    getDocs(collection(db, 'reflections')),
    getDocs(collection(db, 'comments'))
  ]);
  const reflections = refSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.sessionId === sessionSelect.value)
    .sort((a,b) => String(a.studentName || '').localeCompare(String(b.studentName || '')));
  const comments = commentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { reflections, comments };
}

async function mergeTagsWhenCommentExists(commentId, tags, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const ref = doc(db, 'comments', commentId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await setDoc(ref, { developmentTags: tags, updatedAt: serverTimestamp() }, { merge: true });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 180));
  }
}

async function enhanceStaffCards(container, user) {
  const data = await staffDataForSelectedSession(container);
  if (!data) return;
  const cards = [...container.querySelectorAll('.coach-reflection-card')];
  cards.forEach((card, index) => {
    const reflection = data.reflections[index];
    if (!reflection || card.dataset.tagEnhanced === '1') return;
    card.dataset.tagEnhanced = '1';
    card.dataset.reflectionId = reflection.id;

    const form = card.querySelector('.coach-feedback-form');
    if (!form) return;
    const existing = data.comments.find(c => c.reflectionId === reflection.id && c.teacherUid === user.uid);
    const selected = new Set(existing?.developmentTags || []);

    const fieldset = make('fieldset', 'development-tag-field');
    const legend = document.createElement('legend');
    legend.textContent = 'Development tags (optional)';
    fieldset.append(legend);
    const wrap = make('div', 'development-tag-options');
    DEVELOPMENT_TAGS.forEach(tag => {
      const label = make('label', 'development-tag-option');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = tag;
      input.checked = selected.has(tag);
      label.append(input, make('span', '', tag));
      wrap.append(label);
    });
    fieldset.append(wrap);
    const button = form.querySelector('button[type="submit"]');
    if (button) form.insertBefore(fieldset, button); else form.append(fieldset);

    form.addEventListener('submit', () => {
      const tags = [...fieldset.querySelectorAll('input:checked')].map(input => input.value);
      const commentId = `${reflection.id}_${user.uid}`;
      mergeTagsWhenCommentExists(commentId, tags).catch(error => console.warn('Could not save development tags:', error));
    });
  });
}

function installStaffEnhancer(container, user) {
  if (container.dataset.v39TagObserver === '1') return;
  container.dataset.v39TagObserver = '1';
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(async () => {
      queued = false;
      try { await enhanceStaffCards(container, user); } catch (error) { console.warn('Could not enhance feedback tags:', error); }
    }, 80);
  });
  observer.observe(container, { childList: true, subtree: true });
  container.addEventListener('change', event => {
    if (event.target.closest('.attendance-session-filter')) {
      setTimeout(() => enhanceStaffCards(container, user), 100);
    }
  });
}

export async function renderReflections(options) {
  const staff = options.role === 'teacher' || options.role === 'coach';
  if (staff) installStaffEnhancer(options.container, options.user);
  await renderBaseReflections(options);

  if (staff) {
    await enhanceStaffCards(options.container, options.user);
  } else {
    await addPlayerGoalContinuity(options.container, options.user);
  }
}
