import { renderReflections as renderBaseReflections } from './reflections.js';

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function levelFromText(text = '') {
  const value = String(text).trim();
  const match = value.match(/(?:sec(?:ondary)?\s*)?([123])|\b([123])(?=[A-Za-z])/i);
  const level = match?.[1] || match?.[2];
  return level ? `sec${level}` : 'other';
}

function applyFilter(container, value) {
  const cards = [...container.querySelectorAll('.coach-reflection-card')];
  let visible = 0;
  for (const card of cards) {
    const classText = card.querySelector('.coach-reflection-top p')?.textContent || '';
    const show = value === 'all' || levelFromText(classText) === value;
    card.hidden = !show;
    if (show) visible++;
  }
  const count = container.querySelector('.reflection-filter-count');
  if (count) count.textContent = `${visible} reflection${visible === 1 ? '' : 's'}`;
  const target = container.querySelector('.coach-reflections-target');
  const empty = target?.querySelector('.staff-level-empty');
  if (empty) empty.remove();
  if (target && cards.length && visible === 0) {
    target.append(make('div', 'empty-card staff-level-empty', 'No reflections from players in this level for the selected training session.'));
  }
}

function ensureStaffFilter(container) {
  const sessionFilter = container.querySelector('.attendance-session-filter');
  if (!sessionFilter || container.querySelector('.staff-reflection-filter')) return;

  const bar = make('div', 'staff-filter-bar staff-reflection-filter');
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
  const count = make('span', 'filter-result-count reflection-filter-count', '');
  bar.append(label, count);
  sessionFilter.after(bar);

  const remembered = container.dataset.staffLevelFilter || 'all';
  select.value = remembered;
  select.addEventListener('change', () => {
    container.dataset.staffLevelFilter = select.value;
    applyFilter(container, select.value);
  });
  applyFilter(container, select.value);
}

function installObserver(container) {
  if (container.dataset.staffFilterObserver === '1') return;
  container.dataset.staffFilterObserver = '1';
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      ensureStaffFilter(container);
      applyFilter(container, container.dataset.staffLevelFilter || 'all');
    });
  });
  observer.observe(container, { childList: true, subtree: true });
}

export async function renderReflections({ container, role, user, onMessage }) {
  const staff = role === 'teacher' || role === 'coach';
  if (staff) installObserver(container);
  await renderBaseReflections({
    container,
    role: staff ? 'coach' : 'player',
    user,
    onMessage
  });
  if (staff) {
    ensureStaffFilter(container);
    applyFilter(container, container.dataset.staffLevelFilter || 'all');
  }
}
