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

function secondaryLevel(className = '') {
  const value = String(className).trim();
  const match = value.match(/(?:sec(?:ondary)?\s*)?([123])|^([123])/i);
  const level = match?.[1] || match?.[2];
  return level ? `sec${level}` : 'other';
}

function displayRole(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'teacher') return 'Teacher';
  if (value === 'coach') return 'Coach';
  if (value === 'captain') return 'Captain';
  return 'Player';
}

function storedRole(role) {
  return role === 'player' ? 'student' : role;
}

function buildLevelFilter() {
  const wrap = make('div', 'staff-filter-bar');
  const label = make('label', 'field staff-filter-field');
  label.append(make('span', '', 'Player level'));
  const select = document.createElement('select');
  select.innerHTML = `
    <option value="all">All players</option>
    <option value="sec1">Sec 1</option>
    <option value="sec2">Sec 2</option>
    <option value="sec3">Sec 3</option>
  `;
  label.append(select);
  wrap.append(label);
  return { wrap, select };
}

export async function ensureUserProfile(user, role) {
  const reference = doc(db, 'users', user.uid);
  const snapshot = await getDoc(reference);
  const expectedRole = storedRole(role);

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

async function renderPlayerProfile({ container, user, profile, onMessage, onProfileUpdated, role }) {
  container.replaceChildren();
  const heading = make('div', 'section-heading player-sessions-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', role === 'captain' ? 'CAPTAIN PROFILE' : 'PROFILE'),
    make('h2', '', 'My player profile'),
    make('p', '', role === 'captain' ? 'You have normal player access plus the Team Monitor captain tool.' : 'Keep your name and class updated so staff can identify your submissions.')
  );
  heading.append(copy);
  container.append(heading);

  if (role === 'captain') {
    const badge = make('div', 'captain-profile-note');
    badge.append(make('strong', '', 'Captain'), make('span', '', 'Help the team stay on top of attendance and reflections.'));
    container.append(badge);
  }

  const card = make('div', 'profile-card');
  const form = document.createElement('form');
  form.className = 'profile-form';

  const nameField = make('label', 'field');
  nameField.append(make('span', '', 'Name'));
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.maxLength = 80; nameInput.required = true;
  nameInput.value = profile.name || user.displayName || '';
  nameField.append(nameInput);

  const classField = make('label', 'field');
  classField.append(make('span', '', 'Class'));
  const classInput = document.createElement('input');
  classInput.type = 'text'; classInput.maxLength = 30; classInput.placeholder = 'e.g. 2R3';
  classInput.value = profile.className || '';
  classField.append(classInput);

  const emailField = make('label', 'field field-wide');
  emailField.append(make('span', '', 'Google account'));
  const emailInput = document.createElement('input');
  emailInput.type = 'email'; emailInput.value = user.email || ''; emailInput.disabled = true;
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
    saveButton.disabled = true; saveButton.textContent = 'Saving…';
    try {
      await saveOwnProfile({ user, profile, name: nameInput.value, className: classInput.value });
      const updated = await getUserProfile(user.uid);
      onMessage('Profile updated.', 'success');
      if (onProfileUpdated) onProfileUpdated(updated);
    } catch (error) {
      console.error('Could not update profile:', error);
      onMessage(error?.message || 'Could not update profile.', 'error');
    } finally {
      saveButton.disabled = false; saveButton.textContent = 'Save profile';
    }
  });
}

async function loadMembers() {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function renderPlayerDirectory({ container, members }) {
  const players = members.filter(item => ['student', 'player', 'captain'].includes(String(item.role || '').toLowerCase()));
  const heading = make('div', 'section-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'PLAYERS'),
    make('h2', '', 'Player directory'),
    make('p', '', 'Filter players by secondary level. Captains remain part of the player list.')
  );
  heading.append(copy);
  container.append(heading);

  if (!players.length) {
    container.append(make('div', 'empty-card', 'No player profiles yet.'));
    return;
  }

  const { wrap, select } = buildLevelFilter();
  const count = make('span', 'filter-result-count');
  wrap.append(count);
  container.append(wrap);

  const grid = make('div', 'player-directory');
  container.append(grid);

  function draw() {
    grid.replaceChildren();
    const filtered = players.filter(player => select.value === 'all' || secondaryLevel(player.className) === select.value);
    count.textContent = `${filtered.length} player${filtered.length === 1 ? '' : 's'}`;
    if (!filtered.length) {
      grid.append(make('div', 'empty-card', 'No players found for this level.'));
      return;
    }
    for (const player of filtered) {
      const card = make('article', 'player-card');
      const avatar = make('div', 'player-avatar', (player.name || '?').trim().charAt(0).toUpperCase() || '?');
      const body = make('div');
      body.append(
        make('strong', '', player.name || 'Player'),
        make('span', '', `${player.className || 'Class not set'}${player.role === 'captain' ? ' • Captain' : ''}`),
        make('small', '', player.email || '')
      );
      card.append(avatar, body);
      grid.append(card);
    }
  }
  select.addEventListener('change', draw);
  draw();
}

async function changeMemberRole({ member, role, user, onMessage }) {
  if (member.uid === user.uid || member.id === user.uid) throw new Error('Your own Teacher role is protected.');
  await setDoc(doc(db, 'users', member.uid || member.id), {
    role: storedRole(role),
    updatedAt: serverTimestamp()
  }, { merge: true });
  onMessage(`${member.name || 'Member'} is now ${displayRole(role)}.`, 'success');
}

function renderRoleManager({ container, members, user, onMessage, redraw }) {
  const section = make('section', 'role-manager-section');
  const heading = make('div', 'section-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'TEACHER ADMIN'),
    make('h2', '', 'Member roles'),
    make('p', '', 'Assign Player, Captain, Coach or Teacher access. Changes apply the next time that member refreshes or signs in.')
  );
  heading.append(copy);
  section.append(heading);

  const list = make('div', 'role-manager-list');
  for (const member of members) {
    const row = make('article', 'role-manager-row');
    const person = make('div', 'role-person');
    person.append(
      make('strong', '', member.name || 'Member'),
      make('span', '', `${member.className || 'No class'} • ${member.email || ''}`)
    );
    const control = make('div', 'role-control');
    const select = document.createElement('select');
    select.className = 'role-select';
    select.innerHTML = '<option value="player">Player</option><option value="captain">Captain</option><option value="coach">Coach</option><option value="teacher">Teacher</option>';
    const current = ['student','player'].includes(String(member.role || '').toLowerCase()) ? 'player' : String(member.role || 'player').toLowerCase();
    select.value = ['player','captain','coach','teacher'].includes(current) ? current : 'player';
    const isSelf = (member.uid || member.id) === user.uid;
    if (isSelf) {
      select.disabled = true;
      select.title = 'Your own Teacher role is protected';
    }
    const badge = make('span', `member-role-badge ${current}`, displayRole(current));
    control.append(badge, select);
    row.append(person, control);
    if (isSelf) row.append(make('small', 'self-role-note', 'Your role is protected'));
    list.append(row);

    select.addEventListener('change', async () => {
      const nextRole = select.value;
      select.disabled = true;
      try {
        await changeMemberRole({ member, role: nextRole, user, onMessage });
        await redraw();
      } catch (error) {
        console.error('Could not change member role:', error);
        onMessage(error?.message || 'Could not change role.', 'error');
        select.value = current;
        select.disabled = false;
      }
    });
  }
  section.append(list);
  container.append(section);
}

async function renderStaffPlayers({ container, role, user, onMessage }) {
  container.replaceChildren();
  const members = await loadMembers();
  renderPlayerDirectory({ container, members });

  if (role === 'teacher') {
    const redraw = () => renderStaffPlayers({ container, role, user, onMessage });
    renderRoleManager({ container, members, user, onMessage, redraw });
  }
}

export async function renderProfile({ container, role, user, profile, onMessage, onProfileUpdated }) {
  container.replaceChildren(make('div', 'loading-card', 'Loading profile…'));
  try {
    if (role === 'teacher' || role === 'coach') {
      await renderStaffPlayers({ container, role, user, onMessage });
    } else {
      await renderPlayerProfile({ container, user, profile, onMessage, onProfileUpdated, role });
    }
  } catch (error) {
    console.error('Could not load profile:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load profile.'));
  }
}
