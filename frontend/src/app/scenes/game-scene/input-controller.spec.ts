import type Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';
import { GameState } from '../../types/game-state.types';
import { InputController } from './input-controller';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: { W: 1, A: 2, S: 3, D: 4, SHIFT: 5, ENTER: 6, R: 7, Q: 8 },
      },
    },
    Math: {
      Angle: { Between: vi.fn(() => 0) },
    },
  },
}));

describe('InputController spectator guard', () => {
  it('does not emit player input after the local player is eliminated', () => {
    const keyboard = {
      addKey: vi.fn(() => ({ isDown: false })),
      on: vi.fn(),
    };
    const scene = {
      input: {
        keyboard,
        activePointer: { isDown: true, worldX: 300, worldY: 300 },
      },
    } as unknown as Phaser.Scene;
    const socket = { emit: vi.fn() } as unknown as Socket;
    const gameState = {
      status: 'playing',
      players: [{ id: 'me', alive: false }],
      bullets: [],
      powerUps: [],
      impactEvents: [],
      map: { width: 1600, height: 1200, obstacles: [], powerUps: [] },
    } as unknown as GameState;
    const controller = new InputController(scene, {
      getGameState: () => gameState,
      getMyPlayerId: () => 'me',
      getSocket: () => socket,
    });

    controller.setup();
    controller.sendInput(20);

    expect(socket.emit).not.toHaveBeenCalled();
    controller.destroy();
  });
});
