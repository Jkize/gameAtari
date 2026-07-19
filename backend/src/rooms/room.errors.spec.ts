import { RoomRequestError } from './room.errors';

describe('RoomRequestError', () => {
  it('keeps a stable i18n key and named interpolation params alongside the log message', () => {
    const error = new RoomRequestError(
      'ROOM_MIN_PLAYERS',
      'At least 2 players are required to start',
      { minPlayers: 2 },
    );

    expect(error).toMatchObject({
      code: 'ROOM_MIN_PLAYERS',
      messageKey: 'lobby.errors.roomMinPlayers',
      messageParams: { minPlayers: 2 },
      message: 'At least 2 players are required to start',
    });
  });
});
