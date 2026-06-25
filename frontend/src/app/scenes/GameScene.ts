import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { GAME_VIEW_HEIGHT } from '../game/viewport.config';
import { socketManager } from '../network/socket';
import { GameState } from '../types/game-state.types';
import { ArenaBackgroundRenderer } from './game-scene/arena-background-renderer';
import { AudioManager } from './game-scene/audio-manager';
import { BulletRenderer } from './game-scene/bullet-renderer';
import { EffectSpawner } from './game-scene/effect-spawner';
import { clearDynamicLayers, createGameSceneLayers, GameSceneLayers } from './game-scene/game-scene-layers';
import { GameHudRenderer } from './game-scene/game-hud-renderer';
import { InputController } from './game-scene/input-controller';
import { ObstacleRenderer } from './game-scene/obstacle-renderer';
import { PlayerRenderer } from './game-scene/player-renderer';
import { PowerUpRenderer } from './game-scene/power-up-renderer';
import { StateChangeTracker } from './game-scene/state-change-tracker';
import { environment } from '../../environments/environment';

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private myPlayerId = '';
  private gameState: GameState | null = null;
  private mapW = 1600;
  private mapH = 1200;
  private layers!: GameSceneLayers;
  private camTarget!: Phaser.GameObjects.Rectangle;

  private backgroundRenderer!: ArenaBackgroundRenderer;
  private obstacleRenderer!: ObstacleRenderer;
  private powerUpRenderer!: PowerUpRenderer;
  private playerRenderer!: PlayerRenderer;
  private bulletRenderer!: BulletRenderer;
  private hudRenderer!: GameHudRenderer;
  private inputController!: InputController;
  private effectSpawner!: EffectSpawner;
  private audioManager!: AudioManager;
  private stateChangeTracker!: StateChangeTracker;
  private returnToLobbyTimer?: number;
  private readonly onGameJoined = (
    data: { playerId: string; map: GameState['map']; status: GameState['status'] },
  ): void => {
    this.resetRoundRenderState();
    this.myPlayerId = data.playerId;
    this.gameState = { status: data.status, map: data.map, players: [], bullets: [], impactEvents: [] };
    this.mapW = data.map.width;
    this.mapH = data.map.height;
    this.backgroundRenderer.draw(this.mapW, this.mapH);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setViewport(0, 0, this.scale.width, GAME_VIEW_HEIGHT);
  };
  private readonly onGameState = (state: GameState): void => {
    this.gameState = state;
  };
  private readonly onPlayerDisconnected = (data: { playerId: string }): void => {
    this.stateChangeTracker.removeDisconnectedPlayer(data.playerId);
  };
  private readonly onGameEnded = (data: { returnToLobbyInMs?: number }): void => {
    const returnToLobbyInMs = Math.min(data.returnToLobbyInMs ?? 5000, 5000);
    this.hudRenderer.setReturnToLobbyCountdown(returnToLobbyInMs);
    this.returnToLobbyTimer = window.setTimeout(() => {
      this.returnToLobby('round_finished');
    }, returnToLobbyInMs);
  };
  private readonly onRoomLeft = (): void => {
    this.returnToLobby('membership_expired');
  };
  private readonly onReconnectFailed = (): void => {
    this.returnToLobby('reconnect_failed');
  };
  private readonly onConnect = (): void => {
    this.joinConfiguredRoom();
  };

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.layers = createGameSceneLayers(this);
    this.cameras.main.setViewport(0, 0, this.scale.width, GAME_VIEW_HEIGHT);
    this.camTarget = this.add.rectangle(800, 600, 1, 1, 0x000000, 0).setDepth(-1);
    this.cameras.main.startFollow(this.camTarget, true, 0.08, 0.08);

    this.createHelpers();
    this.hudRenderer.create();
    this.inputController.setup();
    this.setupSocket();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSocketListeners, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupSocketListeners, this);

    this.cameras.main.fadeIn(500, 3, 6, 15);
  }

  override update(time: number): void {
    const state = this.gameState;

    if (!state) {
      this.hudRenderer.showConnectingOverlay();
      return;
    }

    this.stateChangeTracker.check(state, this.myPlayerId);
    clearDynamicLayers(this.layers);

    this.obstacleRenderer.drawGlows(state.map.obstacles);
    this.powerUpRenderer.draw(state.map.powerUps, time);
    this.playerRenderer.draw(state.players, state.map, this.myPlayerId, time);
    this.bulletRenderer.draw(state.bullets, time);

    this.followLocalPlayer();
    this.inputController.sendInput(time);
    this.hudRenderer.update(state, this.myPlayerId, time);
  }

  private createHelpers(): void {
    this.backgroundRenderer = new ArenaBackgroundRenderer(this.layers.bgGfx);
    this.effectSpawner = new EffectSpawner(this);
    this.audioManager = new AudioManager(this);
    this.obstacleRenderer = new ObstacleRenderer(this, this.layers);
    this.powerUpRenderer = new PowerUpRenderer(this, this.layers);
    this.playerRenderer = new PlayerRenderer(this, this.layers);
    this.bulletRenderer = new BulletRenderer(this.layers);
    this.hudRenderer = new GameHudRenderer(this);
    this.inputController = new InputController(this, {
      getGameState: () => this.gameState,
      getMyPlayerId: () => this.myPlayerId,
      getSocket: () => this.socket,
    });
    this.stateChangeTracker = new StateChangeTracker(
      this,
      this.effectSpawner,
      this.obstacleRenderer,
      this.powerUpRenderer,
      this.playerRenderer,
      this.audioManager,
    );
  }

  private setupSocket(): void {
    this.socket = socketManager.connect();

    this.socket.on('gameJoined', this.onGameJoined);
    this.socket.on('gameState', this.onGameState);
    this.socket.on('playerDisconnected', this.onPlayerDisconnected);
    this.socket.on('game:ended', this.onGameEnded);
    this.socket.on('room:left', this.onRoomLeft);
    this.socket.io.on('reconnect_failed', this.onReconnectFailed);
    this.socket.on('connect', this.onConnect);

    if (this.socket.connected) {
      this.joinConfiguredRoom();
    }
  }

  private joinConfiguredRoom(): void {
    if (!environment.devGameMode) {
      this.socket.emit('room:getState');
      return;
    }
    const match = window.location.pathname.match(/^\/game\/([^/]+)/);
    this.socket.emit('joinGame', { roomId: decodeURIComponent(match?.[1] ?? 'salatest') });
  }

  private returnToLobby(reason: string): void {
    window.dispatchEvent(new CustomEvent('tank-arena:return-lobby', {
      detail: { reason },
    }));
  }

  private cleanupSocketListeners(): void {
    if (this.returnToLobbyTimer !== undefined) {
      window.clearTimeout(this.returnToLobbyTimer);
      this.returnToLobbyTimer = undefined;
    }
    if (!this.socket) return;
    this.socket.off('gameJoined', this.onGameJoined);
    this.socket.off('gameState', this.onGameState);
    this.socket.off('playerDisconnected', this.onPlayerDisconnected);
    this.socket.off('game:ended', this.onGameEnded);
    this.socket.off('room:left', this.onRoomLeft);
    this.socket.off('connect', this.onConnect);
    this.socket.io.off('reconnect_failed', this.onReconnectFailed);
  }

  private resetRoundRenderState(): void {
    this.obstacleRenderer.reset();
    this.powerUpRenderer.reset();
    this.playerRenderer.reset();
    this.stateChangeTracker.reset();
  }

  private followLocalPlayer(): void {
    if (!this.gameState) return;
    const me = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (me) {
      this.camTarget.setPosition(me.x, me.y);
    }
  }
}
