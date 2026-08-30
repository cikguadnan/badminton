const MOBILE_BREAKPOINT = 800;

let initialized = false;

const pageMap = {
  home: 'homePage',
  training: 'trainingSection',
  attendance: 'attendanceSection',
  reflections: 'reflectionsSection',
  profile: 'profileSection'
};

function isMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function showPage(name, { updateHash = false } = {}) {
  const safeName = pageMap[name] ? name : 'home';
  if (!isMobile()) {
    if (updateHash && safeName !== 'home') document.getElementById(pageMap[safeName])?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  document.querySelectorAll('[data-page-panel]').forEach(panel => {
    panel.classList.toggle('mobile-page-active', panel.dataset.pagePanel === safeName);
  });
  document.querySelectorAll('.bottom-nav-btn').forEach(button => {
    const active = button.dataset.page === safeName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (updateHash) history.replaceState(null, '', safeName === 'home' ? '#home' : `#${pageMap[safeName]}`);
}

function pageFromHash(hash) {
  const id = (hash || '').replace('#', '');
  return Object.entries(pageMap).find(([,value]) => value === id)?.[0] || (id === 'home' ? 'home' : null);
}

export function initAppNavigation(role) {
  const profileLabels = document.querySelectorAll('[data-profile-nav-label]');
  profileLabels.forEach(node => node.textContent = role === 'coach' ? 'Players' : 'Profile');

  if (!initialized) {
    initialized = true;
    document.querySelectorAll('.bottom-nav-btn').forEach(button => {
      button.addEventListener('click', () => showPage(button.dataset.page, { updateHash: true }));
    });

    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || !isMobile()) return;
      const page = pageFromHash(link.getAttribute('href'));
      if (!page) return;
      event.preventDefault();
      showPage(page, { updateHash: true });
    });

    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    media.addEventListener('change', event => {
      if (event.matches) showPage(pageFromHash(location.hash) || 'home');
      else document.querySelectorAll('[data-page-panel]').forEach(panel => panel.classList.remove('mobile-page-active'));
    });
  }

  const initial = pageFromHash(location.hash) || 'home';
  showPage(initial);
}
