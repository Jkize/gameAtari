import Phaser from 'phaser';
import { GameSettingsChangedEvent, readStoredGameSettings } from '../../game/game-settings.types';

export type WeaponFireSound = 'standard' | 'triple_shot' | 'shotgun';
export type BulletImpactSound = 'spark' | 'wood' | 'rock' | 'steel' | 'mirror';

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
const DASH_VOLUME = 0.46;
const RELOAD_START_VOLUME = 0.36;
const RELOAD_COMPLETE_VOLUME = 0.42;
const BULLET_IMPACT_VOLUME: Record<BulletImpactSound, number> = {
  spark: 0.34,
  wood: 0.38,
  rock: 0.4,
  steel: 0.38,
  mirror: 0.42,
};
const BULLET_IMPACT_KEY: Record<BulletImpactSound, string> = {
  spark: 'bullet-hit-spark',
  wood: 'bullet-hit-wood',
  rock: 'bullet-hit-rock',
  steel: 'bullet-hit-steel',
  mirror: 'bullet-mirror-ricochet',
};
const MIN_FIRE_SOUND_GAP_MS = 45;
const FULL_VOLUME_DISTANCE = 340;
const MAX_AUDIBLE_DISTANCE = 920;
const MIN_AUDIBLE_VOLUME = 0.045;
const LOCAL_PLAYER_VOLUME_BOOST = 1.18;

export class AudioManager {
  private lastFireSoundAt = 0;
  private readonly onSettingsChanged = (event: Event): void => {
    this.setVolume((event as GameSettingsChangedEvent).detail.sfxVolume);
  };

  constructor(private readonly scene: Phaser.Scene) {
    this.setVolume(readStoredGameSettings().sfxVolume);
    window.addEventListener('tank-arena:settings-changed', this.onSettingsChanged);
  }

  destroy(): void {
    window.removeEventListener('tank-arena:settings-changed', this.onSettingsChanged);
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
    const soundVolume = Phaser.Math.Clamp(volume, 0, 1);
    if (soundVolume <= 0 || this.scene.sound.volume <= 0) return;
    this.scene.sound.play(key, { volume: soundVolume });
  }

  private setVolume(volume: number): void {
    this.scene.sound.volume = Phaser.Math.Clamp(volume, 0, 1);
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
