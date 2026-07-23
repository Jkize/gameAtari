import Phaser from 'phaser';
import { environment } from '@env/environment';

export type GameplayKeys = Record<
  'up' | 'down' | 'left' | 'right' | 'dash' | 'reload' | 'shield' | 'start',
  Phaser.Input.Keyboard.Key
>;

export class PhaserKeyboardGuard {
  private keys!: GameplayKeys;
  private inputBlocked = false;
  private destroyed = false;
  private recoveryLogged = false;

  private readonly onSettingsMenu = (event: Event): void => {
    this.inputBlocked = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    if (this.inputBlocked) {
      keyboard.resetKeys();
      keyboard.enabled = false;
      this.onSuspended();
    } else {
      this.ensureReady();
    }
  };

  private readonly onPhaserInputSuspended = (): void => {
    this.scene.input.keyboard?.resetKeys();
    this.onSuspended();
  };

  private readonly onPhaserInputResumed = (): void => {
    if (this.inputBlocked) return;
    this.ensureReady();
  };

  private readonly onNativeKeyboardEvent = (event: KeyboardEvent): void => {
    if (this.inputBlocked || event.isComposing || this.isEditableTarget(event.target)) return;
    const key = this.getGameplayKey(event.code);
    if (!key) return;

    const expectedDown = event.type === 'keydown';
    // Run after every listener for this DOM event. This remains correct even
    // if Phaser restarted its listeners and they now run after this watchdog.
    queueMicrotask(() => this.reconcileEvent(event, key, expectedDown));
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSuspended: () => void,
  ) {}

  get blocked(): boolean {
    return this.inputBlocked;
  }

  setup(): GameplayKeys {
    const keyboard = this.scene.input.keyboard!;
    this.ensureReady();
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      reload: Phaser.Input.Keyboard.KeyCodes.R,
      shield: Phaser.Input.Keyboard.KeyCodes.Q,
      start: Phaser.Input.Keyboard.KeyCodes.ENTER,
    }, true, false) as GameplayKeys;

    window.addEventListener('tank-arena:settings-menu', this.onSettingsMenu);
    window.addEventListener('keydown', this.onNativeKeyboardEvent);
    window.addEventListener('keyup', this.onNativeKeyboardEvent);
    this.scene.game.events.on(Phaser.Core.Events.BLUR, this.onPhaserInputSuspended);
    this.scene.game.events.on(Phaser.Core.Events.FOCUS, this.onPhaserInputResumed);
    this.scene.events.on(Phaser.Scenes.Events.PAUSE, this.onPhaserInputSuspended);
    this.scene.events.on(Phaser.Scenes.Events.SLEEP, this.onPhaserInputSuspended);
    this.scene.events.on(Phaser.Scenes.Events.RESUME, this.onPhaserInputResumed);
    this.scene.events.on(Phaser.Scenes.Events.WAKE, this.onPhaserInputResumed);
    return this.keys;
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('tank-arena:settings-menu', this.onSettingsMenu);
    window.removeEventListener('keydown', this.onNativeKeyboardEvent);
    window.removeEventListener('keyup', this.onNativeKeyboardEvent);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onPhaserInputSuspended);
    this.scene.game.events.off(Phaser.Core.Events.FOCUS, this.onPhaserInputResumed);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.onPhaserInputSuspended);
    this.scene.events.off(Phaser.Scenes.Events.SLEEP, this.onPhaserInputSuspended);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.onPhaserInputResumed);
    this.scene.events.off(Phaser.Scenes.Events.WAKE, this.onPhaserInputResumed);

    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      keyboard.resetKeys();
      keyboard.enabled = true;
    }
  }

  private ensureReady(resetKeys = true): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    if (resetKeys) keyboard.resetKeys();
    keyboard.enabled = true;
    if (!keyboard.manager.enabled) keyboard.manager.startListeners();
  }

  private reconcileEvent(
    event: KeyboardEvent,
    key: Phaser.Input.Keyboard.Key,
    expectedDown: boolean,
  ): void {
    if (
      this.destroyed ||
      this.inputBlocked ||
      !this.scene.sys.canInput() ||
      key.isDown === expectedDown
    ) return;

    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    this.reportRecovery(event, keyboard);

    // Phaser remains the sole owner of key state and gameplay input. Repair
    // its listener and replay only the event that Phaser demonstrably missed.
    this.ensureReady(false);
    const phaserEvent = event.defaultPrevented
      ? this.cloneUncancelledEvent(event)
      : event;
    if (expectedDown) {
      keyboard.manager.onKeyDown(phaserEvent);
    } else {
      keyboard.manager.onKeyUp(phaserEvent);
    }
  }

  private reportRecovery(
    event: KeyboardEvent,
    keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
  ): void {
    if (!environment.devGameMode || this.recoveryLogged) return;
    this.recoveryLogged = true;
    console.warn('[PhaserKeyboardGuard] Recovering missed Phaser keyboard event', {
      code: event.code,
      type: event.type,
      defaultPrevented: event.defaultPrevented,
      pluginEnabled: keyboard.enabled,
      managerEnabled: keyboard.manager.enabled,
      sceneCanInput: this.scene.sys.canInput(),
    });
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
  }

  private getGameplayKey(code: string): Phaser.Input.Keyboard.Key | null {
    if (!this.keys) return null;
    switch (code) {
      case 'KeyW': return this.keys.up;
      case 'KeyS': return this.keys.down;
      case 'KeyA': return this.keys.left;
      case 'KeyD': return this.keys.right;
      case 'ShiftLeft':
      case 'ShiftRight': return this.keys.dash;
      case 'KeyR': return this.keys.reload;
      case 'KeyQ': return this.keys.shield;
      case 'Enter':
      case 'NumpadEnter': return this.keys.start;
      default: return null;
    }
  }

  private cloneUncancelledEvent(event: KeyboardEvent): KeyboardEvent {
    const clone = new KeyboardEvent(event.type, {
      key: event.key,
      code: event.code,
      location: event.location,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
      isComposing: event.isComposing,
      bubbles: event.bubbles,
      cancelable: event.cancelable,
    });
    // Phaser's KeyboardManager still indexes keys by the legacy numeric code.
    Object.defineProperty(clone, 'keyCode', { value: event.keyCode });
    Object.defineProperty(clone, 'which', { value: event.which });
    return clone;
  }
}
