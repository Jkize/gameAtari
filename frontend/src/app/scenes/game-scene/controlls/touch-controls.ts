import Phaser from 'phaser';
import { GAME_VIEW_HEIGHT } from '../../../game/viewport.config';
import type { PowerUpType } from '../../../types/game-state.types';
import {
  DASH_COOLDOWN_MS,
  FIRE_COOLDOWN_MS,
  POWER_UP_COLOR,
  RELOAD_COOLDOWN_MS,
  SHIELD_COOLDOWN_MS,
} from '../game-scene.constants';

const CONTROLS_DEPTH = 900;
const STICK_RADIUS = 64;
const THUMB_RADIUS = 26;
const MOVE_DEAD_ZONE = 8;
const AIM_DEAD_ZONE = 14;

const FIRE_RADIUS = 40;
const FIRE_HIT_RADIUS = 48;
const ACTION_RADIUS = 32;
// Touch targets must be at least 56 px wide, so hit radius stays >= 28.
const ACTION_HIT_RADIUS = 38;
// Distance from the aim-stick center to every action-button center.
const BUTTON_ARC_RADIUS = 126;
const SETTINGS_RADIUS = 18;
const SETTINGS_HIT_RADIUS = 26;
// Sits just below the HP panel (210x56, top-left corner of the HUD).
const SETTINGS_POSITION = { x: 30, y: 86 };

const NORMAL_ALPHA = 0.6;
const PRESSED_ALPHA = 0.95;

const STICK_BASE_COLOR = 0x83e5ef;
const STICK_THUMB_COLOR = 0xf2cf8f;
const BUTTON_FILL_COLOR = 0x2b1d10;
const BUTTON_BORDER_COLOR = 0x83e5ef;
const FIRE_BORDER_COLOR = 0xffd98a;
const ICON_COLOR = 0x83e5ef;
const DASH_COLOR = 0x00dfff;
const SHIELD_COLOR = 0x00ff88;

type ActionKey = 'dash' | 'shield' | 'reload';
type TutorialHighlightTarget = 'move' | 'aim' | 'fire' | 'dash' | 'shield';
export type TouchControlHighlight = TutorialHighlightTarget | 'move-dash' | null;

export interface TouchAbilityState {
  dashCooldownMs: number;
  shieldCooldownMs: number;
  shielding: boolean;
  weapon?: {
    reloadMs: number;
    fireCooldownMs: number;
    activePowerUpType?: PowerUpType;
  };
}

export interface TouchAbilityFeedback {
  active: boolean;
  ready: boolean;
  cooldownProgress: number;
}

export interface TouchWeaponFeedback {
  iconKey: string;
  color: number;
  ready: boolean;
  cooldownProgress: number;
}

const EMPTY_ABILITY_STATE: TouchAbilityState = {
  dashCooldownMs: 0,
  shieldCooldownMs: 0,
  shielding: false,
};

export function resolveTouchAbilityFeedback(
  key: 'dash' | 'shield',
  state: TouchAbilityState,
): TouchAbilityFeedback {
  const active = key === 'shield' && state.shielding;
  const cooldownMs = key === 'dash' ? state.dashCooldownMs : state.shieldCooldownMs;
  const cooldownTotalMs = key === 'dash' ? DASH_COOLDOWN_MS : SHIELD_COOLDOWN_MS;
  return {
    active,
    ready: !active && cooldownMs <= 0,
    cooldownProgress: active
      ? 0
      : Math.max(0, Math.min(1, cooldownMs / cooldownTotalMs)),
  };
}

export function resolveTouchWeaponFeedback(state: TouchAbilityState): TouchWeaponFeedback {
  const weapon = state.weapon;
  const reloadMs = weapon?.reloadMs ?? 0;
  const fireCooldownMs = weapon?.fireCooldownMs ?? 0;
  const cooldownMs = Math.max(reloadMs, fireCooldownMs);
  const cooldownTotalMs = reloadMs > 0 ? RELOAD_COOLDOWN_MS : FIRE_COOLDOWN_MS;
  const powerUpType = weapon?.activePowerUpType;
  return {
    iconKey: powerUpType ? `weapon-power_${powerUpType}` : 'hud-shot',
    color: powerUpType ? POWER_UP_COLOR[powerUpType] : FIRE_BORDER_COLOR,
    ready: cooldownMs <= 0,
    cooldownProgress: Math.max(0, Math.min(1, cooldownMs / cooldownTotalMs)),
  };
}

interface Placement {
  x: number;
  y: number;
}

interface TouchLayout {
  moveAnchor: Placement;
  aimAnchor: Placement;
  fire: Placement;
  actions: Record<ActionKey, Placement>;
}

// Left-handed support later only needs `mirrored: true` plumbed in here.
// Standard twin-stick layout: both sticks mirrored at the same offsets, and
// the action cluster arcs over the aim stick from top toward screen center:
// FIRE (top), then DASH, SHIELD, RELOAD.
function buildLayout(width: number, mirrored: boolean): TouchLayout {
  const rightX = (fromEdge: number): number => (mirrored ? fromEdge : width - fromEdge);
  const leftX = (fromEdge: number): number => (mirrored ? width - fromEdge : fromEdge);
  const stickY = GAME_VIEW_HEIGHT - 160;
  const aimAnchor: Placement = { x: rightX(170), y: stickY };
  const inward = mirrored ? -1 : 1;
  const arcAt = (deg: number): Placement => {
    const rad = Phaser.Math.DegToRad(deg);
    return {
      x: aimAnchor.x + Math.cos(rad) * BUTTON_ARC_RADIUS * inward,
      y: aimAnchor.y - Math.sin(rad) * BUTTON_ARC_RADIUS,
    };
  };
  return {
    moveAnchor: { x: leftX(170), y: stickY },
    aimAnchor,
    fire: arcAt(90),
    actions: {
      dash: arcAt(128),
      shield: arcAt(166),
      reload: arcAt(204),
    },
  };
}

interface StickState {
  pointerId: number | null;
  touchId: number | null;
  baseX: number;
  baseY: number;
  dx: number;
  dy: number;
}

interface ActionButton {
  key: ActionKey;
  x: number;
  y: number;
  icon: Phaser.GameObjects.Image | null;
  pressedPointerId: number | null;
}

export class TouchControls {
  static isSupported(game: Phaser.Game): boolean {
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    return game.device.input.touch && coarsePointer;
  }

  private gfx!: Phaser.GameObjects.Graphics;
  private fireIcon: Phaser.GameObjects.Image | null = null;
  private settingsIcon: Phaser.GameObjects.Text | null = null;
  private settingsPointerId: number | null = null;
  // Dragging while holding FIRE aims too (one-thumb fire-and-aim).
  private fireDragAngle: number | null = null;
  private layout!: TouchLayout;
  private visible = false;
  private lastAimAngle: number | null = null;
  private firePointerId: number | null = null;
  private readonly mirrored = false;
  private readonly pendingActions: Record<ActionKey, boolean> = {
    dash: false,
    shield: false,
    reload: false,
  };
  private readonly moveStick: StickState = {
    pointerId: null, touchId: null, baseX: 0, baseY: 0, dx: 0, dy: 0,
  };
  private readonly aimStick: StickState = {
    pointerId: null, touchId: null, baseX: 0, baseY: 0, dx: 0, dy: 0,
  };
  private readonly buttons: ActionButton[] = [];
  private fireTouchId: number | null = null;
  private tutorialHighlight: TouchControlHighlight = null;
  private abilityState: TouchAbilityState = EMPTY_ABILITY_STATE;
  private readonly reduceMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Phaser intentionally stops updating a touch Pointer once elementFromPoint
  // is outside the canvas. Track active touches at window level as a fallback
  // so wide-screen letterboxing does not interrupt a stick drag.
  private readonly onWindowTouchMove = (event: TouchEvent): void => {
    if (!this.visible) return;
    for (let index = 0; index < event.changedTouches.length; index++) {
      const touch = event.changedTouches[index];
      const x = this.scene.scale.transformX(touch.pageX);
      const y = this.scene.scale.transformY(touch.pageY);

      if (touch.identifier === this.moveStick.touchId) {
        this.updateStickVectorAt(this.moveStick, x, y);
      } else if (touch.identifier === this.aimStick.touchId) {
        this.updateStickVectorAt(this.aimStick, x, y);
        if (Math.hypot(this.aimStick.dx, this.aimStick.dy) > AIM_DEAD_ZONE) {
          this.lastAimAngle = Math.atan2(this.aimStick.dy, this.aimStick.dx);
        }
      } else if (touch.identifier === this.fireTouchId) {
        const dx = x - this.layout.fire.x;
        const dy = y - this.layout.fire.y;
        if (Math.hypot(dx, dy) > AIM_DEAD_ZONE) {
          this.lastAimAngle = Math.atan2(dy, dx);
          this.fireDragAngle = this.lastAimAngle;
        }
      }
    }
  };

  private readonly onWindowTouchEnd = (event: TouchEvent): void => {
    for (let index = 0; index < event.changedTouches.length; index++) {
      const touchId = event.changedTouches[index].identifier;
      if (touchId === this.moveStick.touchId) this.resetStick(this.moveStick);
      if (touchId === this.aimStick.touchId) this.resetStick(this.aimStick);
      if (touchId === this.fireTouchId) {
        this.firePointerId = null;
        this.fireTouchId = null;
        this.fireDragAngle = null;
      }
    }
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.visible || pointer.y > GAME_VIEW_HEIGHT) return;

    const distToSettings = Phaser.Math.Distance.Between(
      pointer.x, pointer.y, SETTINGS_POSITION.x, SETTINGS_POSITION.y,
    );
    if (distToSettings <= SETTINGS_HIT_RADIUS) {
      this.settingsPointerId = pointer.id;
      window.dispatchEvent(new CustomEvent('tank-arena:open-settings'));
      return;
    }

    const distToFire = Phaser.Math.Distance.Between(
      pointer.x, pointer.y, this.layout.fire.x, this.layout.fire.y,
    );
    if (distToFire <= FIRE_HIT_RADIUS) {
      if (this.firePointerId === null) {
        this.firePointerId = pointer.id;
        this.fireTouchId = pointer.wasTouch ? pointer.identifier : null;
      }
      return;
    }

    const button = this.buttons.find(
      btn => Phaser.Math.Distance.Between(pointer.x, pointer.y, btn.x, btn.y) <= ACTION_HIT_RADIUS,
    );
    if (button) {
      button.pressedPointerId = pointer.id;
      this.pendingActions[button.key] = true;
      return;
    }

    const stick = this.isMoveSide(pointer.x) ? this.moveStick : this.aimStick;
    if (stick.pointerId !== null) return;
    stick.pointerId = pointer.id;
    stick.touchId = pointer.wasTouch ? pointer.identifier : null;
    stick.baseX = pointer.x;
    stick.baseY = pointer.y;
    stick.dx = 0;
    stick.dy = 0;
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.moveStick.pointerId) {
      this.updateStickVector(this.moveStick, pointer);
    } else if (pointer.id === this.aimStick.pointerId) {
      this.updateStickVector(this.aimStick, pointer);
      if (Math.hypot(this.aimStick.dx, this.aimStick.dy) > AIM_DEAD_ZONE) {
        this.lastAimAngle = Math.atan2(this.aimStick.dy, this.aimStick.dx);
      }
    } else if (pointer.id === this.firePointerId) {
      const dx = pointer.x - this.layout.fire.x;
      const dy = pointer.y - this.layout.fire.y;
      if (Math.hypot(dx, dy) > AIM_DEAD_ZONE) {
        this.lastAimAngle = Math.atan2(dy, dx);
        this.fireDragAngle = this.lastAimAngle;
      }
    }
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.settingsPointerId) {
      this.settingsPointerId = null;
      return;
    }
    if (pointer.id === this.firePointerId) {
      this.firePointerId = null;
      this.fireTouchId = null;
      this.fireDragAngle = null;
      return;
    }
    if (pointer.id === this.moveStick.pointerId) {
      this.resetStick(this.moveStick);
      return;
    }
    if (pointer.id === this.aimStick.pointerId) {
      this.resetStick(this.aimStick);
      return;
    }
    for (const button of this.buttons) {
      if (button.pressedPointerId === pointer.id) button.pressedPointerId = null;
    }
  };

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.layout = buildLayout(this.scene.scale.width, this.mirrored);
    this.gfx = this.scene.add.graphics().setDepth(CONTROLS_DEPTH).setScrollFactor(0);

    this.fireIcon = this.createIcon('hud-shot', this.layout.fire, FIRE_RADIUS * 1.1);
    const actionKeys: ActionKey[] = ['dash', 'shield', 'reload'];
    for (const key of actionKeys) {
      const placement = this.layout.actions[key];
      const icon = key === 'reload'
        ? null // No reload asset exists; its icon is drawn as a vector in draw().
        : this.createIcon(`hud-${key}`, placement, ACTION_RADIUS * 1.35);
      this.buttons.push({ key, x: placement.x, y: placement.y, icon, pressedPointerId: null });
    }

    this.settingsIcon = this.scene.add.text(
      SETTINGS_POSITION.x, SETTINGS_POSITION.y, '⚙', {
        fontSize: '20px',
        color: '#83e5ef',
      },
    ).setOrigin(0.5).setDepth(CONTROLS_DEPTH + 1).setScrollFactor(0)
      .setAlpha(NORMAL_ALPHA).setVisible(false);

    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    window.addEventListener('touchmove', this.onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', this.onWindowTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onWindowTouchEnd, { passive: true });
  }

  update(status: string, enabled = true, abilityState: TouchAbilityState = EMPTY_ABILITY_STATE): void {
    this.abilityState = abilityState;
    this.setVisible((status === 'playing' || status === 'finished') && enabled);
    this.draw();
  }

  getMove(): { x: number; y: number } {
    const { pointerId, dx, dy } = this.moveStick;
    if (pointerId === null) return { x: 0, y: 0 };
    const len = Math.hypot(dx, dy);
    if (len < MOVE_DEAD_ZONE) return { x: 0, y: 0 };
    const scale = Math.min(len, STICK_RADIUS) / STICK_RADIUS / len;
    return { x: dx * scale, y: dy * scale };
  }

  getAimAngle(): number | null {
    return this.lastAimAngle;
  }

  isFiring(): boolean {
    return this.firePointerId !== null;
  }

  consumeAction(key: ActionKey): boolean {
    const pending = this.pendingActions[key];
    this.pendingActions[key] = false;
    return pending;
  }

  setTutorialHighlight(control: TouchControlHighlight): void {
    this.tutorialHighlight = control;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    window.removeEventListener('touchmove', this.onWindowTouchMove);
    window.removeEventListener('touchend', this.onWindowTouchEnd);
    window.removeEventListener('touchcancel', this.onWindowTouchEnd);
    this.gfx?.destroy();
    this.fireIcon?.destroy();
    this.fireIcon = null;
    this.settingsIcon?.destroy();
    this.settingsIcon = null;
    for (const button of this.buttons) button.icon?.destroy();
    this.buttons.length = 0;
  }

  private createIcon(
    textureKey: string,
    placement: Placement,
    size: number,
  ): Phaser.GameObjects.Image | null {
    if (!this.scene.textures.exists(textureKey)) return null;
    return this.scene.add.image(placement.x, placement.y, textureKey)
      .setDisplaySize(size, size)
      .setDepth(CONTROLS_DEPTH + 1)
      .setScrollFactor(0)
      .setAlpha(NORMAL_ALPHA)
      .setVisible(false);
  }

  private isMoveSide(x: number): boolean {
    const half = this.scene.scale.width / 2;
    return this.mirrored ? x > half : x < half;
  }

  private setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.fireIcon?.setVisible(visible);
    this.settingsIcon?.setVisible(visible);
    for (const button of this.buttons) button.icon?.setVisible(visible);
    if (!visible) {
      this.resetStick(this.moveStick);
      this.resetStick(this.aimStick);
      this.firePointerId = null;
      this.fireTouchId = null;
      this.fireDragAngle = null;
      this.settingsPointerId = null;
      this.pendingActions.dash = false;
      this.pendingActions.shield = false;
      this.pendingActions.reload = false;
      for (const button of this.buttons) button.pressedPointerId = null;
    }
  }

  private draw(): void {
    this.gfx.clear();
    if (!this.visible) return;

    this.drawStick(this.moveStick, this.layout.moveAnchor);
    this.drawStick(this.aimStick, this.layout.aimAnchor);
    this.drawFireButton();
    this.drawSettingsButton();

    for (const button of this.buttons) {
      const pressed = button.pressedPointerId !== null;
      const feedback = button.key === 'reload'
        ? null
        : resolveTouchAbilityFeedback(button.key, this.abilityState);
      const color = button.key === 'shield' ? SHIELD_COLOR : DASH_COLOR;
      const cooldown = (feedback?.cooldownProgress ?? 0) > 0;
      const alpha = pressed
        ? PRESSED_ALPHA
        : feedback?.active
          ? 1
          : cooldown
            ? 0.42
            : NORMAL_ALPHA;
      const radius = pressed ? ACTION_RADIUS * 1.12 : ACTION_RADIUS;
      this.gfx.fillStyle(BUTTON_FILL_COLOR, alpha * 0.75);
      this.gfx.fillCircle(button.x, button.y, radius);
      this.gfx.lineStyle(pressed ? 3 : 2, feedback ? color : BUTTON_BORDER_COLOR, alpha);
      this.gfx.strokeCircle(button.x, button.y, radius);

      if (feedback) this.drawAbilityFeedback(button, radius, color, feedback);

      button.icon?.setAlpha(alpha);
      if (button.key === 'reload') this.drawReloadIcon(button.x, button.y, alpha);
    }

    this.drawTutorialHighlight();
  }

  private drawAbilityFeedback(
    button: ActionButton,
    radius: number,
    color: number,
    feedback: TouchAbilityFeedback,
  ): void {
    if (feedback.cooldownProgress > 0) {
      this.gfx.fillStyle(0x000000, 0.64);
      this.drawCooldownWedge(button.x, button.y, radius - 3, feedback.cooldownProgress);
      this.gfx.lineStyle(3, color, 0.78);
      this.gfx.beginPath();
      this.gfx.arc(
        button.x,
        button.y,
        radius - 3,
        -Math.PI / 2 + Math.PI * 2 * feedback.cooldownProgress,
        Math.PI * 1.5,
        false,
      );
      this.gfx.strokePath();
      return;
    }

    const phase = this.reduceMotion ? 0.5 : (Math.sin(this.scene.time.now * 0.006) + 1) / 2;
    if (feedback.active) {
      this.gfx.fillStyle(color, 0.12 + phase * 0.12);
      this.gfx.fillCircle(button.x, button.y, radius * 0.72);
      this.gfx.lineStyle(3, color, 0.45 + phase * 0.4);
      this.gfx.strokeCircle(button.x, button.y, radius + 5 + phase * 3);
      this.gfx.lineStyle(1.5, color, 0.3 + phase * 0.3);
      this.gfx.strokeCircle(button.x, button.y, radius * 0.68);
    } else if (feedback.ready) {
      this.gfx.fillStyle(color, 0.08 + phase * 0.08);
      this.gfx.fillCircle(button.x, button.y, radius * 0.7);
      this.gfx.lineStyle(2, color, 0.18 + phase * 0.16);
      this.gfx.strokeCircle(button.x, button.y, radius + 3 + phase * 2);
    }
  }

  private drawCooldownWedge(cx: number, cy: number, radius: number, progress: number): void {
    const points = [new Phaser.Math.Vector2(cx, cy)];
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * progress;
    const steps = Math.max(4, Math.ceil(36 * progress));

    for (let index = 0; index <= steps; index++) {
      const angle = start + (end - start) * (index / steps);
      points.push(new Phaser.Math.Vector2(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
      ));
    }

    this.gfx.fillPoints(points, true);
  }

  private drawTutorialHighlight(): void {
    const control = this.tutorialHighlight;
    if (!control) return;
    const targets: TutorialHighlightTarget[] = control === 'move-dash'
      ? ['move', 'dash']
      : [control];
    targets.forEach(target => this.drawTutorialHighlightTarget(target));
  }

  private drawTutorialHighlightTarget(control: TutorialHighlightTarget): void {
    let placement: Placement;
    let baseRadius: number;
    if (control === 'move') {
      placement = this.layout.moveAnchor;
      baseRadius = STICK_RADIUS;
    } else if (control === 'aim') {
      placement = this.layout.aimAnchor;
      baseRadius = STICK_RADIUS;
    } else if (control === 'fire') {
      placement = this.layout.fire;
      baseRadius = FIRE_RADIUS;
      this.fireIcon?.setAlpha(0.82);
    } else {
      const button = this.buttons.find(candidate => candidate.key === control);
      if (!button) return;
      placement = button;
      baseRadius = ACTION_RADIUS;
      button.icon?.setAlpha(0.82);
    }

    const phase = this.reduceMotion ? 0.5 : (Math.sin(this.scene.time.now * 0.007) + 1) / 2;
    const cueColor = control === 'fire' ? FIRE_BORDER_COLOR : STICK_BASE_COLOR;
    const outerRadius = baseRadius + 10 + phase * 12;
    this.gfx.lineStyle(4, cueColor, 0.78 - phase * 0.24);
    this.gfx.strokeCircle(placement.x, placement.y, outerRadius);
    this.gfx.lineStyle(2, 0xffffff, 0.45 - phase * 0.16);
    this.gfx.strokeCircle(placement.x, placement.y, outerRadius + 8);

    if (control !== 'move' && control !== 'aim') return;
    const animationTime = this.reduceMotion ? 0 : this.scene.time.now * 0.0045;
    const offsetX = control === 'move'
      ? Math.sin(animationTime) * 30
      : Math.cos(animationTime) * 27;
    const offsetY = control === 'move'
      ? Math.cos(animationTime * 0.5) * 10
      : Math.sin(animationTime) * 27;
    this.gfx.lineStyle(3, cueColor, 0.52);
    this.gfx.lineBetween(placement.x, placement.y, placement.x + offsetX, placement.y + offsetY);
    this.gfx.fillStyle(STICK_THUMB_COLOR, 0.82);
    this.gfx.fillCircle(placement.x + offsetX, placement.y + offsetY, 12);
  }

  private drawFireButton(): void {
    const { x, y } = this.layout.fire;
    const pressed = this.firePointerId !== null;
    const feedback = resolveTouchWeaponFeedback(this.abilityState);
    const cooldown = feedback.cooldownProgress > 0;
    const alpha = cooldown ? 0.42 : (pressed ? PRESSED_ALPHA : NORMAL_ALPHA);
    const radius = pressed ? FIRE_RADIUS * 1.08 : FIRE_RADIUS;
    this.gfx.fillStyle(BUTTON_FILL_COLOR, alpha * 0.75);
    this.gfx.fillCircle(x, y, radius);
    this.gfx.lineStyle(pressed ? 4 : 3, feedback.color, alpha);
    this.gfx.strokeCircle(x, y, radius);

    if (cooldown) {
      this.gfx.fillStyle(0x000000, 0.64);
      this.drawCooldownWedge(x, y, radius - 4, feedback.cooldownProgress);
      this.gfx.lineStyle(3, feedback.color, 0.78);
      this.gfx.beginPath();
      this.gfx.arc(
        x,
        y,
        radius - 4,
        -Math.PI / 2 + Math.PI * 2 * feedback.cooldownProgress,
        Math.PI * 1.5,
        false,
      );
      this.gfx.strokePath();
    } else if (!pressed) {
      const phase = this.reduceMotion ? 0.5 : (Math.sin(this.scene.time.now * 0.005) + 1) / 2;
      this.gfx.fillStyle(feedback.color, 0.06 + phase * 0.07);
      this.gfx.fillCircle(x, y, radius * 0.68);
      this.gfx.lineStyle(2, feedback.color, 0.14 + phase * 0.14);
      this.gfx.strokeCircle(x, y, radius + 3 + phase * 2);
    }

    if (this.fireDragAngle !== null) {
      // Aim-direction marker while fire-dragging.
      const markerX = x + Math.cos(this.fireDragAngle) * (radius + 9);
      const markerY = y + Math.sin(this.fireDragAngle) * (radius + 9);
      this.gfx.fillStyle(feedback.color, PRESSED_ALPHA);
      this.gfx.fillCircle(markerX, markerY, 5);
    }
    if (this.fireIcon) {
      const iconKey = this.scene.textures.exists(feedback.iconKey) ? feedback.iconKey : 'hud-shot';
      this.fireIcon.setTexture(iconKey);
      this.fireIcon.setAlpha(alpha);
    } else {
      // Fallback crosshair when the hud-shot texture is unavailable.
      this.gfx.lineStyle(2, ICON_COLOR, alpha);
      this.gfx.strokeCircle(x, y, 14);
      this.gfx.lineBetween(x - 22, y, x - 10, y);
      this.gfx.lineBetween(x + 10, y, x + 22, y);
      this.gfx.lineBetween(x, y - 22, x, y - 10);
      this.gfx.lineBetween(x, y + 10, x, y + 22);
      this.gfx.fillStyle(ICON_COLOR, alpha);
      this.gfx.fillCircle(x, y, 2.5);
    }
  }

  private drawSettingsButton(): void {
    const pressed = this.settingsPointerId !== null;
    const alpha = pressed ? PRESSED_ALPHA : NORMAL_ALPHA;
    this.gfx.fillStyle(BUTTON_FILL_COLOR, alpha * 0.75);
    this.gfx.fillCircle(SETTINGS_POSITION.x, SETTINGS_POSITION.y, SETTINGS_RADIUS);
    this.gfx.lineStyle(2, BUTTON_BORDER_COLOR, alpha);
    this.gfx.strokeCircle(SETTINGS_POSITION.x, SETTINGS_POSITION.y, SETTINGS_RADIUS);
    this.settingsIcon?.setAlpha(alpha);
  }

  private drawReloadIcon(x: number, y: number, alpha: number): void {
    const radius = 10;
    const gapStart = -Math.PI / 2;
    this.gfx.lineStyle(2.5, ICON_COLOR, alpha);
    this.gfx.beginPath();
    this.gfx.arc(x, y, radius, gapStart + 0.6, gapStart + Math.PI * 2 - 0.35);
    this.gfx.strokePath();
    const tipAngle = gapStart + 0.6;
    const tipX = x + Math.cos(tipAngle) * radius;
    const tipY = y + Math.sin(tipAngle) * radius;
    this.gfx.fillStyle(ICON_COLOR, alpha);
    this.gfx.fillTriangle(tipX - 5, tipY - 3, tipX + 4, tipY - 6, tipX + 1, tipY + 5);
  }

  private drawStick(stick: StickState, anchor: Placement): void {
    const engaged = stick.pointerId !== null;
    const baseX = engaged ? stick.baseX : anchor.x;
    const baseY = engaged ? stick.baseY : anchor.y;

    this.gfx.lineStyle(2, STICK_BASE_COLOR, engaged ? 0.6 : 0.25);
    this.gfx.strokeCircle(baseX, baseY, STICK_RADIUS);

    const len = Math.hypot(stick.dx, stick.dy);
    const clamp = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    const thumbX = baseX + stick.dx * clamp;
    const thumbY = baseY + stick.dy * clamp;
    this.gfx.fillStyle(STICK_THUMB_COLOR, engaged ? 0.55 : 0.2);
    this.gfx.fillCircle(thumbX, thumbY, THUMB_RADIUS);
  }

  private updateStickVector(stick: StickState, pointer: Phaser.Input.Pointer): void {
    this.updateStickVectorAt(stick, pointer.x, pointer.y);
  }

  private updateStickVectorAt(stick: StickState, x: number, y: number): void {
    stick.dx = x - stick.baseX;
    stick.dy = y - stick.baseY;
  }

  private resetStick(stick: StickState): void {
    stick.pointerId = null;
    stick.touchId = null;
    stick.dx = 0;
    stick.dy = 0;
  }
}
