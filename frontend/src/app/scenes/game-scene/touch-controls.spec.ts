import { vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      DegToRad: (degrees: number) => degrees * Math.PI / 180,
      Distance: { Between: vi.fn(() => 0) },
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

import { TouchControls } from './touch-controls';

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
