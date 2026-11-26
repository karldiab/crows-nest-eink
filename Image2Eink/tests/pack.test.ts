import { describe, it, expect } from 'vitest';
import { pack, unpack } from '../src/pipeline/pack';
import { OUT_W, OUT_H, IMAGE_BYTES, setPanelSize } from '../src/types';

// These tests were written for the Heltec 250 x 122 panel.
setPanelSize(250, 122);

const blank = () => new Uint8Array(OUT_W * OUT_H);

describe('packing', () => {
  it('all-white packs to 3904 zero bytes', () => {
    const b = pack(blank());
    expect(b.length).toBe(3904);
    expect(IMAGE_BYTES).toBe(3904);
    expect(b.every((x) => x === 0)).toBe(true);
  });

  it('black pixel at (0,0) -> byte 0 = 0x80', () => {
    const px = blank();
    px[0] = 1;
    const b = pack(px);
    expect(b[0]).toBe(0x80);
    expect(b.slice(1).every((x) => x === 0)).toBe(true);
  });

  it('black pixel at (249,0) -> byte 31 = 0x40', () => {
    const px = blank();
    px[249] = 1;
    const b = pack(px);
    expect(b[31]).toBe(0x40);
    expect(b.filter((x) => x !== 0).length).toBe(1);
  });

  it('black pixel at (0,121) -> byte 3872 = 0x80', () => {
    const px = blank();
    px[121 * OUT_W] = 1;
    const b = pack(px);
    expect(b[121 * 32]).toBe(0x80);
    expect(b.filter((x) => x !== 0).length).toBe(1);
  });

  it('all-black rows are 0xFF x31 then 0xC0 (spec says 0xFC, a typo: 250 = 31*8 + 2)', () => {
    const b = pack(new Uint8Array(OUT_W * OUT_H).fill(1));
    for (let y = 0; y < OUT_H; y++) {
      for (let i = 0; i < 31; i++) expect(b[y * 32 + i]).toBe(0xff);
      expect(b[y * 32 + 31]).toBe(0xc0);
    }
  });

  it('unpack round-trips', () => {
    const px = blank().map(() => (Math.random() < 0.5 ? 1 : 0));
    expect(unpack(pack(px))).toEqual(px);
  });
});
