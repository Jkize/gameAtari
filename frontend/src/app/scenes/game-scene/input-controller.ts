import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { GameState } from '../../types/game-state.types';
import { PlayerInput } from '../../types/input.types';
import { environment } from '../../../environments/environment';
import { SOCKET_EVENTS } from '../../network/socket-events';
import { TouchControls } from './touch-controls';

type SceneState = {
  getGameState(): GameState | null;
  getMyPlayerId(): string;
  getSocket(): Socket;
};

type GameplayKeys = Record<
  'up' | 'down' | 'left' | 'right' | 'dash' | 'reload' | 'shield' | 'start',
  Phaser.Input.Keyboard.Key
>;

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
  private inputBlocked = false;
  private readonly onSettingsMenu = (event: Event): void => {
    this.inputBlocked = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    keyboard.resetKeys();
    keyboard.enabled = !this.inputBlocked;
    if (this.inputBlocked) this.emitNeutralInput();
  };
  private readonly onPhaserInputSuspended = (): void => {
    this.scene.input.keyboard?.resetKeys();
    this.emitNeutralInput();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: SceneState,
    private readonly touchControls: TouchControls | null = null,
  ) {
    window.addEventListener('tank-arena:settings-menu', this.onSettingsMenu);
  }

  destroy(): void {
    window.removeEventListener('tank-arena:settings-menu', this.onSettingsMenu);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onPhaserInputSuspended);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.onPhaserInputSuspended);
    this.scene.events.off(Phaser.Scenes.Events.SLEEP, this.onPhaserInputSuspended);
    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      keyboard.resetKeys();
      keyboard.enabled = true;
    }
  }

  setup(): void {
    const kb = this.scene.input.keyboard!;
    this.keys = kb.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      reload: Phaser.Input.Keyboard.KeyCodes.R,
      shield: Phaser.Input.Keyboard.KeyCodes.Q,
      start: Phaser.Input.Keyboard.KeyCodes.ENTER,
    }, true, false) as GameplayKeys;
    this.scene.game.events.on(Phaser.Core.Events.BLUR, this.onPhaserInputSuspended);
    this.scene.events.on(Phaser.Scenes.Events.PAUSE, this.onPhaserInputSuspended);
    this.scene.events.on(Phaser.Scenes.Events.SLEEP, this.onPhaserInputSuspended);
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

    if (gameState.status !== 'playing') return;

    const me = gameState.players.find(p => p.id === myPlayerId);
    if (!me?.alive) return;

    const touch = this.touchControls;
    const touchMove = touch?.getMove() ?? { x: 0, y: 0 };
    const touchFiring = touch?.isFiring() ?? false;

    let moveX = 0;
    let moveY = 0;
    if (!this.inputBlocked) {
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
      shoot: !this.inputBlocked && shoot,
      dash: !this.inputBlocked && (keyboardActions.dash || touchDash),
      reload: !this.inputBlocked && (keyboardActions.reload || touchReload),
      shield: !this.inputBlocked && (keyboardActions.shield || touchShield),
    };
    this.state.getSocket().emit(SOCKET_EVENTS.GAME.PLAYER_INPUT, input);
  }

  private consumeKeyboardActions(): KeyboardActions {
    if (this.inputBlocked || !this.scene.input.keyboard?.enabled) {
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
    if (!myPlayerId || gameState?.status !== 'playing') return;
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
