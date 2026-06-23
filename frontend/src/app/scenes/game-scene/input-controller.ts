import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { GameState } from '../../types/game-state.types';
import { PlayerInput } from '../../types/input.types';

type SceneState = {
  getGameState(): GameState | null;
  getMyPlayerId(): string;
  getSocket(): Socket;
};

export class InputController {
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: SceneState,
  ) {}

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
        socket.emit('startGame');
      } else if (gameState?.status === 'finished') {
        socket.emit('restartGame');
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

    let moveX = 0;
    let moveY = 0;
    if (this.keys.W.isDown) moveY -= 1;
    if (this.keys.S.isDown) moveY += 1;
    if (this.keys.A.isDown) moveX -= 1;
    if (this.keys.D.isDown) moveX += 1;

    const me = gameState.players.find(p => p.id === myPlayerId);
    let aimAngle = 0;
    if (me) {
      const ptr = this.scene.input.activePointer;
      aimAngle = Phaser.Math.Angle.Between(me.x, me.y, ptr.worldX, ptr.worldY);
    }

    const input: PlayerInput = {
      moveX,
      moveY,
      aimAngle,
      shoot: this.scene.input.activePointer.isDown,
      dash: this.pendingDash,
      reload: this.pendingReload,
      shield: this.pendingShield,
    };
    this.pendingDash = false;
    this.pendingReload = false;
    this.pendingShield = false;
    this.state.getSocket().emit('playerInput', input);
  }
}
