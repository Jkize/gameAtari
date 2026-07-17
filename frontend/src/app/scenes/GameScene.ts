import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { GAME_VIEW_HEIGHT } from '../game/viewport.config';
import { socketManager } from '../network/socket';
import { SOCKET_EVENTS, SESSION_MESSAGES } from '../network/socket-events';
import { GameMap, GameState, RealtimeGameState } from '../types/game-state.types';
import { SnapshotInterpolator } from './game-scene/snapshot-interpolator';
import { ArenaBackgroundRenderer } from './game-scene/arena-background-renderer';
import { AudioManager } from './game-scene/audio-manager';
import { BulletRenderer } from './game-scene/bullet-renderer';
import { DangerZoneRenderer } from './game-scene/danger-zone-renderer';
import { EffectSpawner } from './game-scene/effect-spawner';
import { clearDynamicLayers, createGameSceneLayers, GameSceneLayers } from './game-scene/game-scene-layers';
import { GameHudRenderer } from './game-scene/game-hud-renderer';
import { InputController } from './game-scene/controlls/input-controller';
import { ObstacleRenderer } from './game-scene/obstacle-renderer';
import { PlayerRenderer } from './game-scene/player-renderer';
import { PowerUpRenderer } from './game-scene/power-up-renderer';
import { StateChangeTracker } from './game-scene/state-change-tracker';
import { SpectatorCameraController } from './game-scene/spectator-camera-controller';
import { findAliveSpectatorTarget, SpectatorDirection } from './game-scene/spectator-follow';
import { shouldUseSpectatorMode } from './game-scene/spectator-mode';
import { TouchControls } from './game-scene/controlls/touch-controls';
import { environment } from '../../environments/environment';
import type {
  PlayerEliminatedEvent,
  ViewerCountChangedEvent,
} from './game-scene/match-notification.types';

type RoomCountdownState = {
  status?: string;
  countdownSeconds?: number | null;
};

const RTT_PING_INTERVAL_MS = 1000;

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private myPlayerId = '';
  private gameState: GameState | null = null;
  private currentMap: GameMap | null = null;
  private mapW = 1600;
  private mapH = 1200;
  private layers!: GameSceneLayers;
  private camTarget!: Phaser.GameObjects.Rectangle;

  private backgroundRenderer!: ArenaBackgroundRenderer;
  private obstacleRenderer!: ObstacleRenderer;
  private powerUpRenderer!: PowerUpRenderer;
  private playerRenderer!: PlayerRenderer;
  private bulletRenderer!: BulletRenderer;
  private dangerZoneRenderer!: DangerZoneRenderer;
  private hudRenderer!: GameHudRenderer;
  private inputController!: InputController;
  private touchControls: TouchControls | null = null;
  private effectSpawner!: EffectSpawner;
  private audioManager!: AudioManager;
  private stateChangeTracker!: StateChangeTracker;
  private spectatorCamera!: SpectatorCameraController;
  private spectatorMode = false;
  private joinedAsWatcher = false;
  private currentRoomId = '';
  private viewerCount = 0;
  private localPlayerEliminated = false;
  private spectatedPlayerId: string | null = null;
  private spectatorFreeCamera = false;
  private returnToLobbyTimer?: number;
  private networkRttMs: number | null = null;
  private lastRttPingAt = 0;
  private readonly snapshotInterpolator = new SnapshotInterpolator({
    enabled: environment.interpolationEnabled,
  });
  private readonly onGameJoined = (
    data: { playerId: string; roomId: string; map: GameMap; status: GameState['status'] },
  ): void => {
    this.resetRoundRenderState();
    this.joinedAsWatcher = false;
    this.currentRoomId = data.roomId;
    this.myPlayerId = data.playerId;
    this.initializeMap(data.map, data.status);
  };
  private readonly onWatchJoined = (
    data: { watcherId: string; roomId: string; map: GameMap; status: GameState['status'] },
  ): void => {
    // A delayed watch response must not replace a player identity established
    // by gameJoined on the same long-lived socket.
    if (this.myPlayerId) return;
    this.resetRoundRenderState();
    this.joinedAsWatcher = true;
    this.currentRoomId = data.roomId;
    this.myPlayerId = '';
    this.initializeMap(data.map, data.status);
    void data.watcherId;
  };
  private readonly onPlayerEliminated = (event: PlayerEliminatedEvent): void => {
    this.hudRenderer.showElimination(event, this.myPlayerId);
  };
  private readonly onViewerCountChanged = (event: ViewerCountChangedEvent): void => {
    if (this.currentRoomId && event.roomId !== this.currentRoomId) return;
    this.viewerCount = Math.max(0, event.count);
  };
  private initializeMap(map: GameMap, status: GameState['status']): void {
    this.currentMap = map;
    this.gameState = {
      status,
      map: this.currentMap,
      players: [],
      bullets: [],
      powerUps: this.currentMap.powerUps,
      impactEvents: [],
    };
    this.mapW = map.width;
    this.mapH = map.height;
    this.backgroundRenderer.draw(this.mapW, this.mapH);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setViewport(0, 0, this.scale.width, GAME_VIEW_HEIGHT);
  }
  private readonly onGameState = (state: RealtimeGameState): void => {
    if (!this.currentMap) return;

    this.currentMap.powerUps = state.powerUps;

    if (state.status !== 'waiting') {
      this.hudRenderer.setWaitingCountdown(null);
    }

    const fullState: GameState = { ...state, map: this.currentMap };

    this.snapshotInterpolator.push(fullState);
  };
  private readonly onRoomCountdown = (state: RoomCountdownState): void => {
    this.hudRenderer.setWaitingCountdown(state.countdownSeconds ?? null);
  };
  private readonly onRoomCountdownCancelled = (): void => {
    this.hudRenderer.setWaitingCountdown(null);
  };
  private readonly onObstacleDamaged = (data: { id: string; hp: number; healthRatio: number }): void => {
    const obstacle = this.currentMap?.obstacles.find(obs => obs.id === data.id);
    if (!obstacle) return;
    obstacle.hp = data.hp;
    obstacle.healthRatio = data.healthRatio;
  };
  private readonly onObstacleDestroyed = (data: { id: string }): void => {
    if (!this.currentMap) return;
    this.currentMap.obstacles = this.currentMap.obstacles.filter(obs => obs.id !== data.id);
    this.obstacleRenderer.remove(data.id);
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
  private readonly onSessionReplaced = (data?: { message?: string }): void => {
    window.sessionStorage.setItem(
      'tank-arena:lobby-notice',
      data?.message ?? SESSION_MESSAGES.REPLACED,
    );
    this.returnToLobby('session_replaced');
  };
  private readonly onConnect = (): void => {
    this.joinConfiguredRoom();
  };
  private readonly onNetworkPong = (data: { sentAt?: number }): void => {
    if (typeof data.sentAt !== 'number') return;
    this.updateNetworkRtt(Date.now() - data.sentAt);
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
    // Touch control objects must exist before the HUD camera computes its
    // ignore list, so only the main (screen-fixed) camera renders them.
    this.touchControls?.create();
    this.hudRenderer.create();
    this.inputController.setup();
    this.setupSocket();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSocketListeners, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupSocketListeners, this);

    this.cameras.main.fadeIn(500, 3, 6, 15);
  }

  override update(time: number): void {
    const latest = this.snapshotInterpolator.latest();

    if (!latest) {
      this.hudRenderer.showConnectingOverlay();
      return;
    }

    // Authoritative state for input, HUD, events, sounds, HP, kills, power-ups, etc.
    this.gameState = latest;
    const spectatorMode = shouldUseSpectatorMode(
      this.gameState,
      this.myPlayerId,
      this.joinedAsWatcher,
      this.localPlayerEliminated,
    );
    if (!this.joinedAsWatcher && spectatorMode) {
      this.localPlayerEliminated = true;
    }
    this.setSpectatorMode(spectatorMode);

    // Interpolated state for visual rendering only.
    const renderState = this.snapshotInterpolator.buildRenderState() ?? this.gameState;

    if (this.spectatorMode) this.updateSpectatorFollow(this.gameState, renderState);

    // Authoritative: sounds, explosions, HP tracking, impact events, kill events.
    this.audioManager.syncMatchAudio(this.gameState, this.myPlayerId, this.joinedAsWatcher);
    this.stateChangeTracker.check(this.gameState, this.myPlayerId);

    clearDynamicLayers(this.layers);

    // Authoritative/static visuals.
    this.obstacleRenderer.drawGlows(this.gameState.map.obstacles);
    this.powerUpRenderer.draw(this.gameState.map.powerUps, time);
    this.dangerZoneRenderer.draw(this.gameState.dangerZone, this.gameState.map, time);

    // Interpolated visuals: remote player and bullet positions.
    this.playerRenderer.draw(renderState.players, renderState.map, this.myPlayerId, time);
    this.bulletRenderer.draw(renderState.bullets, time);

    if (!this.spectatorMode) this.followLocalPlayer(renderState);
    this.touchControls?.update(this.gameState.status, !this.spectatorMode);
    this.inputController.sendInput(time);
    this.updateRttProbe(time, this.gameState.status);
    this.hudRenderer.update(
      this.gameState,
      this.myPlayerId,
      time,
      this.networkRttMs,
      this.spectatorMode,
      this.getSpectatedPlayerName(),
      this.viewerCount,
    );
  }

  private updateRttProbe(time: number, status: GameState['status']): void {
    if (status !== 'playing') {
      this.networkRttMs = null;
      this.lastRttPingAt = 0;
      return;
    }

    if (time - this.lastRttPingAt < RTT_PING_INTERVAL_MS) return;
    this.lastRttPingAt = time;
    this.socket.emit(SOCKET_EVENTS.NETWORK.PING, { sentAt: Date.now() });
  }

  private updateNetworkRtt(sampleMs: number): void {
    const sample = Math.max(0, sampleMs);
    this.networkRttMs = this.networkRttMs === null
      ? sample
      : this.networkRttMs * 0.85 + sample * 0.15;
  }

  private createHelpers(): void {
    this.backgroundRenderer = new ArenaBackgroundRenderer(this.layers.bgGfx);
    this.effectSpawner = new EffectSpawner(this);
    this.audioManager = new AudioManager(this);
    this.obstacleRenderer = new ObstacleRenderer(this, this.layers);
    this.powerUpRenderer = new PowerUpRenderer(this, this.layers);
    this.playerRenderer = new PlayerRenderer(this, this.layers);
    this.bulletRenderer = new BulletRenderer(this.layers);
    this.dangerZoneRenderer = new DangerZoneRenderer(this.layers.dangerZoneGfx);
    this.touchControls = TouchControls.isSupported(this.game) ? new TouchControls(this) : null;
    this.hudRenderer = new GameHudRenderer(
      this,
      this.touchControls !== null,
      () => this.cycleSpectatorTarget(-1),
      () => this.cycleSpectatorTarget(1),
    );
    this.inputController = new InputController(this, {
      getGameState: () => this.gameState,
      getMyPlayerId: () => this.myPlayerId,
      getSocket: () => this.socket,
    }, this.touchControls);
    this.stateChangeTracker = new StateChangeTracker(
      this,
      this.effectSpawner,
      this.obstacleRenderer,
      this.powerUpRenderer,
      this.playerRenderer,
      this.audioManager,
    );
    this.spectatorCamera = new SpectatorCameraController(this, () => ({
      width: this.mapW,
      height: this.mapH,
    }), () => {
      if (!this.spectatorMode) return;
      this.spectatorFreeCamera = true;
      this.spectatedPlayerId = null;
    });
  }

  private setupSocket(): void {
    this.socket = socketManager.connect();

    this.socket.on(SOCKET_EVENTS.GAME.JOINED, this.onGameJoined);
    this.socket.on(SOCKET_EVENTS.GAME.WATCH_JOINED, this.onWatchJoined);
    this.socket.on(SOCKET_EVENTS.GAME.STATE, this.onGameState);
    this.socket.on(SOCKET_EVENTS.GAME.PLAYER_DISCONNECTED, this.onPlayerDisconnected);
    this.socket.on(SOCKET_EVENTS.GAME.PLAYER_ELIMINATED, this.onPlayerEliminated);
    this.socket.on(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, this.onViewerCountChanged);
    this.socket.on(SOCKET_EVENTS.GAME.ENDED, this.onGameEnded);
    this.socket.on(SOCKET_EVENTS.OBSTACLE.DAMAGED, this.onObstacleDamaged);
    this.socket.on(SOCKET_EVENTS.OBSTACLE.DESTROYED, this.onObstacleDestroyed);
    this.socket.on(SOCKET_EVENTS.ROOM.STATE_UPDATED, this.onRoomCountdown);
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, this.onRoomCountdown);
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, this.onRoomCountdown);
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, this.onRoomCountdownCancelled);
    this.socket.on(SOCKET_EVENTS.ROOM.LEFT, this.onRoomLeft);
    this.socket.on(SOCKET_EVENTS.SESSION.REPLACED, this.onSessionReplaced);
    this.socket.on(SOCKET_EVENTS.NETWORK.PONG, this.onNetworkPong);
    this.socket.io.on(SOCKET_EVENTS.TRANSPORT.RECONNECT_FAILED, this.onReconnectFailed);
    this.socket.on(SOCKET_EVENTS.TRANSPORT.CONNECT, this.onConnect);

    if (this.socket.connected) {
      this.joinConfiguredRoom();
    }
  }

  private joinConfiguredRoom(): void {
    if (!environment.devGameMode) {
      this.socket.emit(SOCKET_EVENTS.ROOM.GET_STATE);
      return;
    }
    const match = window.location.pathname.match(/^\/game\/([^/]+)/);
    this.socket.emit(SOCKET_EVENTS.GAME.JOIN, { roomId: decodeURIComponent(match?.[1] ?? 'salatest') });
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
    this.socket.off(SOCKET_EVENTS.GAME.JOINED, this.onGameJoined);
    this.socket.off(SOCKET_EVENTS.GAME.WATCH_JOINED, this.onWatchJoined);
    this.socket.off(SOCKET_EVENTS.GAME.STATE, this.onGameState);
    this.socket.off(SOCKET_EVENTS.GAME.PLAYER_DISCONNECTED, this.onPlayerDisconnected);
    this.socket.off(SOCKET_EVENTS.GAME.PLAYER_ELIMINATED, this.onPlayerEliminated);
    this.socket.off(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, this.onViewerCountChanged);
    this.socket.off(SOCKET_EVENTS.GAME.ENDED, this.onGameEnded);
    this.socket.off(SOCKET_EVENTS.OBSTACLE.DAMAGED, this.onObstacleDamaged);
    this.socket.off(SOCKET_EVENTS.OBSTACLE.DESTROYED, this.onObstacleDestroyed);
    this.socket.off(SOCKET_EVENTS.ROOM.STATE_UPDATED, this.onRoomCountdown);
    this.socket.off(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, this.onRoomCountdown);
    this.socket.off(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, this.onRoomCountdown);
    this.socket.off(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, this.onRoomCountdownCancelled);
    this.socket.off(SOCKET_EVENTS.ROOM.LEFT, this.onRoomLeft);
    this.socket.off(SOCKET_EVENTS.SESSION.REPLACED, this.onSessionReplaced);
    this.socket.off(SOCKET_EVENTS.NETWORK.PONG, this.onNetworkPong);
    this.socket.off(SOCKET_EVENTS.TRANSPORT.CONNECT, this.onConnect);
    this.socket.io.off(SOCKET_EVENTS.TRANSPORT.RECONNECT_FAILED, this.onReconnectFailed);
    this.setSpectatorMode(false);
    this.spectatorCamera.destroy();
    this.inputController.destroy();
    this.touchControls?.destroy();
    this.audioManager.destroy();
  }

  private resetRoundRenderState(): void {
    this.localPlayerEliminated = false;
    this.setSpectatorMode(false);
    this.cameras.main.startFollow(this.camTarget, true, 0.08, 0.08);
    this.snapshotInterpolator.clear();
    this.networkRttMs = null;
    this.viewerCount = 0;
    this.lastRttPingAt = 0;
    this.obstacleRenderer.reset();
    this.powerUpRenderer.reset();
    this.playerRenderer.reset();
    this.stateChangeTracker.reset();
    this.audioManager.resetMatchAudio();
    this.currentMap = null;
    this.hudRenderer.setWaitingCountdown(null);
    this.hudRenderer.resetNotifications();
  }

  private followLocalPlayer(state: GameState): void {
    const me = state.players.find(p => p.id === this.myPlayerId);
    if (me?.alive) {
      this.camTarget.setPosition(me.x, me.y);
    }
  }

  private setSpectatorMode(active: boolean): void {
    if (this.spectatorMode === active) return;
    this.spectatorMode = active;
    this.spectatedPlayerId = null;
    this.spectatorFreeCamera = false;
    this.spectatorCamera.setActive(active);
    window.dispatchEvent(new CustomEvent('tank-arena:spectator-mode', {
      detail: { active },
    }));
  }

  private updateSpectatorFollow(authoritativeState: GameState, renderState: GameState): void {
    if (this.spectatorFreeCamera) return;

    let target = authoritativeState.players.find(player => player.id === this.spectatedPlayerId);
    const needsNewTarget = !target?.alive;
    if (needsNewTarget) {
      target = findAliveSpectatorTarget(authoritativeState.players, this.spectatedPlayerId);
      this.spectatedPlayerId = target?.id ?? null;
    }

    if (!target) {
      this.cameras.main.stopFollow();
      return;
    }

    const renderedTarget = renderState.players.find(player => player.id === target?.id) ?? target;
    this.camTarget.setPosition(renderedTarget.x, renderedTarget.y);
    if (needsNewTarget) {
      this.cameras.main.startFollow(this.camTarget, true, 0.08, 0.08);
    }
  }

  private cycleSpectatorTarget(direction: SpectatorDirection): void {
    if (!this.spectatorMode || !this.gameState) return;
    const target = findAliveSpectatorTarget(
      this.gameState.players,
      this.spectatedPlayerId,
      direction,
    );
    if (!target) return;

    this.spectatorFreeCamera = false;
    this.spectatedPlayerId = target.id;
    this.camTarget.setPosition(target.x, target.y);
    this.cameras.main.startFollow(this.camTarget, true, 0.08, 0.08);
  }

  private getSpectatedPlayerName(): string | undefined {
    const target = this.gameState?.players.find(player => player.id === this.spectatedPlayerId);
    return target ? target.username ?? target.id.slice(0, 8) : undefined;
  }
}
