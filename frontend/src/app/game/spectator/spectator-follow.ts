import { PlayerPublicState } from '@game/contracts/game-state.types';

export type SpectatorDirection = 1 | -1;

export function findAliveSpectatorTarget(
  players: PlayerPublicState[],
  currentPlayerId: string | null,
  direction: SpectatorDirection = 1,
): PlayerPublicState | undefined {
  if (players.length === 0) return undefined;

  const foundCurrentIndex = currentPlayerId
    ? players.findIndex(player => player.id === currentPlayerId)
    : -1;
  const currentIndex = foundCurrentIndex >= 0
    ? foundCurrentIndex
    : direction === 1 ? -1 : 0;

  for (let offset = 1; offset <= players.length; offset++) {
    const index = (currentIndex + direction * offset + players.length * 2) % players.length;
    const candidate = players[index];
    if (candidate.alive) return candidate;
  }

  return undefined;
}
