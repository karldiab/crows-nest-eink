// Font structures in the Adafruit GFX format (from Adafruit_GFX gfxfont.h,
// BSD license). Defined locally so the sketch needs no Adafruit library.
#pragma once
#include <Arduino.h>

typedef struct {
  uint16_t bitmapOffset; // offset into GFXfont->bitmap
  uint8_t  width;        // bitmap size in pixels
  uint8_t  height;
  uint8_t  xAdvance;     // cursor advance (x)
  int8_t   xOffset;      // from cursor to glyph upper-left
  int8_t   yOffset;
} GFXglyph;

typedef struct {
  uint8_t  *bitmap;      // glyph bitmaps, concatenated
  GFXglyph *glyph;       // glyph table
  uint16_t first;        // first ASCII char
  uint16_t last;         // last ASCII char
  uint8_t  yAdvance;     // line height
} GFXfont;
