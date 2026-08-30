import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export async function getTrainingSessions() {
  const snapshot = await getDocs(query(collection(db, 'trainingSessions'), orderBy('trainingDate', 'asc')));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.active !== false);
}

export async function createTrainingSession({ trainingDate, title, focus, user }) {
  if (!trainingDate) throw new Error('Choose a training date.');
  const reference = doc(db, 'trainingSessions', trainingDate);
  const existing = await getDoc(reference);
  if (existing.exists()) throw new Error('A training session already exists on this date.');

  const dueDate = addDays(trainingDate, 6);
  const opensAt = new Date(`${trainingDate}T00:00:00+08:00`);
  const closesAt = new Date(`${dueDate}T23:59:59+08:00`);

  await setDoc(reference, {
    trainingDate,
    dueDate,
    title: title.trim() || 'Badminton Training',
    focus: focus.trim(),
    active: true,
    opensAt: Timestamp.fromDate(opensAt),
    closesAt: Timestamp.fromDate(closesAt),
    createdBy: user.uid,
    createdByName: user.displayName || user.email || 'Coach',
    createdAt: serverTimestamp()
  });
}

export async function removeTrainingSession(sessionId) {
  await deleteDoc(doc(db, 'trainingSessions', sessionId));
}

function buildSessionCard(session, role, onDelete) {
  const card = make('article', 'training-card');
  const dateBlock = make('div', 'training-date');
  const date = new Date(`${session.trainingDate}T00:00:00+08:00`);
  dateBlock.append(
    make('span', '', new Intl.DateTimeFormat('en-SG', { weekday: 'short' }).format(date)),
    make('strong', '', String(date.getDate())),
    make('small', '', new Intl.DateTimeFormat('en-SG', { month: 'short' }).format(date))
  );

  const body = make('div', 'training-card-body');
  const topLine = make('div', 'training-card-topline');
  const state = sessionState(session);
  topLine.append(
    make('span', `session-status ${state}`, state === 'open' ? 'Open' : state === 'closed' ? 'Closed' : 'Upcoming'),
    make('span', 'training-deadline', `Reflection closes ${formatDate(session.dueDate)}`)
  );
  body.append(topLine, make('h3', '', session.title || 'Badminton Training'));
  body.append(make('p', '', session.focus || 'General badminton training'));

  card.append(dateBlock, body);

  if (role === 'coach') {
    const actions = make('div', 'training-actions');
    const removeButton = make('button', 'danger-outline-btn', 'Remove');
    removeButton.type = 'button';
    removeButton.addEventListener('click', () => onDelete(session));
    actions.append(removeButton);
    card.append(actions);
  }

  return card;
}

export async function renderTrainingSessions({ container, role, user, onMessage }) {
  container.replaceChildren(make('div', 'loading-card', 'Loading training sessions…'));
  try {
    const sessions = await getTrainingSessions();
    container.replaceChildren();

    if (role === 'coach') {
      const panel = make('section', 'training-management-panel');
      const header = make('div', 'section-heading');
      const headingCopy = make('div');
      headingCopy.append(
        make('span', 'section-kicker', 'TRAINING SCHEDULE'),
        make('h2', '', 'Official training dates'),
        make('p', '', 'Create the sessions that players will see. Each session automatically gets a 7-day reflection window.')
      );
      const addButton = make('button', 'primary-btn', '+ Add training date');
      addButton.type = 'button';
      header.append(headingCopy, addButton);
      panel.append(header);

      const formWrap = make('div', 'session-form-wrap');
      formWrap.hidden = true;
      const form = document.createElement('form');
      form.className = 'session-form';

      const dateField = make('label', 'field');
      dateField.append(make('span', '', 'Training date'));
      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.name = 'trainingDate';
      dateInput.required = true;
      dateField.append(dateInput);

      const titleField = make('label', 'field');
      titleField.append(make('span', '', 'Session title'));
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.name = 'title';
      titleInput.maxLength = 80;
      titleInput.value = 'Badminton Training';
      titleInput.required = true;
      titleField.append(titleInput);

      const focusField = make('label', 'field field-wide');
      focusField.append(make('span', '', 'Focus / notes (optional)'));
      const focusInput = document.createElement('input');
      focusInput.type = 'text';
      focusInput.name = 'focus';
      focusInput.maxLength = 120;
      focusInput.placeholder = 'e.g. Footwork & Match Play';
      focusField.append(focusInput);

      const formActions = make('div', 'session-form-actions field-wide');
      const cancelButton = make('button', 'secondary-btn', 'Cancel');
      cancelButton.type = 'button';
      const saveButton = make('button', 'primary-btn', 'Add session');
      saveButton.type = 'submit';
      formActions.append(cancelButton, saveButton);
      form.append(dateField, titleField, focusField, formActions);
      formWrap.append(form);
      panel.append(formWrap);
      container.append(panel);

      addButton.addEventListener('click', () => {
        formWrap.hidden = false;
        addButton.disabled = true;
        dateInput.focus();
      });

      cancelButton.addEventListener('click', () => {
        form.reset();
        titleInput.value = 'Badminton Training';
        formWrap.hidden = true;
        addButton.disabled = false;
      });

      form.addEventListener('submit', async event => {
        event.preventDefault();
        saveButton.disabled = true;
        saveButton.textContent = 'Adding…';
        try {
          await createTrainingSession({
            trainingDate: dateInput.value,
            title: titleInput.value,
            focus: focusInput.value,
            user
          });
          onMessage('Training session added.', 'success');
          await renderTrainingSessions({ container, role, user, onMessage });
        } catch (error) {
          console.error('Could not add training session:', error);
          onMessage(error?.message || 'Could not add training session.', 'error');
          saveButton.disabled = false;
          saveButton.textContent = 'Add session';
        }
      });
    } else {
      const playerHeader = make('div', 'section-heading player-sessions-heading');
      const copy = make('div');
      copy.append(
        make('span', 'section-kicker', 'YOUR TRAINING'),
        make('h2', '', 'Training sessions'),
        make('p', '', 'Official sessions created by your coach appear here.')
      );
      playerHeader.append(copy);
      container.append(playerHeader);
    }

    const list = make('div', 'training-list');
    if (!sessions.length) {
      list.append(make('div', 'empty-card', role === 'coach' ? 'No training dates yet. Add the first session for this term.' : 'No training dates have been added yet.'));
    } else {
      for (const session of sessions) {
        list.append(buildSessionCard(session, role, async selected => {
          const confirmed = window.confirm(`Remove training on ${formatDate(selected.trainingDate)}?`);
          if (!confirmed) return;
          try {
            await removeTrainingSession(selected.id);
            onMessage('Training session removed.', 'success');
            await renderTrainingSessions({ container, role, user, onMessage });
          } catch (error) {
            console.error('Could not remove training session:', error);
            onMessage('Could not remove training session.', 'error');
          }
        }));
      }
    }
    container.append(list);
  } catch (error) {
    console.error('Could not load training sessions:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load training sessions. Check Firestore rules and try again.'));
  }
}
