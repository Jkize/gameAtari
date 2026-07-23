import { countAlivePlayers, shouldShowViewerIndicator } from '@game/rendering/hud/match-status-panel';

describe('match status helpers', () => {
  it('counts only living players', () => {
    expect(countAlivePlayers([{ alive: true }, { alive: false }, { alive: true }])).toBe(2);
  });

  it('shows the viewer indicator only when at least one watcher is present', () => {
    expect(shouldShowViewerIndicator(0)).toBe(false);
    expect(shouldShowViewerIndicator(1)).toBe(true);
  });
});
