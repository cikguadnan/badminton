import { renderTrainingSessions as renderBaseTrainingSessions, getTrainingSessions } from './sessions.js';
import { make, termKey, termLabel, formatShortDate, currentTermKey } from './development-utils.js';

export { getTrainingSessions } from './sessions.js';

function renderArchive(container, sessions) {
  const archive = make('section', 'term-archive-section');
  const heading = make('div', 'section-heading term-archive-heading');
  const copy = make('div');
  copy.append(
    make('span', 'section-kicker', 'TERM ARCHIVE'),
    make('h2', '', 'Training history by term'),
    make('p', '', 'Current training stays easy to scan above. Older sessions are organised here for quick reference.')
  );
  heading.append(copy);
  archive.append(heading);

  const groups = new Map();
  sessions.forEach(session => {
    const key = termKey(session.trainingDate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  });

  if (!groups.size) {
    archive.append(make('div', 'empty-card', 'No training history yet.'));
    container.append(archive);
    return;
  }

  const list = make('div', 'term-archive-list');
  [...groups.entries()].sort((a,b) => b[0].localeCompare(a[0])).forEach(([key, items]) => {
    const details = document.createElement('details');
    details.className = 'term-archive-group';
    details.open = key === currentTermKey();
    const summary = document.createElement('summary');
    const left = make('div');
    left.append(make('strong', '', termLabel(key)), make('span', '', `${items.length} training session${items.length === 1 ? '' : 's'}`));
    summary.append(left, make('span', 'term-archive-chevron', '⌄'));
    details.append(summary);
    const body = make('div', 'term-archive-body');
    [...items].sort((a,b) => b.trainingDate.localeCompare(a.trainingDate)).forEach(session => {
      const row = make('article', 'term-session-row');
      const main = make('div');
      main.append(
        make('strong', '', session.title || 'Badminton Training'),
        make('span', '', `${formatShortDate(session.trainingDate)}${session.focus ? ` • ${session.focus}` : ''}`)
      );
      row.append(main, make('small', '', `Reflection closed ${formatShortDate(session.dueDate)}`));
      body.append(row);
    });
    details.append(body);
    list.append(details);
  });
  archive.append(list);
  container.append(archive);
}

export async function renderTrainingSessions(options) {
  await renderBaseTrainingSessions(options);
  try {
    const sessions = await getTrainingSessions();
    renderArchive(options.container, sessions);
  } catch (error) {
    console.warn('Could not render term archive:', error);
  }
}
