export function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function secondaryLevel(className = '') {
  const value = String(className).trim();
  const match = value.match(/(?:sec(?:ondary)?\s*)?([123])|^([123])/i);
  const level = match?.[1] || match?.[2];
  return level ? `sec${level}` : 'other';
}

export function termForDate(dateString = '') {
  const month = Number(String(dateString).slice(5, 7));
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

export function yearForDate(dateString = '') {
  return Number(String(dateString).slice(0, 4)) || new Date().getFullYear();
}

export function termKey(dateString = '') {
  return `${yearForDate(dateString)}-T${termForDate(dateString)}`;
}

export function currentSingaporeDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function currentTermKey() {
  return termKey(currentSingaporeDate());
}

export function termLabel(key) {
  const match = String(key || '').match(/^(\d{4})-T([1-4])$/);
  return match ? `Term ${match[2]} · ${match[1]}` : key || 'Term';
}

export function formatShortDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${dateString}T00:00:00+08:00`));
}

export function sessionState(session) {
  const now = new Date();
  const opensAt = session.opensAt?.toDate?.() || new Date(`${session.trainingDate}T00:00:00+08:00`);
  const closesAt = session.closesAt?.toDate?.() || new Date(`${session.dueDate}T23:59:59+08:00`);
  if (now < opensAt) return 'upcoming';
  if (now > closesAt) return 'closed';
  return 'open';
}

export function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
