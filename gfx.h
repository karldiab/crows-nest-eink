// =====================================================
// gfx.h: bounds-checked drawing helpers on top of the Elecrow EPD library.
//
// Everything here draws into the RAM frame buffer bound by Paint_NewImage().
// Nothing reaches the panel until a Display call in the main sketch.
//
// Why this exists:
//   - Elecrow's Paint_SetPixel() has no bounds check. Writing past the edge
//     corrupts memory, so every helper here clips first.
//   - EPD_ShowChar() indexes the font with (chr - ' ') and reads garbage for
//     anything outside printable ASCII, so gText() sanitizes.
//   - The fonts have no degree sign. In gText() strings, a backtick (`) is
//     drawn as a small degree ring.
//
// Font facts (from EPD_font.h / EPD_GUI.cpp):
//   sizes 12, 16, 24, 48. Glyph advance = size / 2.
//   Size 12 paints a 16 px tall cell; others paint exactly `size` rows.
//   Glyphs paint their background (inverse colour), so white-on-black text
//   is just gText(..., WHITE) on a black fill.
// =====================================================
#pragma once

#include <Arduino.h>
#include "gfxfont_types.h" // Adafruit GFX font format, defined locally
#include "EPD.h"
#include "EPD_GUI.h"
#include "EPD_font.h"     // glyph tables, read directly by gTextBold()

static inline uint8_t gInv(uint8_t c) { return (c == BLACK) ? WHITE : BLACK; }

static inline void gPx(int x, int y, uint8_t c)
{
  if (x < 0 || y < 0 || x >= EPD_W || y >= EPD_H) return;
  Paint_SetPixel((uint16_t)x, (uint16_t)y, c);
}

// ---------------- dithering ----------------
// Ordered (Bayer 8x8) dithering. gray: 0 = white, 255 = black.
// Thresholds use absolute screen coordinates so neighbouring shapes share
// one consistent pattern.
static const uint8_t BAYER8[8][8] = {
  {  0, 32,  8, 40,  2, 34, 10, 42 },
  { 48, 16, 56, 24, 50, 18, 58, 26 },
  { 12, 44,  4, 36, 14, 46,  6, 38 },
  { 60, 28, 52, 20, 62, 30, 54, 22 },
  {  3, 35, 11, 43,  1, 33,  9, 41 },
  { 51, 19, 59, 27, 49, 17, 57, 25 },
  { 15, 47,  7, 39, 13, 45,  5, 37 },
  { 63, 31, 55, 23, 61, 29, 53, 21 },
};

static inline bool gDitherBlack(int x, int y, int gray)
{
  if (gray <= 0) return false;
  if (gray >= 255) return true;
  return gray > (BAYER8[y & 7][x & 7] * 4 + 2);
}

static inline void gPxGray(int x, int y, int gray)
{
  gPx(x, y, gDitherBlack(x, y, gray) ? BLACK : WHITE);
}

static void gHLine(int x0, int x1, int y, uint8_t c)
{
  if (x0 > x1) { int t = x0; x0 = x1; x1 = t; }
  for (int x = x0; x <= x1; x++) gPx(x, y, c);
}

static void gVLine(int x, int y0, int y1, uint8_t c)
{
  if (y0 > y1) { int t = y0; y0 = y1; y1 = t; }
  for (int y = y0; y <= y1; y++) gPx(x, y, c);
}

static void gFillRect(int x, int y, int w, int h, uint8_t c)
{
  for (int yy = y; yy < y + h; yy++) gHLine(x, x + w - 1, yy, c);
}

// Rectangle outline, `t` pixels thick, drawn inward
static void gRect(int x, int y, int w, int h, int t, uint8_t c)
{
  for (int i = 0; i < t; i++)
  {
    gHLine(x + i, x + w - 1 - i, y + i, c);
    gHLine(x + i, x + w - 1 - i, y + h - 1 - i, c);
    gVLine(x + i, y + i, y + h - 1 - i, c);
    gVLine(x + w - 1 - i, y + i, y + h - 1 - i, c);
  }
}

static void gLine(int x0, int y0, int x1, int y1, uint8_t c)
{
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  for (;;)
  {
    gPx(x0, y0, c);
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

static void gFillCircle(int cx, int cy, int r, uint8_t c)
{
  if (r <= 0) { gPx(cx, cy, c); return; }
  for (int dy = -r; dy <= r; dy++)
  {
    int dx = (int)sqrtf((float)(r * r - dy * dy) + 0.25f);
    gHLine(cx - dx, cx + dx, cy + dy, c);
  }
}

// Ring of thickness t. quadMask selects quadrants to draw:
//   1 = top-right, 2 = top-left, 4 = bottom-left, 8 = bottom-right, 15 = all
static void gRing(int cx, int cy, int r, int t, uint8_t c, uint8_t quadMask)
{
  int rIn = r - t;
  int r2 = r * r, rIn2 = rIn > 0 ? rIn * rIn : 0;
  for (int dy = -r; dy <= r; dy++)
  {
    for (int dx = -r; dx <= r; dx++)
    {
      int d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < rIn2) continue;
      uint8_t q = (dy < 0) ? ((dx >= 0) ? 1 : 2) : ((dx < 0) ? 4 : 8);
      if (quadMask & q) gPx(cx + dx, cy + dy, c);
    }
  }
}

// Thick line: stamps a filled circle along the path
static void gThickLine(int x0, int y0, int x1, int y1, int t, uint8_t c)
{
  if (t <= 1) { gLine(x0, y0, x1, y1, c); return; }
  int r = t / 2;
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  for (;;)
  {
    gFillCircle(x0, y0, r, c);
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

static inline long gEdge(int ax, int ay, int bx, int by, int px, int py)
{
  return (long)(bx - ax) * (py - ay) - (long)(by - ay) * (px - ax);
}

static void gFillTri(int x0, int y0, int x1, int y1, int x2, int y2, uint8_t c)
{
  int minX = min(x0, min(x1, x2)), maxX = max(x0, max(x1, x2));
  int minY = min(y0, min(y1, y2)), maxY = max(y0, max(y1, y2));
  for (int y = minY; y <= maxY; y++)
  {
    for (int x = minX; x <= maxX; x++)
    {
      long w0 = gEdge(x1, y1, x2, y2, x, y);
      long w1 = gEdge(x2, y2, x0, y0, x, y);
      long w2 = gEdge(x0, y0, x1, y1, x, y);
      bool neg = (w0 < 0) || (w1 < 0) || (w2 < 0);
      bool pos = (w0 > 0) || (w1 > 0) || (w2 > 0);
      if (!(neg && pos)) gPx(x, y, c);
    }
  }
}

// ---------------- text ----------------

static inline bool gFontOk(int size)
{
  return size == 12 || size == 16 || size == 24 || size == 48;
}

// Rows a glyph actually paints (size 12 paints a 16 row cell)
static inline int gCellH(int size) { return ((size + 7) / 8) * 8; }

static inline int gDegW(int size) { return size / 3; }

static int gTextW(const char* s, int size)
{
  int w = 0;
  for (; *s; s++) w += (*s == '`') ? gDegW(size) : size / 2;
  return w;
}

// Draws text with its top-left at (x, y). Clips at the screen edges:
// characters that would run off the right edge are dropped.
static void gText(int x, int y, const char* s, int size, uint8_t color)
{
  if (!s || !gFontOk(size)) return;
  if (y < 0 || y + 1 + gCellH(size) > EPD_H) return;
  uint8_t bg = gInv(color);
  for (; *s; s++)
  {
    char ch = *s;
    int cw = (ch == '`') ? gDegW(size) : size / 2;
    if (x < 0) { x += cw; continue; }
    if (x + 1 + cw > EPD_W) break;
    if (ch == '`')
    {
      gFillRect(x + 1, y + 1, cw, size, bg);
      int r = max(2, size / 10);
      int t = max(1, size / 16);
      gRing(x + 1 + cw / 2, y + 1 + r + size / 12, r, t, color, 15);
    }
    else
    {
      if (ch < 32 || ch > 126) ch = '?';
      EPD_ShowChar((uint16_t)x, (uint16_t)y, (uint16_t)ch, (uint16_t)size, color);
    }
    x += cw;
  }
}

static void gTextC(int cx, int y, const char* s, int size, uint8_t color)
{
  gText(cx - gTextW(s, size) / 2, y, s, size, color);
}

static void gTextR(int rx, int y, const char* s, int size, uint8_t color)
{
  gText(rx - gTextW(s, size), y, s, size, color);
}

// ---------------- faux-bold small text ----------------
// The Elecrow 12/16 px fonts have 1 px strokes, which look faint on e-ink.
// This draws each glyph transparently twice, one pixel apart, giving 2 px
// vertical strokes. Advance is size/2 + 1 so letters don't touch.
// Glyph format (EPD_font.h): column-major, LSB = top pixel, chunks of 8 rows.

static inline int gBoldAdv(int size) { return size / 2 + 1; }

static int gTextBoldW(const char* s, int size)
{
  return (int)strlen(s) * gBoldAdv(size);
}

static void gBoldGlyph(int x, int y, char ch, int size, uint8_t color)
{
  if (ch < 32 || ch > 126) ch = '?';
  int idx = ch - ' ';
  int cols = size / 2;
  int chunks = (size + 7) / 8;
  const unsigned char* g;
  if (size == 12)      g = ascii_1206[idx];
  else if (size == 16) g = ascii_1608[idx];
  else return;
  for (int i = 0; i < cols * chunks; i++)
  {
    uint8_t b = g[i];
    int col = i % cols, chunk = i / cols;
    for (int bit = 0; bit < 8; bit++)
    {
      if (b & (1 << bit))
      {
        int px = x + 1 + col, py = y + 1 + chunk * 8 + bit;
        gPx(px, py, color);
        gPx(px + 1, py, color);
      }
    }
  }
}

// Top-left at (x, y), transparent background. Sizes 12 and 16.
static void gTextBold(int x, int y, const char* s, int size, uint8_t color)
{
  for (; *s; s++)
  {
    gBoldGlyph(x, y, *s, size, color);
    x += gBoldAdv(size);
  }
}

static void gTextBoldC(int cx, int y, const char* s, int size, uint8_t color)
{
  gTextBold(cx - gTextBoldW(s, size) / 2, y, s, size, color);
}

// Rounded rectangle outline, t pixels thick, corner radius r
static void gRoundRect(int x, int y, int w, int h, int r, int t, uint8_t c)
{
  for (int yy = y; yy < y + h; yy++)
  {
    for (int xx = x; xx < x + w; xx++)
    {
      // distance from the rounded-rect edge
      int cx = (xx < x + r) ? x + r : (xx > x + w - 1 - r) ? x + w - 1 - r : xx;
      int cy = (yy < y + r) ? y + r : (yy > y + h - 1 - r) ? y + h - 1 - r : yy;
      int dx = xx - cx, dy = yy - cy;
      if (dx == 0 && dy == 0)
      {
        // straight edge region
        int d = min(min(xx - x, x + w - 1 - xx), min(yy - y, y + h - 1 - yy));
        if (d < t) gPx(xx, yy, c);
      }
      else
      {
        float d = sqrtf((float)(dx * dx + dy * dy));
        if (d <= r + 0.5f && d > r - t + 0.5f) gPx(xx, yy, c);
      }
    }
  }
}

// ---------------- GFX (Adafruit format) fonts ----------------
// Proportional, transparent background. y is the text BASELINE.
// Backtick (`) draws a degree ring.

static int gfxCapH(const GFXfont* f)
{
  if ('H' < f->first || 'H' > f->last) return f->yAdvance / 2;
  return -f->glyph['H' - f->first].yOffset;
}

static inline int gfxDegR(const GFXfont* f) { return max(2, (int)f->yAdvance / 14); }
static inline int gfxDegAdv(const GFXfont* f) { return 2 * gfxDegR(f) + 4; }

static int gfxTextW(const GFXfont* f, const char* s)
{
  int w = 0;
  for (; *s; s++)
  {
    char c = *s;
    if (c == '`') { w += gfxDegAdv(f); continue; }
    if (c < f->first || c > f->last) c = '?';
    w += f->glyph[c - f->first].xAdvance;
  }
  return w;
}

static void gfxText(const GFXfont* f, int x, int y, const char* s, uint8_t color)
{
  int capH = gfxCapH(f);
  for (; *s; s++)
  {
    char c = *s;
    if (c == '`')
    {
      int r = gfxDegR(f);
      gRing(x + 2 + r, y - capH + r, r, max(1, (int)f->yAdvance / 28), color, 15);
      x += gfxDegAdv(f);
      continue;
    }
    if (c < f->first || c > f->last) c = '?';
    const GFXglyph* g = &f->glyph[c - f->first];
    const uint8_t* bm = f->bitmap + g->bitmapOffset;
    uint8_t bits = 0, bit = 0;
    for (int yy = 0; yy < g->height; yy++)
    {
      for (int xx = 0; xx < g->width; xx++)
      {
        if (!(bit++ & 7)) bits = *bm++;
        if (bits & 0x80) gPx(x + g->xOffset + xx, y + g->yOffset + yy, color);
        bits <<= 1;
      }
    }
    x += g->xAdvance;
  }
}

static void gfxTextC(const GFXfont* f, int cx, int y, const char* s, uint8_t color)
{
  gfxText(f, cx - gfxTextW(f, s) / 2, y, s, color);
}

static void gfxTextR(const GFXfont* f, int rx, int y, const char* s, uint8_t color)
{
  gfxText(f, rx - gfxTextW(f, s), y, s, color);
}
