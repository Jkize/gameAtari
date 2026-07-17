import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhaserKeyboardGuard } from './phaser-keyboard-guard';

vi.mock('phaser', () => ({
  default: {
    Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } },
    Scenes: { Events: { PAUSE: 'pause', SLEEP: 'sleep', RESUME: 'resume', WAKE: 'wake' } },
    Input: {
      Keyboard: {
        KeyCodes: { W: 1, A: 2, S: 3, D: 4, SHIFT: 5, ENTER: 6, R: 7, Q: 8 },
      },
    },
  },
}));

type KeyName = 'up' | 'down' | 'left' | 'right' | 'dash' | 'reload' | 'shield' | 'start';
type FakeKey = { isDown: boolean; keyCode: number };
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
    up: { isDown: false, keyCode: 1 },
    down: { isDown: false, keyCode: 3 },
    left: { isDown: false, keyCode: 2 },
    right: { isDown: false, keyCode: 4 },
    dash: { isDown: false, keyCode: 5 },
    reload: { isDown: false, keyCode: 7 },
    shield: { isDown: false, keyCode: 8 },
    start: { isDown: false, keyCode: 6 },
  };
}

function keyboardEvent(type: 'keydown' | 'keyup', code: string, keyCode: number): KeyboardEvent {
  const event = new KeyboardEvent(type, { code, cancelable: true });
  Object.defineProperty(event, 'keyCode', { value: keyCode });
  return event;
}

function harness() {
  const keys = createKeys();
  const keyboard = {
    enabled: true,
    manager: {
      enabled: true,
      startListeners: vi.fn(() => { keyboard.manager.enabled = true; }),
      onKeyDown: vi.fn((event: KeyboardEvent) => {
        const key = Object.values(keys).find(candidate => candidate.keyCode === event.keyCode);
        if (key) key.isDown = true;
      }),
      onKeyUp: vi.fn((event: KeyboardEvent) => {
        const key = Object.values(keys).find(candidate => candidate.keyCode === event.keyCode);
        if (key) key.isDown = false;
      }),
    },
    addKeys: vi.fn(() => keys),
    resetKeys: vi.fn(() => {
      Object.values(keys).forEach(key => { key.isDown = false; });
      return keyboard;
    }),
  };
  const gameEvents = eventBus();
  const sceneEvents = eventBus();
  const canInput = vi.fn(() => true);
  const scene = {
    input: { keyboard },
    game: { events: gameEvents },
    events: sceneEvents,
    sys: { canInput },
  } as unknown as Phaser.Scene;
  const onSuspended = vi.fn();
  const guard = new PhaserKeyboardGuard(scene, onSuspended);
  const registeredKeys = guard.setup();
  keyboard.resetKeys.mockClear();
  keyboard.manager.startListeners.mockClear();
  return {
    canInput,
    gameEvents,
    guard,
    keyboard,
    keys,
    onSuspended,
    registeredKeys,
    sceneEvents,
  };
}

describe('PhaserKeyboardGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers gameplay keys and installs native health listeners', () => {
    const listenerSpy = vi.spyOn(window, 'addEventListener');
    const test = harness();

    expect(test.keyboard.addKeys).toHaveBeenCalledWith({
      up: 1,
      down: 3,
      left: 2,
      right: 4,
      dash: 5,
      reload: 7,
      shield: 8,
      start: 6,
    }, true, false);
    expect(test.registeredKeys).toBe(test.keys);
    const eventNames = listenerSpy.mock.calls.map(call => call[0]);
    expect(eventNames).toContain('keydown');
    expect(eventNames).toContain('keyup');
    test.guard.destroy();
    listenerSpy.mockRestore();
  });

  it('repairs missed keydown and keyup events through Phaser after propagation', async () => {
    const test = harness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    test.keyboard.manager.enabled = false;
    const keydown = keyboardEvent('keydown', 'KeyW', 1);
    keydown.preventDefault();

    window.dispatchEvent(keydown);
    expect(test.keyboard.manager.onKeyDown).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(test.keyboard.manager.startListeners).toHaveBeenCalledOnce();
    expect(test.keyboard.manager.onKeyDown).toHaveBeenCalledOnce();
    expect(test.keys.up.isDown).toBe(true);

    window.dispatchEvent(keyboardEvent('keyup', 'KeyW', 1));
    await Promise.resolve();
    expect(test.keyboard.manager.onKeyUp).toHaveBeenCalledOnce();
    expect(test.keys.up.isDown).toBe(false);
    test.guard.destroy();
    warn.mockRestore();
  });

  it('does not replay an event Phaser already processed', async () => {
    const test = harness();
    test.keys.left.isDown = true;

    window.dispatchEvent(keyboardEvent('keydown', 'KeyA', 2));
    await Promise.resolve();

    expect(test.keyboard.manager.onKeyDown).not.toHaveBeenCalled();
    test.guard.destroy();
  });

  it('ignores keyboard events from editable elements', async () => {
    const test = harness();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = keyboardEvent('keydown', 'KeyW', 1);
    Object.defineProperty(event, 'bubbles', { value: true });

    input.dispatchEvent(event);
    await Promise.resolve();

    expect(test.keyboard.manager.onKeyDown).not.toHaveBeenCalled();
    input.remove();
    test.guard.destroy();
  });

  it('does not recover an inactive scene or after destruction', async () => {
    const test = harness();
    test.canInput.mockReturnValue(false);
    window.dispatchEvent(keyboardEvent('keydown', 'KeyW', 1));
    await Promise.resolve();
    expect(test.keyboard.manager.onKeyDown).not.toHaveBeenCalled();

    test.canInput.mockReturnValue(true);
    window.dispatchEvent(keyboardEvent('keydown', 'KeyW', 1));
    test.guard.destroy();
    await Promise.resolve();
    expect(test.keyboard.manager.onKeyDown).not.toHaveBeenCalled();
  });

  it('blocks and restores Phaser input with the settings menu', () => {
    const test = harness();
    test.keys.up.isDown = true;

    window.dispatchEvent(new CustomEvent('tank-arena:settings-menu', { detail: { open: true } }));
    expect(test.guard.blocked).toBe(true);
    expect(test.keyboard.enabled).toBe(false);
    expect(test.keys.up.isDown).toBe(false);
    expect(test.onSuspended).toHaveBeenCalledOnce();

    window.dispatchEvent(new CustomEvent('tank-arena:settings-menu', { detail: { open: false } }));
    expect(test.guard.blocked).toBe(false);
    expect(test.keyboard.enabled).toBe(true);
    test.guard.destroy();
  });

  it.each(['blur', 'pause', 'sleep'])('resets keys and reports suspension on %s', event => {
    const test = harness();
    test.keys.down.isDown = true;
    const bus = event === 'blur' ? test.gameEvents : test.sceneEvents;

    bus.emit(event);

    expect(test.keyboard.resetKeys).toHaveBeenCalledOnce();
    expect(test.keys.down.isDown).toBe(false);
    expect(test.onSuspended).toHaveBeenCalledOnce();
    test.guard.destroy();
  });

  it('removes lifecycle listeners and restores the keyboard on destroy', () => {
    const test = harness();
    test.keyboard.enabled = false;

    test.guard.destroy();

    expect(test.gameEvents.off).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(test.sceneEvents.off).toHaveBeenCalledWith('pause', expect.any(Function));
    expect(test.sceneEvents.off).toHaveBeenCalledWith('sleep', expect.any(Function));
    expect(test.keyboard.resetKeys).toHaveBeenCalledOnce();
    expect(test.keyboard.enabled).toBe(true);
  });
});
