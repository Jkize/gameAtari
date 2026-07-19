export type MessageParams = Record<string, string | number | boolean>;

const ROOM_ERROR_MESSAGE_KEYS: Record<string, string> = {
  ROOM_CREATE_INVALID: 'lobby.errors.roomCreateInvalid',
  ROOM_JOIN_INVALID: 'lobby.errors.roomJoinInvalid',
  ROOM_NAME_INVALID: 'lobby.errors.roomNameInvalid',
  ROOM_PASSWORD_INVALID: 'lobby.errors.roomPasswordInvalid',
  ROOM_NAME_TAKEN: 'lobby.errors.roomNameTaken',
  ROOM_NOT_FOUND_OR_INVALID_PASSWORD: 'lobby.errors.roomNotFoundOrInvalidPassword',
  ROOM_ALREADY_JOINED: 'lobby.errors.roomAlreadyJoined',
  ROOM_CREATE_IN_PROGRESS: 'lobby.errors.roomCreateInProgress',
  ROOM_FULL: 'lobby.errors.roomFull',
  ROOM_ALREADY_STARTED: 'lobby.errors.roomAlreadyStarted',
  ROOM_START_FORBIDDEN: 'lobby.errors.roomStartForbidden',
  ROOM_MIN_PLAYERS: 'lobby.errors.roomMinPlayers',
};

export class RoomRequestError extends Error {
  readonly messageKey: string;

  constructor(
    readonly code: string,
    message: string,
    readonly messageParams: MessageParams = {},
  ) {
    super(message);
    this.name = 'RoomRequestError';
    this.messageKey = ROOM_ERROR_MESSAGE_KEYS[code] ?? 'lobby.errorFallback';
  }
}
