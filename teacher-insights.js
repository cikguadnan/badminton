import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { db } from './firebase.js';
import { getTrainingSessions } from './sessions.js';
import {
  make,
  secondaryLevel,
  termKey,
  termLabel,
  currentTermKey,
  currentSingaporeDate,
  formatShortDate,
  sessionState,
  downloadCsv
} from './development-utils.js';

function playerLike(member) {
  return ['student', 'player', 'captain'].includes(String(member.role || '').toLowerCase());
}

function stat(value, label, helper, tone = '') {
  const card = make('article', `overview-stat ${tone}`.trim());
  card.append(make('strong', '', String(value)), make('span', '', label), make('small', '', helper));
  return card;
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

async function loadData() {
  const [sessions, usersSnap, attendanceSnap, reflectionsSnap, commentsSnap, termReflectionsSnap] = await Promise.all([
    getTrainingSessions(),
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'attendance')),
    getDocs(collection(db, 'reflections')),
    getDocs(collection(db, 'comments')),
    getDocs(collection(db, 'termReflections'))
  ]);
  return {
    sessions,
    members: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    attendance: attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    reflections: reflectionsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    comments: commentsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    termReflections: termReflectionsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}

function relevantSessions(sessions, selectedTerm) {
  const today = currentSingaporeDate();
  return sessions.filter(s => termKey(s.trainingDate) === selectedTerm && s.trainingDate <= today);
}

function tagCounts(comments, reflectionIds) {
  const counts = new Map();
  for (const comment of comments) {
    if (!reflectionIds.has(comment.reflectionId)) continue;
    for (const tag of comment.developmentTags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function roleLabel(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'captain') return 'Captain';
  return 'Player';
}

export async function renderTeacherInsights({ container, onMessage }) {
  container.replaceChildren(make('div', 'overview-loading', 'Preparing team overview…'));
  try {
    const data = await loadData();
    container.replaceChildren();

    const players = data.members.filter(playerLike);
    const termOptions = [...new Set(data.sessions.map(s => termKey(s.trainingDate)))].sort().reverse();
    if (!termOptions.includes(currentTermKey())) termOptions.unshift(currentTermKey());

    const action = make('article', 'next-action-card teacher-overview-hero');
    const actionCopy = make('div', 'next-action-copy');
    actionCopy.append(
      make('span', 'section-kicker', 'TEAM OVERVIEW'),
      make('h2', '', 'See what needs attention at a glance'),
      make('p', '', 'Filter by level and term, review completion, inspect a training session, then export the term when needed.')
    );
    action.append(actionCopy);
    container.append(action);

    const filters = make('div', 'teacher-insight-filters');
    const levelLabel = make('label', 'field');
    levelLabel.append(make('span', '', 'Player level'));
    const level = document.createElement('select');
    level.innerHTML = '<option value="all">All players</option><option value="sec1">Sec 1</option><option value="sec2">Sec 2</option><option value="sec3">Sec 3</option>';
    levelLabel.append(level);
    const termLabelField = make('label', 'field');
    termLabelField.append(make('span', '', 'Term'));
    const term = document.createElement('select');
    termOptions.forEach(key => {
      const option = document.createElement('option'); option.value = key; option.textContent = termLabel(key); term.append(option);
    });
    term.value = termOptions.includes(currentTermKey()) ? currentTermKey() : termOptions[0];
    termLabelField.append(term);
    const exportBtn = make('button', 'secondary-btn teacher-export-btn', 'Export term CSV');
    exportBtn.type = 'button';
    filters.append(levelLabel, termLabelField, exportBtn);
    container.append(filters);

    const stats = make('div', 'overview-stats teacher-team-stats');
    const attention = make('section', 'teacher-attention-card');
    const summary = make('section', 'session-summary-card');
    const tags = make('section', 'teacher-tags-card');
    container.append(stats, attention, summary, tags);

    function selectedPlayers() {
      return players.filter(p => level.value === 'all' || secondaryLevel(p.className) === level.value);
    }

    function buildExportRows() {
      const subset = selectedPlayers();
      const sessions = relevantSessions(data.sessions, term.value);
      const sessionIds = new Set(sessions.map(s => s.id));
      const rows = [['Name','Class','Role','Attendance %','Trainings attended','Reflections completed','Average effort','Coach feedback count','Term reflection']];
      subset.forEach(player => {
        const uid = player.uid || player.id;
        const attendance = data.attendance.filter(a => a.studentUid === uid && sessionIds.has(a.sessionId));
        const attended = attendance.filter(a => a.status === 'attended');
        const reflections = data.reflections.filter(r => r.studentUid === uid && sessionIds.has(r.sessionId));
        const reflectionIds = new Set(reflections.map(r => r.id));
        const comments = data.comments.filter(c => c.studentUid === uid && reflectionIds.has(c.reflectionId));
        const efforts = reflections.map(r => Number(r.effort)).filter(Number.isFinite);
        const avg = efforts.length ? (efforts.reduce((a,b) => a+b, 0) / efforts.length).toFixed(1) : '';
        const termDone = data.termReflections.some(r => r.studentUid === uid && r.termKey === term.value) ? 'Yes' : 'No';
        rows.push([
          player.name || '', player.className || '', roleLabel(player.role),
          `${pct(attended.length, attendance.length)}%`, attended.length, reflections.length, avg, comments.length, termDone
        ]);
      });
      return rows;
    }

    function draw() {
      const subset = selectedPlayers();
      const sessions = relevantSessions(data.sessions, term.value);
      const sessionIds = new Set(sessions.map(s => s.id));
      const uids = new Set(subset.map(p => p.uid || p.id));
      const attendance = data.attendance.filter(a => uids.has(a.studentUid) && sessionIds.has(a.sessionId));
      const reflections = data.reflections.filter(r => uids.has(r.studentUid) && sessionIds.has(r.sessionId));
      const attended = attendance.filter(a => a.status === 'attended');
      const reflectionIds = new Set(reflections.map(r => r.id));
      const comments = data.comments.filter(c => reflectionIds.has(c.reflectionId));
      const termDone = data.termReflections.filter(r => uids.has(r.studentUid) && r.termKey === term.value);

      stats.replaceChildren(
        stat(subset.length, 'Players', level.value === 'all' ? 'All levels' : level.options[level.selectedIndex].textContent),
        stat(`${pct(attended.length, attendance.length)}%`, 'Attendance', `${attended.length}/${attendance.length || 0} recorded replies attended`),
        stat(`${pct(reflections.length, attended.length)}%`, 'Reflection completion', `${reflections.length}/${attended.length || 0} attended sessions reflected`),
        stat(`${pct(termDone.length, subset.length)}%`, 'Term reflection', `${termDone.length}/${subset.length || 0} completed`, termDone.length < subset.length ? 'warn' : 'good')
      );

      const latestSession = [...sessions].sort((a,b) => b.trainingDate.localeCompare(a.trainingDate))[0];
      const attentionRows = [];
      if (latestSession) {
        for (const player of subset) {
          const uid = player.uid || player.id;
          const a = data.attendance.find(x => x.studentUid === uid && x.sessionId === latestSession.id);
          const r = data.reflections.find(x => x.studentUid === uid && x.sessionId === latestSession.id);
          if (!a && sessionState(latestSession) !== 'upcoming') attentionRows.push([player, 'Attendance missing']);
          else if (a?.status === 'attended' && !r) attentionRows.push([player, 'Reflection pending']);
        }
      }
      attention.replaceChildren();
      attention.append(make('span', 'section-kicker', 'NEEDS ATTENTION'), make('h3', '', latestSession ? `Latest session · ${formatShortDate(latestSession.trainingDate)}` : 'No completed training in this term'));
      if (!attentionRows.length) attention.append(make('p', 'monitor-empty', latestSession ? 'No outstanding action for the selected group.' : 'Nothing to review yet.'));
      else {
        const list = make('div', 'teacher-attention-list');
        attentionRows.forEach(([player, reason]) => {
          const row = make('div', 'teacher-attention-row');
          row.append(make('strong', '', player.name || 'Player'), make('span', '', player.className || 'Class not set'), make('b', '', reason));
          list.append(row);
        });
        attention.append(list);
      }

      summary.replaceChildren();
      summary.append(make('span', 'section-kicker', 'SESSION SUMMARY'));
      if (!sessions.length) {
        summary.append(make('h3', '', 'No training sessions in this term'), make('p', '', 'Create or select training dates first.'));
      } else {
        const sessionSelect = document.createElement('select');
        sessionSelect.className = 'session-summary-select';
        [...sessions].sort((a,b) => b.trainingDate.localeCompare(a.trainingDate)).forEach(s => {
          const o = document.createElement('option'); o.value = s.id; o.textContent = `${formatShortDate(s.trainingDate)} — ${s.title || 'Badminton Training'}`; sessionSelect.append(o);
        });
        const detail = make('div', 'session-summary-detail');
        summary.append(make('h3', '', 'Training snapshot'), sessionSelect, detail);
        const drawSession = () => {
          const s = sessions.find(x => x.id === sessionSelect.value) || sessions[0];
          const a = data.attendance.filter(x => x.sessionId === s.id && uids.has(x.studentUid));
          const attendedS = a.filter(x => x.status === 'attended');
          const r = data.reflections.filter(x => x.sessionId === s.id && uids.has(x.studentUid));
          const efforts = r.map(x => Number(x.effort)).filter(Number.isFinite);
          const average = efforts.length ? (efforts.reduce((x,y) => x+y,0)/efforts.length).toFixed(1) : '—';
          const rids = new Set(r.map(x => x.id));
          const c = data.comments.filter(x => rids.has(x.reflectionId));
          detail.replaceChildren(
            stat(`${attendedS.length}/${subset.length}`, 'Attended', `${a.length} attendance replies`),
            stat(`${r.length}/${attendedS.length || 0}`, 'Reflections', 'Completed by attendees'),
            stat(`${average}/5`, 'Average effort', 'Self-reported'),
            stat(c.length, 'Coach comments', 'Feedback records')
          );
        };
        sessionSelect.addEventListener('change', drawSession);
        drawSession();
      }

      tags.replaceChildren(make('span', 'section-kicker', 'DEVELOPMENT AREAS'), make('h3', '', 'Common coach tags'));
      const counts = tagCounts(comments, reflectionIds);
      if (!counts.length) tags.append(make('p', '', 'Tag feedback with Footwork, Technique, Stamina and other areas to build this view over time.'));
      else {
        const tagWrap = make('div', 'teacher-tag-cloud');
        counts.slice(0, 8).forEach(([tagName, count]) => {
          const chip = make('span', 'development-tag');
          chip.append(make('strong', '', tagName), make('small', '', String(count)));
          tagWrap.append(chip);
        });
        tags.append(tagWrap);
      }
    }

    level.addEventListener('change', draw);
    term.addEventListener('change', draw);
    exportBtn.addEventListener('click', () => {
      try {
        const suffix = level.value === 'all' ? 'all' : level.value;
        downloadCsv(`WRSS-Badminton-${term.value}-${suffix}.csv`, buildExportRows());
        onMessage('Term report exported.', 'success');
      } catch (error) {
        console.error('Could not export term report:', error);
        onMessage('Could not export term report.', 'error');
      }
    });
    draw();
  } catch (error) {
    console.error('Could not load teacher overview:', error);
    container.replaceChildren(make('div', 'error-card', 'Could not load team overview. Check Firestore rules and try again.'));
  }
}
