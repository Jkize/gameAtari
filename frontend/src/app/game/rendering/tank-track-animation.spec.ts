import { describe, expect, it } from 'vitest';
import {
  advanceTankTrackAnimation,
  createTankTrackAnimationState,
} from '@game/rendering/tank-track-animation';

describe('tank track animation', () => {
  it('keeps the first frame while stationary or only jittering', () => {
    const state = createTankTrackAnimationState(10, 20);

    expect(advanceTankTrackAnimation(state, 10, 20)).toBe(0);
    expect(advanceTankTrackAnimation(state, 10.05, 20.05)).toBe(0);
  });

  it('advances and wraps frames according to travelled distance', () => {
    const state = createTankTrackAnimationState(0, 0);

    expect(advanceTankTrackAnimation(state, 14, 0)).toBe(1);
    expect(advanceTankTrackAnimation(state, 28, 0)).toBe(2);
    expect(advanceTankTrackAnimation(state, 42, 0)).toBe(0);
  });

  it('resets after a large position jump', () => {
    const state = createTankTrackAnimationState(0, 0);
    advanceTankTrackAnimation(state, 22, 0);

    expect(advanceTankTrackAnimation(state, 200, 0)).toBe(0);
    expect(state.travelled).toBe(0);
  });
});
