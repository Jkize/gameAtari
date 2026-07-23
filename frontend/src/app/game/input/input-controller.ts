import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { GameState } from '@game/contracts/game-state.types';
import { PlayerInput } from '@game/contracts/input.types';
import { environment } from '@env/environment';
import { SOCKET_EVENTS } from '@core/realtime/socket-events';
import { GameplayKeys, PhaserKeyboardGuard } from './phaser-keyboard-guard';
import { TouchControls } from './touch-controls';

type SceneState = {
  getGameState(): GameState | null;
  getMyPlayerId(): string;
  getSocket(): Socket;
};

type KeyboardActions = {
  dash: boolean;
  reload: boolean;
  shield: boolean;
  start: boolean;
};

export class InputController {
  private keys!: GameplayKeys;
  private lastInputSend = 0;
  private readonly inputHz = 1000 / 60;
  private readonly keyboardGuard: PhaserKeyboardGuard;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: SceneState,
    private readonly touchControls: TouchControls | null = null,
  ) {
    this.keyboardGuard = new PhaserKeyboardGuard(this.scene, () => this.emitNeutralInput());
  }

  destroy(): void {
    this.keyboardGuard.destroy();
  }

  setup(): void {
    this.keys = this.keyboardGuard.setup();
  }

  sendInput(time: number): void {
    if (time - this.lastInputSend < this.inputHz) return;
    this.lastInputSend = time;

    // Consume Phaser edge-triggered keys even outside active play so a key
    // pressed during the countdown cannot leak into the first gameplay frame.
    const keyboardActions = this.consumeKeyboardActions();
    const touchDash = this.touchControls?.consumeAction('dash') ?? false;
    const touchReload = this.touchControls?.consumeAction('reload') ?? false;
    const touchShield = this.touchControls?.consumeAction('shield') ?? false;

    const myPlayerId = this.state.getMyPlayerId();
    const gameState = this.state.getGameState();
    if (!myPlayerId || !gameState) return;

    if (keyboardActions.start) {
      if (gameState.status === 'waiting') {
        this.state.getSocket().emit(SOCKET_EVENTS.GAME.START);
      } else if (environment.devGameMode && gameState.status === 'finished') {
        this.state.getSocket().emit(SOCKET_EVENTS.GAME.RESTART);
      }
    }

    if (gameState.status !== 'playing' && gameState.status !== 'finished') return;

    const me = gameState.players.find(p => p.id === myPlayerId);
    if (!me?.alive) return;

    const touch = this.touchControls;
    const touchMove = touch?.getMove() ?? { x: 0, y: 0 };
    const touchFiring = touch?.isFiring() ?? false;

    let moveX = 0;
    let moveY = 0;
    if (!this.keyboardGuard.blocked) {
      if (touchMove.x !== 0 || touchMove.y !== 0) {
        moveX = touchMove.x;
        moveY = touchMove.y;
      } else if (this.scene.input.keyboard?.enabled) {
        if (this.keys.up.isDown) moveY -= 1;
        if (this.keys.down.isDown) moveY += 1;
        if (this.keys.left.isDown) moveX -= 1;
        if (this.keys.right.isDown) moveX += 1;
      }
    }

    let aimAngle = me.aimAngle;
    if (touch) {
      aimAngle = touch.getAimAngle() ?? aimAngle;
    } else {
      const ptr = this.scene.input.activePointer;
      aimAngle = Phaser.Math.Angle.Between(me.x, me.y, ptr.worldX, ptr.worldY);
    }

    // On touch devices pointer.isDown is any stick drag, so shooting comes
    // exclusively from the dedicated fire button.
    const shoot = touch ? touchFiring : this.scene.input.activePointer.isDown;

    const input: PlayerInput = {
      moveX,
      moveY,
      aimAngle,
      shoot: !this.keyboardGuard.blocked && shoot,
      dash: !this.keyboardGuard.blocked && (keyboardActions.dash || touchDash),
      reload: !this.keyboardGuard.blocked && (keyboardActions.reload || touchReload),
      shield: !this.keyboardGuard.blocked && (keyboardActions.shield || touchShield),
    };
    this.state.getSocket().emit(SOCKET_EVENTS.GAME.PLAYER_INPUT, input);
  }

  private consumeKeyboardActions(): KeyboardActions {
    if (this.keyboardGuard.blocked || !this.scene.input.keyboard?.enabled) {
      return { dash: false, reload: false, shield: false, start: false };
    }
    return {
      dash: Phaser.Input.Keyboard.JustDown(this.keys.dash),
      reload: Phaser.Input.Keyboard.JustDown(this.keys.reload),
      shield: Phaser.Input.Keyboard.JustDown(this.keys.shield),
      start: Phaser.Input.Keyboard.JustDown(this.keys.start),
    };
  }

  private emitNeutralInput(): void {
    const myPlayerId = this.state.getMyPlayerId();
    const gameState = this.state.getGameState();
    if (
      !myPlayerId ||
      !gameState ||
      (gameState.status !== 'playing' && gameState.status !== 'finished')
    ) return;
    const me = gameState.players.find(player => player.id === myPlayerId);
    if (!me?.alive) return;
    this.state.getSocket().emit(SOCKET_EVENTS.GAME.PLAYER_INPUT, {
      moveX: 0,
      moveY: 0,
      aimAngle: me.aimAngle,
      shoot: false,
      dash: false,
      reload: false,
      shield: false,
    } satisfies PlayerInput);
  }
}
