import { RuntimeActivityService } from './runtime-activity.service';

describe('RuntimeActivityService', () => {
  it('requires two unique connected players and keeps activity recent for two minutes', () => {
    const activity = new RuntimeActivityService();
    activity.playerConnected('one', 1_000);
    expect(activity.hasCurrentMultiplayerActivity()).toBe(false);
    activity.playerConnected('two', 2_000);
    expect(activity.hasCurrentMultiplayerActivity()).toBe(true);
    activity.playerDisconnected('two', 3_000);
    expect(activity.hasCurrentMultiplayerActivity()).toBe(false);
    expect(activity.hasRecentMultiplayerActivity(123_000)).toBe(true);
    expect(activity.hasRecentMultiplayerActivity(123_001)).toBe(false);
  });

  it('does not double-count a replacement socket for the same player', () => {
    const activity = new RuntimeActivityService();
    activity.playerConnected('one');
    activity.playerConnected('one');
    expect(activity.connectedPlayerCount()).toBe(1);
  });
});
