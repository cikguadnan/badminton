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

const PAGE_SIZE = 3;

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return ymd(date);
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  await setDoc(reference, {
    trainingDate,
    dueDate,
    title: title.trim() || 'Badminton Training',
    focus: focus.trim(),
    active: true,
    opensAt: Timestamp.fromDate(new Date(`${trainingDate}T00:00:00+08:00`)),
    closesAt: Timestamp.fromDate(new Date(`${dueDate}T23:59:59+08:00`)),
    createdBy: user.uid,
    createdByName: user.displayName || user.email || 'Coach',
    createdAt: serverTimestamp()
  });
}

async function createBulkSessions({ dates, title, focus, user, existingDates }) {
  const freshDates = dates.filter(date => !existingDates.has(date));
  if (!freshDates.length) throw new Error('Select at least one new training date.');
  await Promise.all(freshDates.map(trainingDate => createTrainingSession({ trainingDate, title, focus, user })));
  return freshDates.length;
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
  const top = make('div', 'training-card-topline');
  const state = sessionState(session);
  top.append(
    make('span', `session-status ${state}`, state === 'open' ? 'Open' : state === 'closed' ? 'Closed' : 'Upcoming'),
    make('span', 'training-deadline', `Reflection closes ${formatDate(session.dueDate)}`)
  );
  body.append(
    top,
    make('h3', '', session.title || 'Badminton Training'),
    make('p', '', session.focus || 'General badminton training')
  );
  card.append(dateBlock, body);

  if (role === 'coach') {
    const actions = make('div', 'training-actions');
    const remove = make('button', 'danger-outline-btn', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => onDelete(session));
    actions.append(remove);
    card.append(actions);
  }
  return card;
}

function createPager({ items, list, renderItem, initialPage = 0 }) {
  let page = Math.max(0, Math.min(initialPage, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1)));
  const pager = make('div', 'list-pager');

  const draw = () => {
    list.replaceChildren();
    const start = page * PAGE_SIZE;
    const visible = items.slice(start, start + PAGE_SIZE);
    visible.forEach(item => list.append(renderItem(item)));

    pager.replaceChildren();
    if (items.length <= PAGE_SIZE) return;

    const prev = make('button', 'pager-btn', '← Previous');
    prev.type = 'button';
    prev.disabled = page === 0;

    const count = make(
      'span',
      'pager-count',
      `${start + 1}–${Math.min(start + PAGE_SIZE, items.length)} of ${items.length}`
    );

    const next = make('button', 'pager-btn', 'Next →');
    next.type = 'button';
    next.disabled = start + PAGE_SIZE >= items.length;

    prev.addEventListener('click', () => {
      page -= 1;
      draw();
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    next.addEventListener('click', () => {
      page += 1;
      draw();
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    pager.append(prev, count, next);
  };

  draw();
  return pager;
}

function initialRelevantPage(sessions) {
  if (!sessions.length) return 0;
  const today = todayYmd();
  const index = sessions.findIndex(session => session.trainingDate >= today);
  return Math.floor((index >= 0 ? index : Math.max(0, sessions.length - 1)) / PAGE_SIZE);
}

function buildBulkCalendar({ sessions, user, onSaved, onMessage }) {
  const shell = make('div', 'bulk-calendar-shell compact-calendar');
  const existingDates = new Set(sessions.map(session => session.trainingDate));
  const selectedDates = new Set();
  const today = todayYmd();
  const now = new Date(`${today}T12:00:00+08:00`);
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);

  const top = make('div', 'bulk-calendar-top');
  const titleWrap = make('div');
  titleWrap.append(
    make('span', 'section-kicker', 'BULK SCHEDULER'),
    make('h3', '', 'Tap training dates'),
    make('p', 'calendar-helper', 'Choose several dates, then create them together.')
  );

  const nav = make('div', 'calendar-nav');
  const prev = make('button', 'calendar-nav-btn', '‹');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous month');
  const monthLabel = make('strong', 'calendar-month', '');
  const next = make('button', 'calendar-nav-btn', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next month');
  nav.append(prev, monthLabel, next);
  top.append(titleWrap, nav);

  const week = make('div', 'calendar-weekdays');
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(day => week.append(make('span', '', day)));

  const grid = make('div', 'calendar-grid');

  const form = document.createElement('form');
  form.className = 'bulk-session-form';

  const titleField = make('label', 'field');
  titleField.append(make('span', '', 'Session title'));
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 80;
  titleInput.value = 'Badminton Training';
  titleInput.required = true;
  titleField.append(titleInput);

  const focusField = make('label', 'field');
  focusField.append(make('span', '', 'Focus / notes (optional)'));
  const focusInput = document.createElement('input');
  focusInput.type = 'text';
  focusInput.maxLength = 120;
  focusInput.placeholder = 'e.g. Footwork & Match Play';
  focusField.append(focusInput);

  const summary = make('div', 'calendar-selection-summary', 'No dates selected');
  const save = make('button', 'primary-btn bulk-save-btn', 'Create sessions');
  save.type = 'submit';
  save.disabled = true;
  form.append(titleField, focusField, summary, save);

  function updateSummary() {
    const count = selectedDates.size;
    summary.textContent = count
      ? `${count} date${count === 1 ? '' : 's'} selected`
      : 'No dates selected';
    save.disabled = count === 0;
  }

  function renderMonth() {
    grid.replaceChildren();
    monthLabel.textContent = new Intl.DateTimeFormat('en-SG', { month: 'short', year: 'numeric' }).format(cursor);

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const mondayIndex = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < mondayIndex; i += 1) grid.append(make('span', 'calendar-blank', ''));

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateObj = new Date(year, month, day);
      const dateStr = ymd(dateObj);
      const button = make('button', 'calendar-day', String(day));
      button.type = 'button';

      if (dateStr === today) button.classList.add('today');

      if (existingDates.has(dateStr)) {
        button.classList.add('existing');
        button.disabled = true;
        button.title = 'Training already scheduled';
      } else if (dateStr < today) {
        button.classList.add('past');
        button.disabled = true;
        button.title = 'Past date';
      } else {
        if (selectedDates.has(dateStr)) button.classList.add('selected');
        button.addEventListener('click', () => {
          if (selectedDates.has(dateStr)) selectedDates.delete(dateStr);
          else selectedDates.add(dateStr);
          renderMonth();
          updateSummary();
        });
      }
      grid.append(button);
    }
  }

  prev.addEventListener('click', () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    renderMonth();
  });
  next.addEventListener('click', () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    renderMonth();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    save.textContent = 'Creating…';
    try {
      const count = await createBulkSessions({
        dates: [...selectedDates],
        title: titleInput.value,
        focus: focusInput.value,
        user,
        existingDates
      });
      onMessage(`${count} training session${count === 1 ? '' : 's'} created.`, 'success');
      await onSaved();
    } catch (error) {
      console.error('Bulk schedule failed:', error);
      onMessage(error?.message || 'Could not create selected sessions.', 'error');
      save.disabled = false;
      save.textContent = 'Create sessions';
    }
  });

  shell.append(top, week, grid, form);
  renderMonth();
  updateSummary();
  return shell;
}

export async function renderTrainingSessions({ container, role, user, onMessage }) {
  container.replaceChildren(make('div', 'loading-card', 'Loading training sessions…'));

  try {
    const sessions = await getTrainingSessions();
    container.replaceChildren();

    if (role === 'coach') {
      const heading = make('div', 'section-heading compact-section-heading');
      const copy = make('div');
      copy.append(
        make('span', 'section-kicker', 'TRAINING SCHEDULE'),
        make('h2', '', 'Training calendar'),
        make('p', '', 'Select multiple training dates quickly. Existing dates are marked automatically.')
      );
      heading.append(copy);
      container.append(heading);
      container.append(buildBulkCalendar({
        sessions,
        user,
        onMessage,
        onSaved: () => renderTrainingSessions({ container, role, user, onMessage })
      }));
    } else {
      const heading = make('div', 'section-heading player-sessions-heading compact-section-heading');
      const copy = make('div');
      copy.append(
        make('span', 'section-kicker', 'YOUR TRAINING'),
        make('h2', '', 'Training sessions'),
        make('p', '', 'Three sessions are shown at a time so your schedule stays easy to scan.')
      );
      heading.append(copy);
      container.append(heading);
    }

    if (role === 'coach') container.append(make('h3', 'scheduled-heading', 'Scheduled sessions'));

    const list = make('div', 'training-list paged-list');
    container.append(list);

    if (!sessions.length) {
      list.append(make(
        'div',
        'empty-card',
        role === 'coach'
          ? 'No training dates yet. Select dates from the calendar above.'
          : 'No training dates have been added yet.'
      ));
      return;
    }

    const renderItem = session => buildSessionCard(session, role, async selected => {
      if (!window.confirm(`Remove training on ${formatDate(selected.trainingDate)}?`)) return;
      try {
        await removeTrainingSession(selected.id);
        onMessage('Training session removed.', 'success');
        await renderTrainingSessions({ container, role, user, onMessage });
      } catch (error) {
        console.error(error);
        onMessage('Could not remove training session.', 'error');
      }
    });

    const pager = createPager({
      items: sessions,
      list,
      renderItem,
      initialPage: initialRelevantPage(sessions)
    });
    container.append(pager);
  } catch (error) {
    console.error('Could not load training sessions:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load training sessions. Check Firestore rules and try again.'));
  }
}
