import { ensureUserProfile, renderProfile as renderBaseProfile } from './profile.js';
import { renderPlayerProgress } from './player-progress.js';

export { ensureUserProfile };

export async function renderProfile(options) {
  await renderBaseProfile(options);
  if (options.role !== 'player' && options.role !== 'captain') return;

  const progress = document.createElement('section');
  progress.className = 'player-progress-section';
  options.container.prepend(progress);
  await renderPlayerProgress({
    container: progress,
    user: options.user,
    onMessage: options.onMessage
  });
}
