import Phaser from 'phaser';
import {
  GameSettings,
  GameSettingsChangedEvent,
  readStoredGameSettings,
} from '@game/config/game-settings.types';
import { GameState, PlayerPublicState } from '@game/contracts/game-state.types';

export type WeaponFireSound = 'standard' | 'triple_shot' | 'shotgun';
export type BulletImpactSound = 'spark' | 'wood' | 'rock' | 'steel' | 'mirror' | 'shield';

export type SoundPoint = {
  x: number;
  y: number;
};

const FIRE_SOUND_KEY: Record<WeaponFireSound, string> = {
  standard: 'weapon-standard-fire',
  triple_shot: 'weapon-triple-shot-fire',
  shotgun: 'weapon-shotgun-fire',
};

const FIRE_SOUND_VOLUME: Record<WeaponFireSound, number> = {
  standard: 0.42,
  triple_shot: 0.44,
  shotgun: 0.48,
};

const GRENADE_LAUNCH_VOLUME = 0.48;
const GRENADE_EXPLODE_VOLUME = 0.58;
const LASER_FIRE_VOLUME = 0.52;
const LASER_REFLECT_VOLUME = 0.44;
const POWERUP_PICKUP_VOLUME = 0.5;
const SHIELD_LAUNCH_VOLUME = 1;
const SHIELD_ACTIVE_VOLUME = 0.45;
const SHIELD_HIT_VOLUME = 1;
const DASH_VOLUME = 0.46;
const RELOAD_START_VOLUME = 0.36;
const RELOAD_COMPLETE_VOLUME = 0.42;
const BULLET_IMPACT_VOLUME: Record<BulletImpactSound, number> = {
  spark: 0.34,
  wood: 0.38,
  rock: 0.4,
  steel: 0.38,
  mirror: 0.42,
  shield: SHIELD_HIT_VOLUME,
};
const BULLET_IMPACT_KEY: Record<BulletImpactSound, string> = {
  spark: 'bullet-hit-spark',
  wood: 'bullet-hit-wood',
  rock: 'bullet-hit-rock',
  steel: 'bullet-hit-steel',
  mirror: 'bullet-mirror-ricochet',
  shield: 'shield-hit',
};
const MIN_FIRE_SOUND_GAP_MS = 45;
const FULL_VOLUME_DISTANCE = 340;
const MAX_AUDIBLE_DISTANCE = 920;
const MIN_AUDIBLE_VOLUME = 0.045;
const LOCAL_PLAYER_VOLUME_BOOST = 1.18;
const SFX_MIX_GAIN = 0.125;
const AMBIENCE_MIX_GAIN = 1;
const MUSIC_MIX_GAIN = 0.2;
const IOS_FOREGROUND_RECOVERY_DELAY_MS = 200;
const MUSIC_FADE_MS = 700;
const BATTLE_TRACK_STORAGE_KEY = 'tank-arena:last-battle-track';
const BATTLE_TRACK_KEYS = ['music-battle-one', 'music-battle-two'] as const;
const ARENA_AMBIENCE_KEY = 'arena-ambience';
const DANGER_ZONE_MUSIC_KEY = 'music-danger-zone';
const VICTORY_STINGER_KEY = 'result-victory-first';
const DEFEAT_STINGER_KEY = 'result-defeat';

type BattleTrackKey = (typeof BATTLE_TRACK_KEYS)[number];
type ManagedSound = Phaser.Sound.BaseSound & { volume: number };
type ManagedShieldSound = { sound: ManagedSound; spatialVolume: number };

type SafariAudioContext = AudioContext & { state: AudioContextState | 'interrupted' };
type AudioSessionNavigator = Navigator & {
  audioSession?: { type: 'auto' | 'ambient' | 'playback' | 'transient' | 'transient-solo' };
};

export class AudioManager {
  private lastFireSoundAt = 0;
  private foregroundRecoveryTimer?: number;
  private needsForegroundRecovery = false;
  private settings = readStoredGameSettings();
  private ambienceSound?: ManagedSound;
  private musicSound?: ManagedSound;
  private currentMusicKey?: string;
  private battleTrackKey?: BattleTrackKey;
  private previousStatus?: GameState['status'];
  private readonly shieldSounds = new Map<string, ManagedShieldSound>();
  private readonly onSettingsChanged = (event: Event): void => {
    this.applySettings((event as GameSettingsChangedEvent).detail);
  };

  private readonly unlockAudioFromGesture = (): void => {
    if (this.foregroundRecoveryTimer !== undefined) {
      window.clearTimeout(this.foregroundRecoveryTimer);
      this.foregroundRecoveryTimer = undefined;
    }
    void this.recoverAudioContext(this.needsForegroundRecovery);
  };
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.markAudioBackgrounded();
    else this.scheduleForegroundRecovery();
  };
  private readonly onPageHide = (): void => this.markAudioBackgrounded();
  private readonly onPageShow = (): void => this.scheduleForegroundRecovery();

  constructor(private readonly scene: Phaser.Scene) {
    this.applySettings(this.settings);
    this.configureAudioSession();
    window.addEventListener('tank-arena:settings-changed', this.onSettingsChanged);
    // Capture gestures globally: after restoring an iOS PWA, the first tap can
    // land on an Angular overlay and never reach Phaser's scene input plugin.
    window.addEventListener('pointerdown', this.unlockAudioFromGesture, { capture: true, passive: true });
    window.addEventListener('touchend', this.unlockAudioFromGesture, { capture: true, passive: true });
    window.addEventListener('keydown', this.unlockAudioFromGesture, true);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  destroy(): void {
    window.removeEventListener('tank-arena:settings-changed', this.onSettingsChanged);
    window.removeEventListener('pointerdown', this.unlockAudioFromGesture, true);
    window.removeEventListener('touchend', this.unlockAudioFromGesture, true);
    window.removeEventListener('keydown', this.unlockAudioFromGesture, true);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.foregroundRecoveryTimer !== undefined) {
      window.clearTimeout(this.foregroundRecoveryTimer);
    }
    this.stopManagedSound(this.ambienceSound);
    this.stopManagedSound(this.musicSound);
    this.stopAllShieldSounds();
    this.ambienceSound = undefined;
    this.musicSound = undefined;
    this.currentMusicKey = undefined;
  }

  syncMatchAudio(state: GameState, myPlayerId: string, joinedAsWatcher: boolean): void {
    const previousStatus = this.previousStatus;

    if (state.status === 'waiting') {
      this.ensureAmbience();
      this.stopMusic();
    } else if (state.status === 'playing') {
      this.ensureAmbience();
      const dangerZoneActive = Boolean(
        state.dangerZone && state.dangerZone.phase !== 'inactive',
      );
      this.transitionToMusic(
        dangerZoneActive ? DANGER_ZONE_MUSIC_KEY : this.getBattleTrackKey(),
      );
    } else if (previousStatus === 'playing') {
      this.fadeOutAmbience();
      this.stopMusic(true);
      if (!joinedAsWatcher && myPlayerId) {
        const isWinner = state.players.some(player => player.id === myPlayerId && player.alive);
        this.playUiSound(isWinner ? VICTORY_STINGER_KEY : DEFEAT_STINGER_KEY, 1);
      }
    }

    this.previousStatus = state.status;
  }

  resetMatchAudio(): void {
    this.stopManagedSound(this.ambienceSound);
    this.stopManagedSound(this.musicSound);
    this.stopAllShieldSounds();
    this.ambienceSound = undefined;
    this.musicSound = undefined;
    this.currentMusicKey = undefined;
    this.battleTrackKey = undefined;
    this.previousStatus = undefined;
  }

  private configureAudioSession(): void {
    const audioSession = (navigator as AudioSessionNavigator).audioSession;
    if (!audioSession) return;
    try {
      // Treat game SFX as intentional playback instead of ambient audio. On
      // supporting iOS versions this also avoids the hardware silent switch.
      audioSession.type = 'playback';
    } catch {
      // Experimental Safari API; WebAudio recovery still works without it.
    }
  }

  private markAudioBackgrounded(): void {
    this.needsForegroundRecovery = true;
    if (this.foregroundRecoveryTimer !== undefined) {
      window.clearTimeout(this.foregroundRecoveryTimer);
      this.foregroundRecoveryTimer = undefined;
    }
  }

  private scheduleForegroundRecovery(): void {
    if (!this.needsForegroundRecovery) return;
    if (this.foregroundRecoveryTimer !== undefined) {
      window.clearTimeout(this.foregroundRecoveryTimer);
    }
    // iOS 17/18 can report `running` while the audio device is silent. A
    // delayed suspend/resume cycle restores the device without audio artifacts.
    this.foregroundRecoveryTimer = window.setTimeout(() => {
      this.foregroundRecoveryTimer = undefined;
      void this.recoverAudioContext(true);
    }, IOS_FOREGROUND_RECOVERY_DELAY_MS);
  }

  private async recoverAudioContext(forceRestart: boolean): Promise<void> {
    const context = (this.scene.sound as { context?: SafariAudioContext }).context;
    if (!context || context.state === 'closed') {
      this.needsForegroundRecovery = false;
      return;
    }

    try {
      if (forceRestart && context.state === 'running') await context.suspend();
      if (context.state !== 'running') await context.resume();
      this.needsForegroundRecovery = context.state !== 'running';
    } catch {
      // Safari can reject recovery outside a user activation. Keep the flag so
      // the next captured pointer/touch/key gesture retries synchronously.
      this.needsForegroundRecovery = true;
    }
  }

  playGrenadeLaunch(origin: SoundPoint, listener: SoundPoint, isLocalPlayer: boolean): void {
    this.playSpatialSound(
      'weapon-grenade-launch',
      GRENADE_LAUNCH_VOLUME,
      origin,
      listener,
      isLocalPlayer,
      MIN_FIRE_SOUND_GAP_MS,
    );
  }

  playGrenadeExplosion(origin: SoundPoint, listener: SoundPoint): void {
    this.playSpatialSound(
      'weapon-grenade-explode',
      GRENADE_EXPLODE_VOLUME,
      origin,
      listener,
      false,
      0,
    );
  }

  playLaserFire(origin: SoundPoint, listener: SoundPoint, isLocalPlayer: boolean): void {
    this.playSpatialSound(
      'weapon-laser-fire',
      LASER_FIRE_VOLUME,
      origin,
      listener,
      isLocalPlayer,
      MIN_FIRE_SOUND_GAP_MS,
    );
  }

  playLaserReflect(origin: SoundPoint, listener: SoundPoint): void {
    this.playSpatialSound(
      'weapon-laser-reflect-mirror',
      LASER_REFLECT_VOLUME,
      origin,
      listener,
      false,
      0,
    );
  }

  playBulletImpact(type: BulletImpactSound, origin: SoundPoint, listener: SoundPoint): void {
    this.playSpatialSound(
      BULLET_IMPACT_KEY[type],
      BULLET_IMPACT_VOLUME[type],
      origin,
      listener,
      false,
      0,
    );
  }

  playPowerUpPickup(origin: SoundPoint, listener: SoundPoint): void {
    this.playSpatialSound(
      'powerup-pickup-weapon',
      POWERUP_PICKUP_VOLUME,
      origin,
      listener,
      false,
      0,
    );
  }

  playShieldLaunch(origin: SoundPoint, listener: SoundPoint, isLocalPlayer: boolean): void {
    this.playSpatialSound(
      'shield-launch',
      SHIELD_LAUNCH_VOLUME,
      origin,
      listener,
      isLocalPlayer,
      0,
    );
  }

  playShieldHit(origin: SoundPoint, listener: SoundPoint, isLocalPlayer: boolean): void {
    this.playSpatialSound(
      'shield-hit',
      SHIELD_HIT_VOLUME,
      origin,
      listener,
      isLocalPlayer,
      0,
    );
  }

  syncShieldLoops(
    players: readonly PlayerPublicState[],
    listener: SoundPoint | undefined,
    myPlayerId: string,
  ): void {
    if (!listener) {
      this.stopAllShieldSounds();
      return;
    }

    const activePlayerIds = new Set<string>();
    players.forEach(player => {
      if (!player.alive || !player.shielding) return;
      activePlayerIds.add(player.id);

      const spatialVolume = this.getDistanceVolume(
        SHIELD_ACTIVE_VOLUME,
        player,
        listener,
        player.id === myPlayerId,
      );
      let entry = this.shieldSounds.get(player.id);
      if (!entry && spatialVolume > 0 && this.scene.cache.audio.exists('shield-launching')) {
        const sound = this.scene.sound.add('shield-launching', {
          loop: true,
          volume: this.getSfxOutputVolume(spatialVolume),
        }) as ManagedSound;
        sound.play();
        entry = { sound, spatialVolume };
        this.shieldSounds.set(player.id, entry);
      }
      if (!entry) return;

      entry.spatialVolume = spatialVolume;
      entry.sound.volume = this.getSfxOutputVolume(spatialVolume);
    });

    this.shieldSounds.forEach((_entry, playerId) => {
      if (!activePlayerIds.has(playerId)) this.stopShieldLoop(playerId);
    });
  }

  stopShieldLoop(playerId: string): void {
    const entry = this.shieldSounds.get(playerId);
    if (!entry) return;
    this.stopManagedSound(entry.sound);
    this.shieldSounds.delete(playerId);
  }

  playDash(origin: SoundPoint, listener: SoundPoint, isLocalPlayer: boolean): void {
    this.playSpatialSound('player-dash', DASH_VOLUME, origin, listener, isLocalPlayer, 0);
  }

  playReloadStart(): void {
    this.playUiSound('weapon-reload-start', RELOAD_START_VOLUME);
  }

  playReloadComplete(): void {
    this.playUiSound('weapon-reload-complete', RELOAD_COMPLETE_VOLUME);
  }

  playWeaponFire(
    type: WeaponFireSound,
    origin: SoundPoint,
    listener: SoundPoint,
    isLocalPlayer: boolean,
  ): void {
    const now = this.scene.time.now;
    if (now - this.lastFireSoundAt < MIN_FIRE_SOUND_GAP_MS) return;

    const key = FIRE_SOUND_KEY[type];
    if (!this.scene.cache.audio.exists(key)) return;

    const volume = this.getDistanceVolume(FIRE_SOUND_VOLUME[type], origin, listener, isLocalPlayer);
    if (volume <= 0) return;

    this.lastFireSoundAt = now;
    this.playSound(key, volume);
  }

  private playSpatialSound(
    key: string,
    baseVolume: number,
    origin: SoundPoint,
    listener: SoundPoint,
    isLocalPlayer: boolean,
    minGapMs: number,
  ): void {
    const now = this.scene.time.now;
    if (now - this.lastFireSoundAt < minGapMs) return;
    if (!this.scene.cache.audio.exists(key)) return;

    const volume = this.getDistanceVolume(baseVolume, origin, listener, isLocalPlayer);
    if (volume <= 0) return;

    this.lastFireSoundAt = now;
    this.playSound(key, volume);
  }

  private playUiSound(key: string, volume: number): void {
    if (!this.scene.cache.audio.exists(key)) return;
    this.playSound(key, volume);
  }

  private playSound(key: string, volume: number): void {
    const soundVolume = this.getSfxOutputVolume(volume);
    if (soundVolume <= 0 || this.scene.sound.volume <= 0) return;
    this.scene.sound.play(key, { volume: soundVolume });
  }

  private applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.scene.sound.volume = Phaser.Math.Clamp(settings.masterVolume, 0, 1);
    if (this.ambienceSound) {
      this.scene.tweens?.killTweensOf(this.ambienceSound);
      this.ambienceSound.volume = settings.ambienceVolume * AMBIENCE_MIX_GAIN;
    }
    if (this.musicSound) {
      this.scene.tweens?.killTweensOf(this.musicSound);
      this.musicSound.volume = settings.musicVolume * MUSIC_MIX_GAIN;
    }
    this.shieldSounds.forEach(entry => {
      entry.sound.volume = this.getSfxOutputVolume(entry.spatialVolume);
    });
  }

  private ensureAmbience(): void {
    if (this.ambienceSound?.isPlaying) return;
    if (!this.scene.cache.audio.exists(ARENA_AMBIENCE_KEY)) return;

    this.stopManagedSound(this.ambienceSound);
    this.ambienceSound = this.scene.sound.add(ARENA_AMBIENCE_KEY, {
      loop: true,
      volume: this.settings.ambienceVolume * AMBIENCE_MIX_GAIN,
    }) as ManagedSound;
    this.ambienceSound.play();
  }

  private fadeOutAmbience(): void {
    const sound = this.ambienceSound;
    this.ambienceSound = undefined;
    this.fadeOutAndDestroy(sound);
  }

  private transitionToMusic(key: string): void {
    if (this.currentMusicKey === key && this.musicSound?.isPlaying) return;
    if (!this.scene.cache.audio.exists(key)) return;

    const previousSound = this.musicSound;
    const nextSound = this.scene.sound.add(key, { loop: true, volume: 0 }) as ManagedSound;
    this.musicSound = nextSound;
    this.currentMusicKey = key;
    nextSound.play();
    this.fadeTo(nextSound, this.settings.musicVolume * MUSIC_MIX_GAIN);
    this.fadeOutAndDestroy(previousSound);
  }

  private stopMusic(fade = false): void {
    const sound = this.musicSound;
    this.musicSound = undefined;
    this.currentMusicKey = undefined;
    if (fade) this.fadeOutAndDestroy(sound);
    else this.stopManagedSound(sound);
  }

  private getBattleTrackKey(): BattleTrackKey {
    if (this.battleTrackKey) return this.battleTrackKey;

    let previous: string | null = null;
    try {
      previous = window.sessionStorage.getItem(BATTLE_TRACK_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing; deterministic fallback is fine.
    }
    this.battleTrackKey = previous === BATTLE_TRACK_KEYS[0]
      ? BATTLE_TRACK_KEYS[1]
      : BATTLE_TRACK_KEYS[0];
    try {
      window.sessionStorage.setItem(BATTLE_TRACK_STORAGE_KEY, this.battleTrackKey);
    } catch {
      // Audio playback does not depend on persistence of the alternation.
    }
    return this.battleTrackKey;
  }

  private fadeTo(sound: ManagedSound, volume: number): void {
    this.scene.tweens.add({
      targets: sound,
      volume: Phaser.Math.Clamp(volume, 0, 1),
      duration: MUSIC_FADE_MS,
      ease: 'Linear',
    });
  }

  private fadeOutAndDestroy(sound?: ManagedSound): void {
    if (!sound) return;
    this.scene.tweens.killTweensOf(sound);
    this.scene.tweens.add({
      targets: sound,
      volume: 0,
      duration: MUSIC_FADE_MS,
      ease: 'Linear',
      onComplete: () => this.stopManagedSound(sound),
    });
  }

  private stopManagedSound(sound?: ManagedSound): void {
    if (!sound) return;
    this.scene.tweens?.killTweensOf(sound);
    sound.stop();
    sound.destroy();
  }

  private stopAllShieldSounds(): void {
    this.shieldSounds.forEach(entry => this.stopManagedSound(entry.sound));
    this.shieldSounds.clear();
  }

  private getSfxOutputVolume(volume: number): number {
    return Phaser.Math.Clamp(volume * this.settings.sfxVolume * SFX_MIX_GAIN, 0, 1);
  }

  private getDistanceVolume(
    baseVolume: number,
    origin: SoundPoint,
    listener: SoundPoint,
    isLocalPlayer: boolean,
  ): number {
    if (isLocalPlayer) {
      return Math.min(1, baseVolume * LOCAL_PLAYER_VOLUME_BOOST);
    }

    const distance = Phaser.Math.Distance.Between(origin.x, origin.y, listener.x, listener.y);
    if (distance <= FULL_VOLUME_DISTANCE) return baseVolume;
    if (distance >= MAX_AUDIBLE_DISTANCE) return 0;

    const fade =
      1 - (distance - FULL_VOLUME_DISTANCE) / (MAX_AUDIBLE_DISTANCE - FULL_VOLUME_DISTANCE);
    const easedFade = fade * fade;
    const volume = baseVolume * Math.max(MIN_AUDIBLE_VOLUME, easedFade);

    return Phaser.Math.Clamp(volume, 0, baseVolume);
  }
}
