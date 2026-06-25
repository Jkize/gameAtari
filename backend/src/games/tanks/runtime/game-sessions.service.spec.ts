import { GameRuntimeContext } from './game-runtime-context.service';
import { GameSessionsService } from './game-sessions.service';

describe('GameSessionsService', () => {
  it('isolates state between rooms', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    sessions.create('room-a');
    sessions.create('room-b');

    sessions.run('room-a', () => {
      sessions.require('room-a').bullets.push({
        id: 'bullet-a',
        ownerId: 'player-a',
        x: 0,
        y: 0,
        dirX: 1,
        dirY: 0,
        speed: 1,
        damage: 1,
        radius: 1,
        lifeTime: 100,
      });
    });

    expect(sessions.require('room-a').bullets).toHaveLength(1);
    expect(sessions.require('room-b').bullets).toHaveLength(0);
  });
});
