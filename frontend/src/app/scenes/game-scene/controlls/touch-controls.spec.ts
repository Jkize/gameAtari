import { vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      DegToRad: (degrees: number) => degrees * Math.PI / 180,
      Distance: { Between: vi.fn(() => 0) },
      Vector2: class Vector2 {
        constructor(public x: number, public y: number) {}
      },
    },
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
        POINTER_MOVE: 'pointermove',
        POINTER_UP: 'pointerup',
        POINTER_UP_OUTSIDE: 'pointerupoutside',
      },
    },
  },
}));

import {
  resolveTouchAbilityFeedback,
  resolveTouchWeaponFeedback,
  TouchControls,
} from './touch-controls';

type TestableTouchControls = {
  visible: boolean;
  moveStick: {
    pointerId: number | null;
    touchId: number | null;
    baseX: number;
    baseY: number;
    dx: number;
    dy: number;
  };
  onWindowTouchMove(event: TouchEvent): void;
  onWindowTouchEnd(event: TouchEvent): void;
};

function touchEvent(identifier: number, pageX: number, pageY: number): TouchEvent {
  return {
    changedTouches: [{ identifier, pageX, pageY }],
  } as unknown as TouchEvent;
}

describe('TouchControls wide-screen touch fallback', () => {
  it('continues movement when the active touch moves outside the Phaser canvas', () => {
    const scene = {
      scale: {
        transformX: (pageX: number) => pageX,
        transformY: (pageY: number) => pageY,
      },
    };
    const controls = new TouchControls(scene as never);
    const testable = controls as unknown as TestableTouchControls;
    testable.visible = true;
    Object.assign(testable.moveStick, {
      pointerId: 1,
      touchId: 42,
      baseX: 100,
      baseY: 100,
    });

    testable.onWindowTouchMove(touchEvent(42, 220, 100));

    expect(controls.getMove()).toEqual({ x: 1, y: 0 });
  });

  it('releases movement when that outside touch ends or is cancelled', () => {
    const scene = {
      scale: {
        transformX: (pageX: number) => pageX,
        transformY: (pageY: number) => pageY,
      },
    };
    const controls = new TouchControls(scene as never);
    const testable = controls as unknown as TestableTouchControls;
    testable.visible = true;
    Object.assign(testable.moveStick, {
      pointerId: 1,
      touchId: 42,
      baseX: 100,
      baseY: 100,
    });
    testable.onWindowTouchMove(touchEvent(42, 220, 100));

    testable.onWindowTouchEnd(touchEvent(42, 220, 100));

    expect(controls.getMove()).toEqual({ x: 0, y: 0 });
  });
});

describe('TouchControls ability feedback', () => {
  it('represents dash cooldown as clamped visual progress without text', () => {
    expect(resolveTouchAbilityFeedback('dash', {
      dashCooldownMs: 2500,
      shieldCooldownMs: 0,
      shielding: false,
    })).toEqual({ active: false, ready: false, cooldownProgress: 0.5 });

    expect(resolveTouchAbilityFeedback('dash', {
      dashCooldownMs: 9000,
      shieldCooldownMs: 0,
      shielding: false,
    }).cooldownProgress).toBe(1);
  });

  it('prioritizes the active shield highlight over shield cooldown', () => {
    expect(resolveTouchAbilityFeedback('shield', {
      dashCooldownMs: 0,
      shieldCooldownMs: 8000,
      shielding: true,
    })).toEqual({ active: true, ready: false, cooldownProgress: 0 });
  });

  it('marks shield as ready after its cooldown finishes', () => {
    expect(resolveTouchAbilityFeedback('shield', {
      dashCooldownMs: 0,
      shieldCooldownMs: 0,
      shielding: false,
    })).toEqual({ active: false, ready: true, cooldownProgress: 0 });
  });
});

describe('TouchControls weapon feedback', () => {
  it('uses the standard shot icon when no weapon power-up is active', () => {
    expect(resolveTouchWeaponFeedback({
      dashCooldownMs: 0,
      shieldCooldownMs: 0,
      shielding: false,
      weapon: { reloadMs: 0, fireCooldownMs: 0 },
    })).toEqual(expect.objectContaining({
      iconKey: 'hud-shot',
      ready: true,
      cooldownProgress: 0,
    }));
  });

  it('changes the icon and color for the active weapon', () => {
    expect(resolveTouchWeaponFeedback({
      dashCooldownMs: 0,
      shieldCooldownMs: 0,
      shielding: false,
      weapon: { reloadMs: 0, fireCooldownMs: 150, activePowerUpType: 'shotgun' },
    })).toEqual({
      iconKey: 'weapon-power_shotgun',
      color: 0x10ff85,
      ready: false,
      cooldownProgress: 0.5,
    });
  });

  it('uses reload duration when reload and fire cooldown overlap', () => {
    expect(resolveTouchWeaponFeedback({
      dashCooldownMs: 0,
      shieldCooldownMs: 0,
      shielding: false,
      weapon: { reloadMs: 700, fireCooldownMs: 200, activePowerUpType: 'laser' },
    }).cooldownProgress).toBe(0.5);
  });
});
