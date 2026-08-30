const PAGE_SIZE = 3;
const DAY_MS = 86400000;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function parseDisplayedDate(text) {
  const parsed = Date.parse(String(text || '').replace(/,/g, ''));
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function daysUntil(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - today) / DAY_MS);
}

function addPager(list) {
  if (!list || list.dataset.v36Paged === '1') return;
  const cards = [...list.children].filter(el => el.matches('.training-card,.attendance-card'));
  if (cards.length <= PAGE_SIZE) return;
  list.dataset.v36Paged = '1';

  // Start on the first page containing an open/upcoming item when possible.
  let firstRelevant = cards.findIndex(card => {
    const badge = card.querySelector('.session-status');
    return badge?.classList.contains('open') || badge?.classList.contains('upcoming');
  });
  if (firstRelevant < 0) firstRelevant = Math.max(0, cards.length - PAGE_SIZE);
  let page = Math.floor(firstRelevant / PAGE_SIZE);
  const pages = Math.ceil(cards.length / PAGE_SIZE);

  const pager = make('div', 'list-pager');
  const prev = make('button', 'pager-btn', '← Previous');
  const label = make('span', 'pager-count');
  const next = make('button', 'pager-btn', 'Next →');
  prev.type = next.type = 'button';
  pager.append(prev, label, next);
  list.after(pager);

  function draw() {
    const start = page * PAGE_SIZE;
    cards.forEach((card, index) => { card.hidden = index < start || index >= start + PAGE_SIZE; });
    label.textContent = `${page + 1} / ${pages}`;
    prev.disabled = page === 0;
    next.disabled = page === pages - 1;
  }
  prev.addEventListener('click', () => { if (page > 0) { page--; draw(); list.scrollIntoView({behavior:'smooth', block:'start'}); } });
  next.addEventListener('click', () => { if (page < pages - 1) { page++; draw(); list.scrollIntoView({behavior:'smooth', block:'start'}); } });
  draw();
}

function enforceAttendanceWindow(container) {
  if (!container) return;
  container.querySelectorAll('.attendance-card').forEach(card => {
    if (card.dataset.v36Window === '1') return;
    const dateText = card.querySelector('.section-kicker')?.textContent;
    const date = parseDisplayedDate(dateText);
    if (!date) return;
    const remaining = daysUntil(date);
    if (remaining > 7) {
      card.dataset.v36Window = '1';
      const actions = card.querySelector('.attendance-actions');
      const form = card.querySelector('.absence-inline-form');
      if (actions) actions.hidden = true;
      if (form) form.hidden = true;
      const note = make('div', 'attendance-note attendance-locked');
      note.append(
        make('strong', '', 'Attendance opens 1 week before training'),
        make('span', '', `You can update attendance from ${new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'short',year:'numeric'}).format(new Date(date.getTime() - 7 * DAY_MS))}.`)
      );
      card.append(note);
    }
  });
}

function compactCalendar() {
  const calendar = document.querySelector('.bulk-calendar-shell');
  if (!calendar) return;
  calendar.classList.add('compact-calendar');
  const heading = calendar.querySelector('.bulk-calendar-top > div');
  if (heading && !heading.querySelector('.calendar-helper')) {
    heading.append(make('p', 'calendar-helper', 'Tap multiple dates, then create them together.'));
  }
  const today = new Date();
  today.setHours(0,0,0,0);
  calendar.querySelectorAll('.calendar-day').forEach(btn => {
    // Past-day disabling is intentionally visual only here; existing scheduled dates remain visible.
    if (!btn.classList.contains('existing') && btn.disabled) btn.classList.add('past');
  });
}

function enhance() {
  compactCalendar();
  enforceAttendanceWindow(document.getElementById('attendanceSection'));
  document.querySelectorAll('.training-list,.attendance-list').forEach(addPager);
}

let queued = false;
const observer = new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; enhance(); });
});
observer.observe(document.body, {childList:true, subtree:true});
window.addEventListener('DOMContentLoaded', enhance);
