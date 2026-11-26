import { OUT_W, OUT_H, ROW_BYTES, IMAGE_BYTES } from '../types';

/**
 * Pack a 1-byte-per-pixel bitmap (1 = black, 0 = white) into Adafruit GFX
 * drawBitmap format: row-major, MSB = leftmost pixel, rows padded to bytes.
 */
export function pack(bits: Uint8Array, width = OUT_W, height = OUT_H): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const orow = y * rowBytes;
    for (let x = 0; x < width; x++) {
      if (bits[row + x]) out[orow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

export function unpack(bytes: Uint8Array, width = OUT_W, height = OUT_H): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      out[y * width + x] = bytes[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7)) ? 1 : 0;
  return out;
}

export { ROW_BYTES, IMAGE_BYTES };
