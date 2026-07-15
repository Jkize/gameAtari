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

describe('InputController', () => {
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

  it('reads WASD from native events even when another SPA listener prevented the event', () => {
    const keyboard = {
      addKey: vi.fn(() => ({ isDown: false })),
      on: vi.fn(),
    };
    const scene = {
      input: {
        keyboard,
        activePointer: { isDown: false, worldX: 300, worldY: 300 },
      },
    } as unknown as Phaser.Scene;
    const socket = { emit: vi.fn() } as unknown as Socket;
    const gameState = {
      status: 'playing',
      players: [{ id: 'me', alive: true, aimAngle: 0, x: 100, y: 100 }],
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
    const keyDown = new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true });
    keyDown.preventDefault();
    window.dispatchEvent(keyDown);
    controller.sendInput(20);

    expect(socket.emit).toHaveBeenCalledWith(
      'playerInput',
      expect.objectContaining({ moveX: 0, moveY: -1 }),
    );

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    controller.destroy();
  });

  it('reads dash, reload and shield from native events when Phaser listeners do not fire', () => {
    const keyboard = {
      addKey: vi.fn(() => ({ isDown: false })),
      on: vi.fn(),
    };
    const scene = {
      input: {
        keyboard,
        activePointer: { isDown: false, worldX: 300, worldY: 300 },
      },
    } as unknown as Phaser.Scene;
    const socket = { emit: vi.fn() } as unknown as Socket;
    const gameState = {
      status: 'playing',
      players: [{ id: 'me', alive: true, aimAngle: 0, x: 100, y: 100 }],
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
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
    controller.sendInput(20);

    expect(socket.emit).toHaveBeenNthCalledWith(
      1,
      'playerInput',
      expect.objectContaining({
        moveY: -1,
        dash: true,
        reload: true,
        shield: true,
      }),
    );

    controller.sendInput(40);
    expect(socket.emit).toHaveBeenNthCalledWith(
      2,
      'playerInput',
      expect.objectContaining({ dash: false, reload: false, shield: false }),
    );

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    controller.destroy();
  });
});
