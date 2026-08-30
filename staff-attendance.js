import { renderAttendance as renderBaseAttendance } from './attendance.js';

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function levelFromClass(text = '') {
  const match = String(text).trim().match(/(?:sec(?:ondary)?\s*)?([123])|^([123])/i);
  const level = match?.[1] || match?.[2];
  return level ? `sec${level}` : 'other';
}

function applyFilter(container, value) {
  const rows = [...container.querySelectorAll('.attendance-table tbody tr')];
  let visible = 0;
  for (const row of rows) {
    const classText = row.children[1]?.textContent || '';
    const show = value === 'all' || levelFromClass(classText) === value;
    row.hidden = !show;
    if (show) visible++;
  }
  const count = container.querySelector('.attendance-level-count');
  if (count) count.textContent = `${visible} player${visible === 1 ? '' : 's'}`;
}

function ensureFilter(container) {
  const sessionFilter = container.querySelector('.attendance-session-filter');
  if (!sessionFilter || container.querySelector('.staff-attendance-filter')) return;

  const bar = make('div', 'staff-filter-bar staff-attendance-filter');
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
  const count = make('span', 'filter-result-count attendance-level-count', '');
  bar.append(label, count);
  sessionFilter.after(bar);

  select.value = container.dataset.attendanceLevelFilter || 'all';
  select.addEventListener('change', () => {
    container.dataset.attendanceLevelFilter = select.value;
    applyFilter(container, select.value);
  });
  applyFilter(container, select.value);
}

function installObserver(container) {
  if (container.dataset.attendanceFilterObserver === '1') return;
  container.dataset.attendanceFilterObserver = '1';
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      ensureFilter(container);
      applyFilter(container, container.dataset.attendanceLevelFilter || 'all');
    });
  });
  observer.observe(container, { childList: true, subtree: true });
}

export async function renderAttendance(options) {
  const teacher = options.role === 'teacher';
  if (teacher) installObserver(options.container);
  await renderBaseAttendance({
    ...options,
    role: teacher ? 'coach' : options.role
  });
  if (teacher) {
    ensureFilter(options.container);
    applyFilter(options.container, options.container.dataset.attendanceLevelFilter || 'all');
  }
}
