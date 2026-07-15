import { describe, expect, it } from 'vitest';
import { GameState } from '../../types/game-state.types';
import { shouldUseSpectatorMode } from './spectator-mode';

function stateWithPlayers(players: GameState['players']): GameState {
  return {
    status: 'playing',
    players,
    bullets: [],
    powerUps: [],
    impactEvents: [],
    map: { width: 1600, height: 1200, obstacles: [], powerUps: [] },
  };
}

describe('shouldUseSpectatorMode', () => {
  it('does not treat a player as dead while their first state is still arriving', () => {
    expect(shouldUseSpectatorMode(stateWithPlayers([]), 'me', false)).toBe(false);
  });

  it('starts spectator mode when the local player is authoritatively dead', () => {
    const state = stateWithPlayers([{ id: 'me', alive: false } as GameState['players'][number]]);
    expect(shouldUseSpectatorMode(state, 'me', false)).toBe(true);
  });

  it('keeps spectator mode after an eliminated player leaves the snapshots', () => {
    expect(shouldUseSpectatorMode(stateWithPlayers([]), 'me', false, true)).toBe(true);
  });

  it('keeps an explicit watcher in spectator mode', () => {
    expect(shouldUseSpectatorMode(stateWithPlayers([]), '', true)).toBe(true);
  });
});
