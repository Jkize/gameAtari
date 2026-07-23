import type Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameState } from '@game/contracts/game-state.types';
import { InputController } from './input-controller';
import type { TouchControls } from './touch-controls';

vi.mock('phaser', () => ({
  default: {
    Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } },
    Scenes: { Events: { PAUSE: 'pause', SLEEP: 'sleep', RESUME: 'resume', WAKE: 'wake' } },
    Input: {
      Keyboard: {
        KeyCodes: { W: 1, A: 2, S: 3, D: 4, SHIFT: 5, ENTER: 6, R: 7, Q: 8 },
        JustDown: vi.fn((key: { justDown?: boolean }) => {
          const pressed = key.justDown === true;
          key.justDown = false;
          return pressed;
        }),
      },
    },
    Math: {
      Angle: { Between: vi.fn(() => 0) },
    },
  },
}));

type KeyName = 'up' | 'down' | 'left' | 'right' | 'dash' | 'reload' | 'shield' | 'start';
type FakeKey = { isDown: boolean; justDown: boolean; keyCode: number };
type Listener = (...args: unknown[]) => void;

function eventBus() {
  const listeners = new Map<unknown, Set<Listener>>();
  const bus = {
    on: vi.fn((event: unknown, listener: Listener) => {
      const handlers = listeners.get(event) ?? new Set<Listener>();
      handlers.add(listener);
      listeners.set(event, handlers);
      return bus;
    }),
    off: vi.fn((event: unknown, listener: Listener) => {
      listeners.get(event)?.delete(listener);
      return bus;
    }),
    emit: (event: unknown, ...args: unknown[]) => {
      listeners.get(event)?.forEach(listener => listener(...args));
    },
  };
  return bus;
}

function createKeys(): Record<KeyName, FakeKey> {
  return {
    up: { isDown: false, justDown: false, keyCode: 1 },
    down: { isDown: false, justDown: false, keyCode: 3 },
    left: { isDown: false, justDown: false, keyCode: 2 },
    right: { isDown: false, justDown: false, keyCode: 4 },
    dash: { isDown: false, justDown: false, keyCode: 5 },
    reload: { isDown: false, justDown: false, keyCode: 7 },
    shield: { isDown: false, justDown: false, keyCode: 8 },
    start: { isDown: false, justDown: false, keyCode: 6 },
  };
}

function press(key: FakeKey): void {
  key.isDown = true;
  key.justDown = true;
}

function harness(
  status: GameState['status'] = 'playing',
  alive = true,
  touchControls: TouchControls | null = null,
) {
  const keys = createKeys();
  const keyboard = {
    enabled: true,
    manager: {
      enabled: true,
      startListeners: vi.fn(() => { keyboard.manager.enabled = true; }),
      onKeyDown: vi.fn((event: KeyboardEvent) => {
        const key = Object.values(keys).find(candidate => candidate.keyCode === event.keyCode);
        if (key) {
          key.isDown = true;
          key.justDown = true;
        }
      }),
      onKeyUp: vi.fn((event: KeyboardEvent) => {
        const key = Object.values(keys).find(candidate => candidate.keyCode === event.keyCode);
        if (key) key.isDown = false;
      }),
    },
    addKeys: vi.fn(() => keys),
    resetKeys: vi.fn(() => {
      Object.values(keys).forEach(key => {
        key.isDown = false;
        key.justDown = false;
      });
      return keyboard;
    }),
  };
  const gameEvents = eventBus();
  const sceneEvents = eventBus();
  const canInput = vi.fn(() => true);
  const scene = {
    input: {
      keyboard,
      activePointer: { isDown: false, worldX: 300, worldY: 300 },
    },
    game: { events: gameEvents },
    events: sceneEvents,
    sys: { canInput },
  } as unknown as Phaser.Scene;
  const socket = { emit: vi.fn() } as unknown as Socket;
  const gameState = {
    status,
    players: [{ id: 'me', alive, aimAngle: 1.5, x: 100, y: 100 }],
    bullets: [],
    powerUps: [],
    impactEvents: [],
    map: { width: 1600, height: 1200, obstacles: [], powerUps: [] },
  } as unknown as GameState;
  const controller = new InputController(scene, {
    getGameState: () => gameState,
    getMyPlayerId: () => 'me',
    getSocket: () => socket,
  }, touchControls);
  controller.setup();
  keyboard.resetKeys.mockClear();
  keyboard.manager.startListeners.mockClear();
  return { canInput, controller, gameEvents, gameState, keyboard, keys, sceneEvents, socket };
}

describe('InputController', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['up', 0, -1],
    ['down', 0, 1],
    ['left', -1, 0],
    ['right', 1, 0],
  ] as const)('reads %s movement from Phaser Key.isDown', (keyName, moveX, moveY) => {
    const test = harness();
    test.keys[keyName].isDown = true;

    test.controller.sendInput(20);

    expect(test.socket.emit).toHaveBeenCalledWith(
      'playerInput',
      expect.objectContaining({ moveX, moveY }),
    );
    test.controller.destroy();
  });

  it('combines simultaneous Phaser movement keys', () => {
    const test = harness();
    test.keys.up.isDown = true;
    test.keys.left.isDown = true;

    test.controller.sendInput(20);

    expect(test.socket.emit).toHaveBeenCalledWith(
      'playerInput',
      expect.objectContaining({ moveX: -1, moveY: -1 }),
    );
    test.controller.destroy();
  });

  it('continues emitting input during the finished-round animation window', () => {
    const test = harness('finished');
    test.keys.right.isDown = true;

    test.controller.sendInput(20);

    expect(test.socket.emit).toHaveBeenCalledWith(
      'playerInput',
      expect.objectContaining({ moveX: 1, moveY: 0 }),
    );
    test.controller.destroy();
  });

  it('cancels movement when opposite Phaser keys are held together', () => {
    const test = harness();
    test.keys.up.isDown = true;
    test.keys.down.isDown = true;
    test.keys.left.isDown = true;
    test.keys.right.isDown = true;

    test.controller.sendInput(20);

    expect(test.socket.emit).toHaveBeenCalledWith(
      'playerInput',
      expect.objectContaining({ moveX: 0, moveY: 0 }),
    );
    test.controller.destroy();
  });

  it('does not read stale movement while the Phaser keyboard plugin is disabled', () => {
    const test = harness();
    test.keys.up.isDown = true;
    test.keyboard.enabled = false;

    test.controller.sendInput(20);

    expect(test.socket.emit).toHaveBeenCalledWith(
      'playerInput',
      expect.objectContaining({ moveX: 0, moveY: 0 }),
    );
    test.controller.destroy();
  });

  it('emits dash, reload and shield once through Phaser JustDown', () => {
    const test = harness();
    test.keys.up.isDown = true;
    press(test.keys.dash);
    press(test.keys.reload);
    press(test.keys.shield);

    test.controller.sendInput(20);
    test.controller.sendInput(40);

    expect(test.socket.emit).toHaveBeenNthCalledWith(
      1,
      'playerInput',
      expect.objectContaining({ moveY: -1, dash: true, reload: true, shield: true }),
    );
    expect(test.socket.emit).toHaveBeenNthCalledWith(
      2,
      'playerInput',
      expect.objectContaining({ dash: false, reload: false, shield: false }),
    );
    test.controller.destroy();
  });

  it('keeps touch movement and actions working without reading keyboard movement', () => {
    const touchControls = {
      consumeAction: vi.fn((action: string) => action === 'shield'),
      getMove: vi.fn(() => ({ x: 0.6, y: -0.4 })),
      isFiring: vi.fn(() => true),
      getAimAngle: vi.fn(() => 0.75),
    } as unknown as TouchControls;
    const test = harness('playing', true, touchControls);
    test.keys.left.isDown = true;
    press(test.keys.dash);

    test.controller.sendInput(20);

    expect(test.socket.emit).toHaveBeenCalledWith('playerInput', {
      moveX: 0.6,
      moveY: -0.4,
      aimAngle: 0.75,
      shoot: true,
      dash: true,
      reload: false,
      shield: true,
    });
    test.controller.destroy();
  });

  it('respects the configured 60 Hz input cadence', () => {
    const test = harness();
    test.keys.right.isDown = true;

    test.controller.sendInput(10);
    test.controller.sendInput(17);
    test.controller.sendInput(25);
    test.controller.sendInput(34);

    expect(test.socket.emit).toHaveBeenCalledTimes(2);
    test.controller.destroy();
  });

  it('consumes countdown actions without leaking them into gameplay', () => {
    const test = harness('waiting');
    press(test.keys.start);
    press(test.keys.dash);
    press(test.keys.reload);
    press(test.keys.shield);

    test.controller.sendInput(20);
    test.gameState.status = 'playing';
    test.controller.sendInput(40);

    expect(test.socket.emit).toHaveBeenNthCalledWith(1, 'startGame');
    expect(test.socket.emit).toHaveBeenNthCalledWith(
      2,
      'playerInput',
      expect.objectContaining({ dash: false, reload: false, shield: false }),
    );
    test.controller.destroy();
  });

  it('emits neutral server input when the keyboard guard reports suspension', () => {
    const test = harness();
    test.keys.right.isDown = true;
    test.controller.sendInput(20);

    test.gameEvents.emit('blur');

    expect(test.socket.emit).toHaveBeenLastCalledWith('playerInput', {
      moveX: 0,
      moveY: 0,
      aimAngle: 1.5,
      shoot: false,
      dash: false,
      reload: false,
      shield: false,
    });
    test.controller.destroy();
  });

  it('emits neutral input on suspension during the finished-round animation window', () => {
    const test = harness('finished');
    test.keys.right.isDown = true;
    test.controller.sendInput(20);

    test.gameEvents.emit('blur');

    expect(test.socket.emit).toHaveBeenLastCalledWith(
      'playerInput',
      expect.objectContaining({ moveX: 0, moveY: 0, shoot: false }),
    );
    test.controller.destroy();
  });

  it('does not emit player input after the local player is eliminated', () => {
    const test = harness('playing', false);
    test.keys.up.isDown = true;
    press(test.keys.dash);

    test.controller.sendInput(20);

    expect(test.socket.emit).not.toHaveBeenCalled();
    test.controller.destroy();
  });
});
