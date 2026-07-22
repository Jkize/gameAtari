import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from '../shared/language-switcher.component';
import { ThemeService } from '../shared/theme.service';
import { USE_PLAYER_COLOR_FOR_TRACK_TREAD_SHADOW } from '../shared/rendering/tank-track-rendering.config';

interface ShowcaseTank {
  color: string;
  rotate: number;
  offsetY: number;
  tracksHtml: SafeHtml;
  bodyHtml: SafeHtml;
  turretHtml: SafeHtml;
  weaponHtml?: SafeHtml;
}

// Same recolor idea as `shared/rendering/svg-texture-utils.ts`
// (applyTankColor): the SVG's own <style> block declares
// `--tank-color: #db3a2c;` once, and every other shade derives from it via
// color-mix(). That util patches the color and rasterizes the result as a
// standalone image for Phaser, so `:root` there is that image's own root.
//
// Here the SVG is inlined directly into the live DOM instead (required so
// this component's CSS can size/position it), and `:root` inside an inlined
// <style> tag always resolves to the real document root (<html>) — NOT the
// local <svg> element. Left unscoped, every instance's `:root {}` rule would
// fight over the same global custom properties, and only the last one in
// DOM order would render correctly (confirmed: all 4 showcase tanks were
// rendering as the same color). So each copy also gets a unique id on its
// <svg> root, and the rule is rewritten from `:root` to `#that-id` before
// the color is patched in, scoping the whole custom-property chain to that
// one instance.
const TANK_COLOR_PATTERN = /--tank-color:\s*#[0-9a-fA-F]{3,8}\s*;/;
const TRACK_TREAD_SHADOW_PATTERN = /--track-tread-shadow:\s*#[0-9a-fA-F]{3,8}\s*;/;
const SVG_ROOT_TAG_PATTERN = /<svg\s/;
const STYLE_ROOT_SELECTOR_PATTERN = /:root\s*\{/;

function scopeAndColorTank(svg: string, hexColor: string, instanceId: string): string {
  const scoped = svg
    .replace(SVG_ROOT_TAG_PATTERN, `<svg id="${instanceId}" `)
    .replace(STYLE_ROOT_SELECTOR_PATTERN, `#${instanceId} {`);
  return scoped.replace(TANK_COLOR_PATTERN, `--tank-color: ${hexColor};`);
}

function scopeAndColorTracks(svg: string, hexColor: string, instanceId: string): string {
  const scoped = svg
    .replace(SVG_ROOT_TAG_PATTERN, `<svg id="${instanceId}" `)
    .replace(STYLE_ROOT_SELECTOR_PATTERN, `#${instanceId} {`);
  return USE_PLAYER_COLOR_FOR_TRACK_TREAD_SHADOW
    ? scoped.replace(TRACK_TREAD_SHADOW_PATTERN, `--track-tread-shadow: ${hexColor};`)
    : scoped;
}

const TANK_TRACKS_ASSET = 'assets/tanks/track/tank_tracks_0.svg';
const TANK_BODY_ASSET = 'assets/tanks/tank_body_template.svg';
const TANK_TURRET_ASSET = 'assets/tanks/tank_pistol_template.svg';

// Matches backend/src/games/tanks/types/power-up.types.ts PowerUpType, and
// the same overlay templates the live game applies over the turret via
// shared/rendering/weapon-svg-textures.ts (ensureWeaponOverlayTexture) —
// same viewBox (0 0 512 712), same --tank-color recolor pattern, so they
// line up over .tank-art-turret without any extra positioning.
const WEAPON_SHOWCASE_TYPES = ['triple_shot', 'shotgun', 'grenade', 'laser'] as const;
type WeaponShowcaseType = (typeof WEAPON_SHOWCASE_TYPES)[number];

const WEAPON_OVERLAY_ASSETS: Record<WeaponShowcaseType, string> = {
  triple_shot: 'assets/weapons/triple_shot_overlay_template.svg',
  shotgun: 'assets/weapons/shotgun_overlay_template.svg',
  grenade: 'assets/weapons/grenade_overlay_template.svg',
  laser: 'assets/weapons/laser_overlay_template.svg',
};

// Subset of PLAYER_COLORS (backend/src/games/tanks/config/player.config.ts),
// skipping the two near-white entries (#ecf0f1, #95a5a6) that don't read
// well against the page background, and grouped by hue so a single render
// never picks two colors from the same family (e.g. #9b59b6 and #8e44ad are
// both "purple" and used to land side by side in the same lineup).
const TANK_SHOWCASE_COLOR_FAMILIES: readonly (readonly string[])[] = [
  ['#ff3b30', '#c0392b'], // red
  ['#e67e22'], // orange
  ['#f1c40f'], // yellow
  ['#00ff88', '#2ecc71', '#1abc9c'], // green
  ['#3498db', '#00d9ff'], // blue / cyan
  ['#9b59b6', '#8e44ad'], // purple
  ['#ff66cc', '#ff0066'], // pink / magenta
];

// Alternating rotation/vertical offset per slot so the lineup reads as a
// dynamic showcase rather than five identical robots in a grid.
const TANK_SHOWCASE_ROTATIONS = [-6, 3, -3, 6, -8];
const TANK_SHOWCASE_OFFSETS = [0, 14, -10, 18, 4];

// One slot is the plain tank (`null`) and the rest carry one of the four
// weapons — shuffled together so the plain tank's position is random too.
const TANK_SHOWCASE_LOADOUTS = [null, ...WEAPON_SHOWCASE_TYPES] as const;

function shuffle<T>(items: readonly T[]): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

// Picks `count` distinct families (never two colors from the same family in
// one render) and one random shade within each chosen family.
function pickRandomColors(count: number): string[] {
  return shuffle(TANK_SHOWCASE_COLOR_FAMILIES)
    .slice(0, count)
    .map((family) => family[Math.floor(Math.random() * family.length)]);
}

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, TranslocoPipe, LanguageSwitcherComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
})
export class LandingPageComponent implements OnInit {
  readonly theme = inject(ThemeService);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  // Full-color tank showcase, randomized on every load. Populated after an
  // async fetch, so this must be a signal (zoneless app).
  readonly showcaseTanks = signal<ShowcaseTank[]>([]);

  toggleTheme(): void {
    this.theme.toggle();
  }

  ngOnInit(): void {
    void this.loadShowcaseTanks();
  }

  private async loadShowcaseTanks(): Promise<void> {
    // Each template is fetched once and reused across every colored instance.
    const [tracksRaw, bodyRaw, turretRaw, ...weaponRaws] = await Promise.all([
      firstValueFrom(this.http.get(TANK_TRACKS_ASSET, { responseType: 'text' })),
      firstValueFrom(this.http.get(TANK_BODY_ASSET, { responseType: 'text' })),
      firstValueFrom(this.http.get(TANK_TURRET_ASSET, { responseType: 'text' })),
      ...WEAPON_SHOWCASE_TYPES.map((type) =>
        firstValueFrom(this.http.get(WEAPON_OVERLAY_ASSETS[type], { responseType: 'text' })),
      ),
    ]);
    const weaponTemplates = Object.fromEntries(
      WEAPON_SHOWCASE_TYPES.map((type, index) => [type, weaponRaws[index]]),
    ) as Record<WeaponShowcaseType, string>;

    // One tank stays plain and the other four each get a different weapon —
    // both the colors and which slot is plain are re-shuffled every load.
    const colors = pickRandomColors(5);
    const loadouts = shuffle(TANK_SHOWCASE_LOADOUTS);

    const tanks: ShowcaseTank[] = colors.map((color, index) => {
      const tracksId = `landing-tank-tracks-${index}`;
      const bodyId = `landing-tank-body-${index}`;
      const turretId = `landing-tank-turret-${index}`;
      // Order matters: unique-id the shared <defs> ids (trackBase, etc.)
      // BEFORE adding the root svg's own id and rewriting `:root`, otherwise
      // withUniqueIds would also rename that fresh root id and desync it
      // from the `#instanceId { ... }` selector scopeAndColorTank just wrote.
      const tracks = scopeAndColorTracks(
        this.withUniqueIds(tracksRaw, tracksId),
        color,
        tracksId,
      );
      const body = scopeAndColorTank(this.withUniqueIds(bodyRaw, bodyId), color, bodyId);
      const turret = scopeAndColorTank(this.withUniqueIds(turretRaw, turretId), color, turretId);

      const weaponType = loadouts[index];
      const weaponHtml = weaponType
        ? this.sanitizer.bypassSecurityTrustHtml(
            scopeAndColorTank(
              this.withUniqueIds(weaponTemplates[weaponType], `landing-tank-weapon-${index}`),
              color,
              `landing-tank-weapon-${index}`,
            ),
          )
        : undefined;

      return {
        color,
        rotate: TANK_SHOWCASE_ROTATIONS[index] ?? 0,
        offsetY: TANK_SHOWCASE_OFFSETS[index] ?? 0,
        tracksHtml: this.sanitizer.bypassSecurityTrustHtml(tracks),
        bodyHtml: this.sanitizer.bypassSecurityTrustHtml(body),
        turretHtml: this.sanitizer.bypassSecurityTrustHtml(turret),
        weaponHtml,
      };
    });

    this.showcaseTanks.set(tanks);
  }

  // Rewrites every `id="x"` / `#x` reference with a unique suffix so multiple
  // inlined copies of the same SVG (shared <defs> ids like `trackGrad`) don't
  // collide once they're all literal descendants of the same HTML document.
  private withUniqueIds(svg: string, suffix: string): string {
    const ids = Array.from(svg.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
    return ids.reduce((out, id) => {
      const idAttr = new RegExp(`id="${id}"`, 'g');
      const idRef = new RegExp(`#${id}(?=["\\)])`, 'g');
      return out.replace(idAttr, `id="${id}-${suffix}"`).replace(idRef, `#${id}-${suffix}`);
    }, svg);
  }
}
