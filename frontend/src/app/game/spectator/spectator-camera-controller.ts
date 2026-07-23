import Phaser from 'phaser';
import { GAME_VIEW_HEIGHT } from '@game/config/viewport.config';

export class SpectatorCameraController {
  private active = false;
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.active || this.dragPointerId !== null || pointer.y > GAME_VIEW_HEIGHT) return;
    this.scene.cameras.main.stopFollow();
    this.onFreePanStart();
    this.dragPointerId = pointer.id;
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    this.scene.input.setDefaultCursor('grabbing');
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.active || pointer.id !== this.dragPointerId) return;
    const camera = this.scene.cameras.main;
    const zoom = Math.max(camera.zoom, 0.001);
    camera.scrollX -= (pointer.x - this.lastPointerX) / zoom;
    camera.scrollY -= (pointer.y - this.lastPointerY) / zoom;
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    this.clampToMap();
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.dragPointerId) return;
    this.dragPointerId = null;
    this.scene.input.setDefaultCursor(this.active ? 'grab' : 'default');
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapSize: () => { width: number; height: number },
    private readonly onFreePanStart: () => void = () => undefined,
  ) {
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.dragPointerId = null;
    if (active) {
      this.scene.cameras.main.stopFollow();
      this.clampToMap();
    }
    this.scene.input.setDefaultCursor(active ? 'grab' : 'default');
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    this.dragPointerId = null;
    this.scene.input.setDefaultCursor('default');
  }

  private clampToMap(): void {
    const camera = this.scene.cameras.main;
    const { width, height } = this.mapSize();
    const visibleWidth = camera.width / Math.max(camera.zoom, 0.001);
    const visibleHeight = camera.height / Math.max(camera.zoom, 0.001);
    camera.scrollX = Phaser.Math.Clamp(camera.scrollX, 0, Math.max(0, width - visibleWidth));
    camera.scrollY = Phaser.Math.Clamp(camera.scrollY, 0, Math.max(0, height - visibleHeight));
  }
}
