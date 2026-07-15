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

export class InputController {
  private readonly pressedMovementCodes = new Set<string>();
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    ENTER: Phaser.Input.Keyboard.Key;
    R: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
  };
  private lastInputSend = 0;
  private readonly inputHz = 1000 / 60;
  private pendingDash = false;
  private pendingReload = false;
  private pendingShield = false;
  private inputBlocked = false;
  private readonly onSettingsMenu = (event: Event): void => {
    this.inputBlocked = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
  };
  private readonly onNativeKeyDown = (event: KeyboardEvent): void => {
    if (this.isMovementCode(event.code)) this.pressedMovementCodes.add(event.code);
  };
  private readonly onNativeKeyUp = (event: KeyboardEvent): void => {
    this.pressedMovementCodes.delete(event.code);
  };
  private readonly onWindowBlur = (): void => {
    this.pressedMovementCodes.clear();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: SceneState,
    private readonly touchControls: TouchControls | null = null,
  ) {
    window.addEventListener('tank-arena:settings-menu', this.onSettingsMenu);
    window.addEventListener('keydown', this.onNativeKeyDown);
    window.addEventListener('keyup', this.onNativeKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
  }

  destroy(): void {
    window.removeEventListener('tank-arena:settings-menu', this.onSettingsMenu);
    window.removeEventListener('keydown', this.onNativeKeyDown);
    window.removeEventListener('keyup', this.onNativeKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.pressedMovementCodes.clear();
  }

  setup(): void {
    const kb = this.scene.input.keyboard!;
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      Q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    };

    kb.on('keydown-ENTER', () => {
      const gameState = this.state.getGameState();
      const socket = this.state.getSocket();
      if (gameState?.status === 'waiting' && this.state.getMyPlayerId()) {
        socket.emit(SOCKET_EVENTS.GAME.START);
      } else if (
        environment.devGameMode &&
        gameState?.status === 'finished'
      ) {
        socket.emit(SOCKET_EVENTS.GAME.RESTART);
      }
    });

    kb.on('keydown-SHIFT', () => {
      this.pendingDash = true;
    });

    kb.on('keydown-R', () => {
      this.pendingReload = true;
    });

    kb.on('keydown-Q', () => {
      this.pendingShield = true;
    });
  }

  sendInput(time: number): void {
    const myPlayerId = this.state.getMyPlayerId();
    const gameState = this.state.getGameState();
    if (!myPlayerId || !gameState) return;
    if (time - this.lastInputSend < this.inputHz) return;
    this.lastInputSend = time;

    if (gameState.status !== 'playing') return;

    const me = gameState.players.find(p => p.id === myPlayerId);
    if (!me?.alive) {
      this.pendingDash = false;
      this.pendingReload = false;
      this.pendingShield = false;
      return;
    }

    const touch = this.touchControls;
    const touchMove = touch?.getMove() ?? { x: 0, y: 0 };
    const touchFiring = touch?.isFiring() ?? false;
    const touchDash = touch?.consumeAction('dash') ?? false;
    const touchReload = touch?.consumeAction('reload') ?? false;
    const touchShield = touch?.consumeAction('shield') ?? false;

    let moveX = 0;
    let moveY = 0;
    if (!this.inputBlocked) {
      if (touchMove.x !== 0 || touchMove.y !== 0) {
        moveX = touchMove.x;
        moveY = touchMove.y;
      } else {
        if (this.keys.W.isDown || this.pressedMovementCodes.has('KeyW')) moveY -= 1;
        if (this.keys.S.isDown || this.pressedMovementCodes.has('KeyS')) moveY += 1;
        if (this.keys.A.isDown || this.pressedMovementCodes.has('KeyA')) moveX -= 1;
        if (this.keys.D.isDown || this.pressedMovementCodes.has('KeyD')) moveX += 1;
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
      dash: !this.inputBlocked && (this.pendingDash || touchDash),
      reload: !this.inputBlocked && (this.pendingReload || touchReload),
      shield: !this.inputBlocked && (this.pendingShield || touchShield),
    };
    this.pendingDash = false;
    this.pendingReload = false;
    this.pendingShield = false;
    this.state.getSocket().emit(SOCKET_EVENTS.GAME.PLAYER_INPUT, input);
  }

  private isMovementCode(code: string): boolean {
    return code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD';
  }
}
