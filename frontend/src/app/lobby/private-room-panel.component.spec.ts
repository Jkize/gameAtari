import { RoomState } from '../network/room-state';
import { PrivateRoomPanelComponent } from './private-room-panel.component';

describe('PrivateRoomPanelComponent', () => {
  const room = (): RoomState => ({
    id: 'private-1',
    name: 'Squad Room',
    type: 'private',
    adminUserId: 'admin-1',
    rewardsEligible: false,
    status: 'waiting',
    playerCount: 3,
    minPlayers: 2,
    maxPlayers: 16,
    countdownSeconds: null,
    expiresAt: 121_000,
    players: [
      { userId: 'admin-1', username: 'Admin', connected: true },
      { userId: 'player-2', username: 'Player2', connected: true },
      { userId: 'player-3', username: 'Player3', connected: false },
    ],
  });

  it('allows only the admin to start when enough players are connected', () => {
    const component = new PrivateRoomPanelComponent();
    component.room = room();
    component.currentUserId = 'admin-1';

    expect(component.isAdmin()).toBe(true);
    expect(component.connectedPlayers()).toBe(2);
    expect(component.canStart()).toBe(true);

    component.currentUserId = 'player-2';
    expect(component.canStart()).toBe(false);
  });

  it('disables starting during countdown or while the request is pending', () => {
    const component = new PrivateRoomPanelComponent();
    component.room = room();
    component.currentUserId = 'admin-1';
    component.starting = true;
    expect(component.canStart()).toBe(false);

    component.starting = false;
    component.room.status = 'countdown';
    component.room.countdownSeconds = 10;
    expect(component.canStart()).toBe(false);
  });

  it('formats expiration and detects the final thirty-second warning', () => {
    const component = new PrivateRoomPanelComponent();
    component.room = room();
    component.now.set(100_000);

    expect(component.remainingSeconds()).toBe(21);
    expect(component.remainingTime()).toBe('00:21');
    expect(component.isClosingSoon()).toBe(true);

    component.room.expiresAt = 340_000;
    expect(component.remainingSeconds()).toBe(240);
    expect(component.isClosingSoon()).toBe(false);
  });
});
