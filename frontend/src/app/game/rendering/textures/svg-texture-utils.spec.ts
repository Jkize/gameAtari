import { describe, expect, it } from 'vitest';
import { applyTrackColor } from './svg-texture-utils';

describe('applyTrackColor', () => {
  it('replaces only the tread shadow with the player color', () => {
    const svg = `
      <style>:root {
        --track-tread-bright: #9298a3;
        --track-tread-shadow: #1b1517;
      }</style>
    `;

    expect(applyTrackColor(svg, 0xff66cc)).toContain('--track-tread-shadow: #ff66cc;');
    expect(applyTrackColor(svg, 0xff66cc)).toContain('--track-tread-bright: #9298a3;');
  });
});
