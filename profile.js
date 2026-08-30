import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export async function ensureUserProfile(user, role) {
  const reference = doc(db, 'users', user.uid);
  const snapshot = await getDoc(reference);
  const expectedRole = role === 'coach' ? 'teacher' : 'student';

  if (!snapshot.exists()) {
    const profile = {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || 'WRSS Badminton Member',
      className: '',
      role: expectedRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(reference, profile);
    return profile;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function saveOwnProfile({ user, profile, name, className }) {
  await setDoc(doc(db, 'users', user.uid), {
    uid: profile.uid,
    email: profile.email,
    role: profile.role,
    name: name.trim() || user.displayName || 'WRSS Badminton Member',
    className: className.trim(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function renderPlayerProfile({ container, user, profile, onMessage, onProfileUpdated }) {
  container.replaceChildren();

  const heading = make('div', 'section-heading player-sessions-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'PROFILE'),
    make('h2', '', 'My player profile'),
    make('p', '', 'Keep your name and class updated so your coach can identify your submissions.')
  );
  heading.append(copy);
  container.append(heading);

  const card = make('div', 'profile-card');
  const form = document.createElement('form');
  form.className = 'profile-form';

  const nameField = make('label', 'field');
  nameField.append(make('span', '', 'Name'));
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 80;
  nameInput.required = true;
  nameInput.value = profile.name || user.displayName || '';
  nameField.append(nameInput);

  const classField = make('label', 'field');
  classField.append(make('span', '', 'Class'));
  const classInput = document.createElement('input');
  classInput.type = 'text';
  classInput.maxLength = 30;
  classInput.placeholder = 'e.g. 2R3';
  classInput.value = profile.className || '';
  classField.append(classInput);

  const emailField = make('label', 'field field-wide');
  emailField.append(make('span', '', 'Google account'));
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.value = user.email || '';
  emailInput.disabled = true;
  emailField.append(emailInput);

  const actions = make('div', 'profile-actions field-wide');
  const saveButton = make('button', 'primary-btn', 'Save profile');
  saveButton.type = 'submit';
  actions.append(saveButton);

  form.append(nameField, classField, emailField, actions);
  card.append(form);
  container.append(card);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    try {
      await saveOwnProfile({
        user,
        profile,
        name: nameInput.value,
        className: classInput.value
      });
      const updated = await getUserProfile(user.uid);
      onMessage('Profile updated.', 'success');
      if (onProfileUpdated) onProfileUpdated(updated);
    } catch (error) {
      console.error('Could not update profile:', error);
      onMessage(error?.message || 'Could not update profile.', 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save profile';
    }
  });
}

async function renderCoachPlayers({ container }) {
  container.replaceChildren();

  const heading = make('div', 'section-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'PLAYERS'),
    make('h2', '', 'Player directory'),
    make('p', '', 'Players appear here after signing in to the V3 hub.')
  );
  heading.append(copy);
  container.append(heading);

  const snapshot = await getDocs(collection(db, 'users'));
  const players = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.role === 'student' || item.role === 'player')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  if (!players.length) {
    container.append(make('div', 'empty-card', 'No player profiles yet.'));
    return;
  }

  const grid = make('div', 'player-directory');
  for (const player of players) {
    const card = make('article', 'player-card');
    const avatar = make('div', 'player-avatar', (player.name || '?').trim().charAt(0).toUpperCase() || '?');
    const body = make('div');
    body.append(
      make('strong', '', player.name || 'Player'),
      make('span', '', player.className || 'Class not set'),
      make('small', '', player.email || '')
    );
    card.append(avatar, body);
    grid.append(card);
  }
  container.append(grid);
}

export async function renderProfile({ container, role, user, profile, onMessage, onProfileUpdated }) {
  container.replaceChildren(make('div', 'loading-card', 'Loading profile…'));
  try {
    if (role === 'coach') {
      await renderCoachPlayers({ container });
    } else {
      await renderPlayerProfile({ container, user, profile, onMessage, onProfileUpdated });
    }
  } catch (error) {
    console.error('Could not load profile:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load profile.'));
  }
}
