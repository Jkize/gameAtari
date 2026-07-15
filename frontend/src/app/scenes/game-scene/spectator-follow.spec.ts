import { describe, expect, it } from 'vitest';
import { PlayerPublicState } from '../../types/game-state.types';
import { findAliveSpectatorTarget } from './spectator-follow';

const player = (id: string, alive: boolean): PlayerPublicState => ({
  id,
  alive,
} as PlayerPublicState);

describe('findAliveSpectatorTarget', () => {
  const players = [player('one', true), player('two', false), player('three', true)];

  it('selects the first living player when spectating begins', () => {
    expect(findAliveSpectatorTarget(players, null)?.id).toBe('one');
  });

  it('moves forward and wraps across dead players', () => {
    expect(findAliveSpectatorTarget(players, 'one', 1)?.id).toBe('three');
    expect(findAliveSpectatorTarget(players, 'three', 1)?.id).toBe('one');
  });

  it('moves backward and wraps across dead players', () => {
    expect(findAliveSpectatorTarget(players, 'one', -1)?.id).toBe('three');
    expect(findAliveSpectatorTarget(players, 'disconnected', -1)?.id).toBe('three');
  });

  it('returns no target when nobody is alive', () => {
    expect(findAliveSpectatorTarget([player('one', false)], null)).toBeUndefined();
  });
});
