export interface MirrorPanelSurface {
  fillRect(x: number, y: number, width: number, height: number, color: number, alpha: number): void;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number, color: number, alpha: number): void;
  strokeLine(x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number): void;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number, lineWidth: number, color: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number, color: number, alpha: number): void;
}

export interface MirrorPanelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function drawMirrorPanel(surface: MirrorPanelSurface, panel: MirrorPanelRect): void {
  const rng = seededRandom(hashString(panel.id));
  const x = panel.x - panel.width / 2;
  const y = panel.y - panel.height / 2;
  const w = panel.width;
  const h = panel.height;
  const horizontal = w >= h;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  const frame = Math.max(2.5, Math.min(8, shortSide * 0.22));
  const cap = Math.max(frame * 1.4, Math.min(longSide * 0.16, shortSide * 1.15));
  const glassX = x + frame;
  const glassY = y + frame;
  const glassW = Math.max(1, w - frame * 2);
  const glassH = Math.max(1, h - frame * 2);
  const segmentCount = Math.max(2, Math.floor(longSide / 42));

  surface.fillRoundedRect(x + frame * 0.9, y + frame * 1.2, w + frame * 1.4, h + frame * 1.4, frame * 1.4, 0x000000, 0.42);
  surface.fillRoundedRect(x, y, w, h, frame * 1.5, 0x011820, 1);
  surface.fillRoundedRect(x + frame * 0.45, y + frame * 0.45, Math.max(1, w - frame * 0.9), Math.max(1, h - frame * 0.9), frame, 0x063242, 1);
  surface.fillRoundedRect(x + frame, y + frame, Math.max(1, w - frame * 2), Math.max(1, h - frame * 2), frame * 0.7, 0x001923, 1);

  surface.fillRect(glassX, glassY, glassW, glassH, 0x0799b5, 0.74);
  surface.fillRect(glassX, glassY, horizontal ? glassW : glassW * 0.45, horizontal ? glassH * 0.38 : glassH, 0xdfffff, 0.32);
  surface.fillRect(
    horizontal ? glassX : glassX + glassW * 0.58,
    horizontal ? glassY + glassH * 0.62 : glassY,
    horizontal ? glassW : glassW * 0.42,
    horizontal ? glassH * 0.38 : glassH,
    0x001826,
    0.42,
  );

  if (horizontal) {
    surface.fillRect(x + frame, y + frame, cap, h - frame * 2, 0x00eaff, 0.54);
    surface.fillRect(x + w - cap - frame, y + frame, cap, h - frame * 2, 0x00eaff, 0.54);
    surface.fillRect(x + cap, y + frame, frame, h - frame * 2, 0x092d3a, 0.85);
    surface.fillRect(x + w - cap - frame, y + frame, frame, h - frame * 2, 0x092d3a, 0.85);
  } else {
    surface.fillRect(x + frame, y + frame, w - frame * 2, cap, 0x00eaff, 0.54);
    surface.fillRect(x + frame, y + h - cap - frame, w - frame * 2, cap, 0x00eaff, 0.54);
    surface.fillRect(x + frame, y + cap, w - frame * 2, frame, 0x092d3a, 0.85);
    surface.fillRect(x + frame, y + h - cap - frame, w - frame * 2, frame, 0x092d3a, 0.85);
  }

  for (let i = 1; i < segmentCount; i++) {
    const t = i / segmentCount;
    if (horizontal) {
      const sx = glassX + glassW * t + (rng() - 0.5) * 1.5;
      surface.strokeLine(sx, glassY + frame * 0.25, sx, glassY + glassH - frame * 0.25, 2, 0x00f7ff, 0.55);
    } else {
      const sy = glassY + glassH * t + (rng() - 0.5) * 1.5;
      surface.strokeLine(glassX + frame * 0.25, sy, glassX + glassW - frame * 0.25, sy, 2, 0x00f7ff, 0.55);
    }
  }

  const brightWidth = Math.max(1.5, shortSide * 0.1);
  if (horizontal) {
    surface.strokeLine(glassX + glassW * 0.06, glassY + glassH * 0.25, glassX + glassW * 0.30, glassY + glassH * 0.25, brightWidth, 0xffffff, 0.58);
    surface.strokeLine(glassX + glassW * 0.43, glassY + glassH * 0.50, glassX + glassW * 0.72, glassY + glassH * 0.50, brightWidth, 0xffffff, 0.58);
    surface.strokeLine(glassX + glassW * 0.15, glassY + glassH * 0.72, glassX + glassW * 0.92, glassY + glassH * 0.72, Math.max(1, shortSide * 0.07), 0x8ffcff, 0.42);
    surface.strokeLine(glassX + glassW * 0.03, glassY + glassH * 0.08, glassX + glassW * 0.22, glassY + glassH * 0.88, Math.max(1, shortSide * 0.08), 0xffffff, 0.2);
    surface.strokeLine(glassX + glassW * 0.48, glassY + glassH * 0.08, glassX + glassW * 0.70, glassY + glassH * 0.88, Math.max(1, shortSide * 0.08), 0xffffff, 0.2);
  } else {
    surface.strokeLine(glassX + glassW * 0.25, glassY + glassH * 0.06, glassX + glassW * 0.25, glassY + glassH * 0.30, brightWidth, 0xffffff, 0.58);
    surface.strokeLine(glassX + glassW * 0.50, glassY + glassH * 0.43, glassX + glassW * 0.50, glassY + glassH * 0.72, brightWidth, 0xffffff, 0.58);
    surface.strokeLine(glassX + glassW * 0.72, glassY + glassH * 0.15, glassX + glassW * 0.72, glassY + glassH * 0.92, Math.max(1, shortSide * 0.07), 0x8ffcff, 0.42);
    surface.strokeLine(glassX + glassW * 0.08, glassY + glassH * 0.03, glassX + glassW * 0.88, glassY + glassH * 0.22, Math.max(1, shortSide * 0.08), 0xffffff, 0.2);
    surface.strokeLine(glassX + glassW * 0.08, glassY + glassH * 0.48, glassX + glassW * 0.88, glassY + glassH * 0.70, Math.max(1, shortSide * 0.08), 0xffffff, 0.2);
  }

  if (horizontal) {
    surface.fillRect(x - frame * 0.35, y + frame * 0.3, frame * 0.75, h - frame * 0.6, 0x00eaff, 0.9);
    surface.fillRect(x + w - frame * 0.4, y + frame * 0.3, frame * 0.75, h - frame * 0.6, 0x00eaff, 0.9);
  } else {
    surface.fillRect(x + frame * 0.3, y - frame * 0.35, w - frame * 0.6, frame * 0.75, 0x00eaff, 0.9);
    surface.fillRect(x + frame * 0.3, y + h - frame * 0.4, w - frame * 0.6, frame * 0.75, 0x00eaff, 0.9);
  }

  const boltRadius = Math.max(1.8, Math.min(4.2, shortSide * 0.14));
  const boltInset = Math.max(frame * 1.8, boltRadius * 2.2);
  const boltPoints = horizontal
    ? [
        [x + boltInset, y + h * 0.34],
        [x + boltInset, y + h * 0.66],
        [x + w - boltInset, y + h * 0.34],
        [x + w - boltInset, y + h * 0.66],
      ]
    : [
        [x + w * 0.34, y + boltInset],
        [x + w * 0.66, y + boltInset],
        [x + w * 0.34, y + h - boltInset],
        [x + w * 0.66, y + h - boltInset],
      ];

  boltPoints.forEach(([bx, by], index) => {
    surface.fillCircle(bx, by, boltRadius, index % 2 === 0 ? 0xb9faff : 0x29dff2, 0.95);
    surface.fillCircle(bx, by, boltRadius * 0.46, 0x064353, 1);
  });

  surface.strokeRoundedRect(x - frame * 0.2, y - frame * 0.2, w + frame * 0.4, h + frame * 0.4, frame * 1.5, Math.max(1.5, frame * 0.45), 0x00eaff, 0.88);
  surface.strokeRoundedRect(glassX, glassY, glassW, glassH, frame * 0.6, Math.max(1, frame * 0.24), 0xc9ffff, 0.68);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}
