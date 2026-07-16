import { SOCKET_EVENTS } from '../../../common/socket-events';
import { GameEventPublisherService } from './game-event-publisher.service';
import type { PlayerEliminatedEvent } from './elimination-event.types';

describe('GameEventPublisherService', () => {
  it('publishes each elimination once to the combined player and watcher audience', () => {
    const emit = jest.fn();
    const watchersAudience = { emit };
    const playersAudience = { to: jest.fn(() => watchersAudience) };
    const server = { to: jest.fn(() => playersAudience) };
    const publisher = new GameEventPublisherService();
    publisher.setServer(server as never);
    const event = {
      id: 'event-1',
      victimId: 'victim',
      victimName: 'Victim',
      creditedKillerId: 'killer',
      creditedKillerName: 'Killer',
      lethalSourcePlayerId: 'killer',
      cause: 'projectile',
      weapon: 'standard',
      attribution: 'direct',
      selfInflicted: false,
      occurredAt: 1,
    } satisfies PlayerEliminatedEvent;

    publisher.publishEliminations('room-1', [event]);

    expect(server.to).toHaveBeenCalledWith('game:room-1:players');
    expect(playersAudience.to).toHaveBeenCalledWith('game:room-1:watchers');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.PLAYER_ELIMINATED, event);
  });
});
