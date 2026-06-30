export const SOCKET_EVENTS = {
  LOBBY: {
    LIST_ROOMS: 'lobby:listRooms',
    QUICK_PLAY: 'lobby:quickPlay',
    CREATE_ROOM: 'lobby:createRoom',
    JOIN_ROOM: 'lobby:joinRoom',
    LEAVE_ROOM: 'lobby:leaveRoom',
    ROOMS_UPDATED: 'lobby:roomsUpdated',
  },
  ROOM: {
    GET_STATE: 'room:getState',
    JOINED: 'room:joined',
    LEFT: 'room:left',
    STATE_UPDATED: 'room:stateUpdated',
    COUNTDOWN_STARTED: 'room:countdownStarted',
    COUNTDOWN_UPDATED: 'room:countdownUpdated',
    COUNTDOWN_CANCELLED: 'room:countdownCancelled',
    RETURNED_TO_LOBBY: 'room:returnedToLobby',
  },
  GAME: {
    JOIN: 'joinGame',
    WATCH: 'watchGame',
    PLAYER_INPUT: 'playerInput',
    START: 'startGame',
    RESTART: 'restartGame',
    JOINED: 'gameJoined',
    WATCH_JOINED: 'watchJoined',
    STARTED: 'gameStarted',
    STATE: 'gameState',
    ENDED: 'game:ended',
    ERROR: 'game:error',
    PLAYER_DISCONNECTED: 'playerDisconnected',
  },
  SESSION: {
    REPLACED: 'session:replaced',
    CLAIMED: 'session:claimed',
  },
  TRANSPORT: {
    CONNECT: 'connect',
    RECONNECT_FAILED: 'reconnect_failed',
  },
} as const;

export const SESSION_REASONS = {
  DUPLICATE_TAB: 'duplicate_tab',
} as const;

export const SESSION_MESSAGES = {
  REPLACED: 'Abriste esta cuenta en otra pestana. Cerramos esta sesion para evitar jugar dos veces.',
  CLAIMED: 'Continuaste tu sesion en esta pestana. La sesion anterior fue cerrada.',
} as const;
