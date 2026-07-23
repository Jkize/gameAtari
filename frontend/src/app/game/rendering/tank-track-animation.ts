const TRACK_FRAME_COUNT = 3;
const DISTANCE_PER_FRAME = 14;
const MOVEMENT_EPSILON = 0.1;
const POSITION_JUMP_THRESHOLD = 96;

export interface TankTrackAnimationState {
  previousX: number;
  previousY: number;
  travelled: number;
}

export function createTankTrackAnimationState(x: number, y: number): TankTrackAnimationState {
  return { previousX: x, previousY: y, travelled: 0 };
}

export function advanceTankTrackAnimation(
  state: TankTrackAnimationState,
  x: number,
  y: number,
): number {
  const distance = Math.hypot(x - state.previousX, y - state.previousY);
  state.previousX = x;
  state.previousY = y;

  if (distance >= POSITION_JUMP_THRESHOLD) {
    state.travelled = 0;
    return 0;
  }
  if (distance > MOVEMENT_EPSILON) state.travelled += distance;

  return Math.floor(state.travelled / DISTANCE_PER_FRAME) % TRACK_FRAME_COUNT;
}
