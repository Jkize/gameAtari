import { GameState } from '../../types/game-state.types';

export function shouldUseSpectatorMode(
  state: GameState,
  myPlayerId: string,
  joinedAsWatcher: boolean,
  localPlayerEliminated = false,
): boolean {
  if (joinedAsWatcher) return true;
  if (localPlayerEliminated) return true;
  if (state.status !== 'playing' || !myPlayerId) return false;

  const localPlayer = state.players.find(player => player.id === myPlayerId);
  return localPlayer?.alive === false;
}
