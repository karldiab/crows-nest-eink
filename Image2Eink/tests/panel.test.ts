import { describe, it, expect } from 'vitest';
import { pack } from '../src/pipeline/pack';
import { generateHeader } from '../src/export/header';
import { withWidth, defaultCrop } from '../src/editor/geometry';
import { OUT_W, OUT_H, IMAGE_BYTES, ROW_BYTES, ASPECT, setPanelSize, validPanel, DEFAULT_PANEL } from '../src/types';

describe('selectable panel size', () => {
  it('defaults to the CrowPanel 4.2" (400 x 300, 15000 bytes)', () => {
    expect(DEFAULT_PANEL).toMatchObject({ w: 400, h: 300 });
    expect([OUT_W, OUT_H, ROW_BYTES, IMAGE_BYTES]).toEqual([400, 300, 50, 15000]);
    expect(pack(new Uint8Array(400 * 300)).length).toBe(15000);
  });

  it('updates every derived value when the size changes', () => {
    setPanelSize(203, 61);
    expect([OUT_W, OUT_H, ROW_BYTES, IMAGE_BYTES]).toEqual([203, 61, 26, 26 * 61]);
    expect(ASPECT).toBeCloseTo(203 / 61);
    // crops follow the new aspect
    const c = withWidth(defaultCrop(1000, 1000), 406);
    expect(c.h).toBeCloseTo(122);
    // last pixel of a 203 px row lands in byte 25, bit 0x20 (203 = 25*8 + 3)
    const px = new Uint8Array(203 * 61);
    px[202] = 1;
    expect(pack(px)[25]).toBe(0x20);
    setPanelSize(400, 300);
  });

  it('writes the size and panel name into the header', () => {
    const h = generateHeader(
      [{ name: 'a', fileName: 'a.jpg', description: 'dither, atkinson', bytes: new Uint8Array(15000) }],
      'Elecrow CrowPanel 4.2" · 400 × 300',
    );
    expect(h).toContain('#define EGG_WIDTH  400\n#define EGG_HEIGHT 300');
    expect(h).toContain('// 1 image(s), 400x300, 1-bit, 15000 bytes each, 15000 bytes total.');
    expect(h).toContain('// Panel: Elecrow CrowPanel 4.2" · 400 × 300');
  });

  it('validates panel configs', () => {
    expect(validPanel({ preset: 'custom', w: 296, h: 128 })).toBe(true);
    expect(validPanel({ preset: 'custom', w: 4, h: 128 })).toBe(false);
    expect(validPanel({ preset: 'custom', w: 296.5, h: 128 })).toBe(false);
    expect(validPanel(undefined)).toBe(false);
  });
});
