// =====================================================
// icons.h: shaded, dithered 1-bit icons.
//
// Each icon is drawn per pixel: a shape test (signed distance) decides
// coverage, a shading function picks a gray level (0 = white, 255 = black),
// and an 8x8 Bayer matrix turns that gray into a black/white pattern
// (see gPxGray in gfx.h). Shapes get a crisp black rim so they read well
// from across a room, with soft dithered shading inside.
//
// Each icon fills an s x s box with its top-left at (ox, oy). Best at s >= 40.
//
// Weather icons match Home Assistant's weather condition strings:
//   clear-night, cloudy, exceptional, fog, hail, lightning, lightning-rainy,
//   partlycloudy, pouring, rainy, snowy, snowy-rainy, sunny, windy,
//   windy-variant
// =====================================================
#pragma once

#include "gfx.h"

// ---------------- math helpers ----------------

static inline float iClamp(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
static inline int   iLerp(int a, int b, float t) { return a + (int)((b - a) * iClamp(t, 0, 1)); }

static inline float sdCircle(float px, float py, float cx, float cy, float r)
{
  return hypotf(px - cx, py - cy) - r;
}

static float sdBox(float px, float py, float x0, float y0, float x1, float y1)
{
  float cx = (x0 + x1) * 0.5f, cy = (y0 + y1) * 0.5f;
  float qx = fabsf(px - cx) - (x1 - x0) * 0.5f;
  float qy = fabsf(py - cy) - (y1 - y0) * 0.5f;
  float outside = hypotf(fmaxf(qx, 0), fmaxf(qy, 0));
  float inside = fminf(fmaxf(qx, qy), 0);
  return outside + inside;
}

// ---------------- sun ----------------
// R = outer radius including rays
static void sunLayer(float cx, float cy, float R)
{
  float core = 0.46f * R;
  float rim = fmaxf(1.6f, R / 22);
  float rayIn = 0.62f * R;
  const float step = PI / 4;
  for (int y = (int)(cy - R); y <= (int)(cy + R); y++)
  {
    for (int x = (int)(cx - R); x <= (int)(cx + R); x++)
    {
      float dx = x + 0.5f - cx, dy = y + 0.5f - cy;
      float rr = hypotf(dx, dy);
      if (rr <= core)
      {
        if (rr > core - rim) { gPx(x, y, BLACK); continue; }
        float t = rr / core;
        // bright centre, darker toward the limb, slightly lit from top-left
        int g = 10 + (int)(150 * t * t) + (int)(25 * (dx + dy) / core);
        gPxGray(x, y, g);
        continue;
      }
      if (rr < core + 0.12f * R)
      {
        // faint glow just outside the disc
        gPxGray(x, y, (int)(70 * (1 - (rr - core) / (0.12f * R))));
        continue;
      }
      if (rr >= rayIn && rr <= R)
      {
        float a = atan2f(dy, dx);
        float diff = a - roundf(a / step) * step;
        float lateral = rr * fabsf(sinf(diff));
        float t = (rr - rayIn) / (R - rayIn);
        float hw = 0.085f * R * (1 - t) + 0.02f * R;   // tapered ray
        if (lateral < hw) gPxGray(x, y, iLerp(250, 150, t));
      }
    }
  }
}

// ---------------- moon ----------------
static void moonLayer(float cx, float cy, float r)
{
  float rim = fmaxf(1.6f, r / 14);
  float bx = cx + 0.42f * r, by = cy - 0.30f * r, rb = 0.80f * r;
  for (int y = (int)(cy - r); y <= (int)(cy + r); y++)
  {
    for (int x = (int)(cx - r); x <= (int)(cx + r); x++)
    {
      float px = x + 0.5f, py = y + 0.5f;
      float dA = hypotf(px - cx, py - cy) - r;      // <0 inside the disc
      float dB = rb - hypotf(px - bx, py - by);     // <0 inside the bite
      float d = fmaxf(dA, dB);
      if (d > 0) continue;
      if (d > -rim) { gPx(x, y, BLACK); continue; }
      // lit along the outer limb, darker toward the terminator
      float t = iClamp(-dA / (0.55f * r), 0, 1);
      int g = 40 + (int)(130 * t);
      // two soft craters
      if (hypotf(px - (cx - 0.45f * r), py - (cy + 0.15f * r)) < 0.14f * r) g += 45;
      if (hypotf(px - (cx - 0.15f * r), py - (cy + 0.55f * r)) < 0.10f * r) g += 45;
      gPxGray(x, y, g);
    }
  }
}

static void sparkle(int cx, int cy, int r)
{
  gLine(cx - r, cy, cx + r, cy, BLACK);
  gLine(cx, cy - r, cx, cy + r, BLACK);
  gPx(cx - 1, cy - 1, BLACK); gPx(cx + 1, cy + 1, BLACK);
  gPx(cx - 1, cy + 1, BLACK); gPx(cx + 1, cy - 1, BLACK);
}

// ---------------- cloud ----------------
static float cloudSd(float px, float py, float ox, float oy, float S)
{
  float d = sdCircle(px, py, ox + 0.30f * S, oy + 0.62f * S, 0.20f * S);
  d = fminf(d, sdCircle(px, py, ox + 0.52f * S, oy + 0.48f * S, 0.26f * S));
  d = fminf(d, sdCircle(px, py, ox + 0.74f * S, oy + 0.64f * S, 0.18f * S));
  d = fminf(d, sdBox(px, py, ox + 0.30f * S, oy + 0.62f * S, ox + 0.74f * S, oy + 0.82f * S));
  return d;
}

// dark = rain/storm cloud (heavier shading)
static void cloudLayer(float ox, float oy, float S, bool dark)
{
  float rim = fmaxf(1.6f, S / 32);
  int x0 = (int)(ox + 0.08f * S), x1 = (int)(ox + 0.94f * S);
  int y0 = (int)(oy + 0.20f * S), y1 = (int)(oy + 0.84f * S);
  float top = oy + 0.22f * S, h = 0.60f * S;
  float hx = ox + 0.44f * S, hy = oy + 0.36f * S;   // highlight on the big puff
  for (int y = y0; y <= y1; y++)
  {
    for (int x = x0; x <= x1; x++)
    {
      float px = x + 0.5f, py = y + 0.5f;
      float d = cloudSd(px, py, ox, oy, S);
      if (d > 0) continue;
      if (d > -rim) { gPx(x, y, BLACK); continue; }
      float tv = (py - top) / h;                      // 0 top .. 1 bottom
      int g = dark ? iLerp(70, 185, tv) : iLerp(0, 95, tv);
      float edge = iClamp(1 + d / (0.10f * S), 0, 1); // 1 near rim
      g += (int)(edge * edge * 45 * tv);              // shade the underside
      float hd = hypotf(px - hx, py - hy) / (0.14f * S);
      if (hd < 1) g -= (int)(55 * (1 - hd));
      gPxGray(x, y, g);
    }
  }
}

// ---------------- precipitation ----------------
// Teardrop from a pointed top to a round bottom
static void dropLayer(float tx, float ty, float bx, float by, float rmax)
{
  float vx = bx - tx, vy = by - ty;
  float len2 = vx * vx + vy * vy;
  int xa = (int)(fminf(tx, bx) - rmax - 1), xb = (int)(fmaxf(tx, bx) + rmax + 1);
  int ya = (int)(ty - 1), yb = (int)(by + rmax + 1);
  for (int y = ya; y <= yb; y++)
  {
    for (int x = xa; x <= xb; x++)
    {
      float px = x + 0.5f - tx, py = y + 0.5f - ty;
      float t = iClamp((px * vx + py * vy) / len2, 0, 1);
      float qx = px - t * vx, qy = py - t * vy;
      float dist = hypotf(qx, qy);
      float r = rmax * sqrtf(t);
      if (dist >= r) continue;
      if (dist > r - 1.3f) { gPx(x, y, BLACK); continue; }
      float side = qx * vy - qy * vx;                 // left of axis = highlight
      gPxGray(x, y, side < 0 ? 70 : 205);
    }
  }
}

static void drops(float ox, float oy, float S, int count, bool heavy)
{
  float rmax = heavy ? 0.055f * S : 0.045f * S;
  float len = heavy ? 0.20f * S : 0.15f * S;
  for (int i = 0; i < count; i++)
  {
    float x = ox + 0.32f * S + i * (0.40f * S / fmaxf(1, count - 1));
    float y = oy + 0.72f * S + ((i & 1) ? 0.05f * S : 0);
    dropLayer(x + 0.04f * S, y, x - 0.02f * S, y + len, rmax);
  }
}

static void snowflake(int cx, int cy, int r)
{
  int d = r * 7 / 10;
  gThickLine(cx, cy - r, cx, cy + r, 2, BLACK);
  gThickLine(cx - d, cy - d, cx + d, cy + d, 2, BLACK);
  gThickLine(cx - d, cy + d, cx + d, cy - d, 2, BLACK);
  gFillCircle(cx, cy, 1, WHITE);
}

static void hailstone(int cx, int cy, int r)
{
  for (int y = cy - r; y <= cy + r; y++)
    for (int x = cx - r; x <= cx + r; x++)
    {
      float d = hypotf(x + 0.5f - cx, y + 0.5f - cy);
      if (d > r) continue;
      if (d > r - 1.3f) gPx(x, y, BLACK);
      else gPxGray(x, y, (x < cx && y < cy) ? 30 : 140);
    }
}

// Lightning bolt: white halo then black body so it separates from the cloud
static void boltLayer(float ox, float oy, float S)
{
  int ax = ox + 0.58f * S, ay = oy + 0.52f * S;
  int bx = ox + 0.38f * S, by = oy + 0.78f * S;
  int cx = ox + 0.53f * S, cy = by;
  int dx = ox + 0.46f * S, dy = oy + 0.74f * S;
  int ex = ox + 0.64f * S, ey = dy;
  int fx = ox + 0.40f * S, fy = oy + 0.99f * S;
  for (int o = 0; o < 4; o++)
  {
    int sx = (o == 0) ? -2 : (o == 1) ? 2 : 0;
    int sy = (o == 2) ? -2 : (o == 3) ? 2 : 0;
    gFillTri(ax + sx, ay + sy, bx + sx, by + sy, cx + sx, cy + sy, WHITE);
    gFillTri(dx + sx, dy + sy, ex + sx, ey + sy, fx + sx, fy + sy, WHITE);
  }
  gFillTri(ax, ay, bx, by, cx, cy, BLACK);
  gFillTri(dx, dy, ex, ey, fx, fy, BLACK);
}

// Horizontal band with rounded ends, gray body
static void bandLayer(float x0, float x1, float yc, float r, int gray)
{
  for (int y = (int)(yc - r); y <= (int)(yc + r); y++)
    for (int x = (int)(x0 - r); x <= (int)(x1 + r); x++)
    {
      float px = x + 0.5f, py = y + 0.5f;
      float cxp = iClamp(px, x0, x1);
      float d = hypotf(px - cxp, py - yc);
      if (d > r) continue;
      gPxGray(x, y, d > r - 1.2f ? 255 : gray);
    }
}

// Line whose gray fades from g0 (start) to g1 (end)
static void fadeLine(float x0, float y0, float x1, float y1, float r, int g0, int g1)
{
  float vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy;
  for (int y = (int)(fminf(y0, y1) - r); y <= (int)(fmaxf(y0, y1) + r); y++)
    for (int x = (int)(fminf(x0, x1) - r); x <= (int)(fmaxf(x0, x1) + r); x++)
    {
      float px = x + 0.5f - x0, py = y + 0.5f - y0;
      float t = iClamp((px * vx + py * vy) / len2, 0, 1);
      if (hypotf(px - t * vx, py - t * vy) > r) continue;
      gPxGray(x, y, iLerp(g0, g1, t));
    }
}

static void windLayer(float ox, float oy, float S)
{
  float r = fmaxf(1.5f, S / 28);
  float c = 0.09f * S;   // curl radius
  int t = max(2, (int)(S / 20));
  float y1 = oy + 0.34f * S, y2 = oy + 0.54f * S, y3 = oy + 0.74f * S;
  fadeLine(ox + 0.06f * S, y1, ox + 0.66f * S, y1, r, 40, 255);
  gRing(ox + 0.66f * S, y1 - c, c, t, BLACK, 1 | 2 | 8);
  fadeLine(ox + 0.06f * S, y2, ox + 0.86f * S, y2, r, 40, 255);
  fadeLine(ox + 0.18f * S, y3, ox + 0.56f * S, y3, r, 40, 255);
  gRing(ox + 0.56f * S, y3 + c, c, t, BLACK, 1 | 4 | 8);
}

// ---------------- weather ----------------

static void drawWeatherIcon(const char* cond, int ox, int oy, int s)
{
  float S = s;
  float cx = ox + S / 2, cy = oy + S / 2;

  if (!cond || !*cond || !strcmp(cond, "--") || !strcmp(cond, "unknown") || !strcmp(cond, "unavailable"))
  {
    gRect(ox + 4, oy + 4, s - 8, s - 8, 2, BLACK);
    gTextC((int)cx, (int)cy - 12, "?", 24, BLACK);
    return;
  }
  if (!strcmp(cond, "sunny"))
  {
    sunLayer(cx, cy, S * 0.48f);
    return;
  }
  if (!strcmp(cond, "clear-night"))
  {
    moonLayer(cx - 0.06f * S, cy + 0.04f * S, 0.34f * S);
    sparkle(ox + 0.80f * S, oy + 0.20f * S, max(2, s / 16));
    sparkle(ox + 0.88f * S, oy + 0.52f * S, max(2, s / 22));
    return;
  }
  if (!strcmp(cond, "partlycloudy"))
  {
    sunLayer(ox + 0.36f * S, oy + 0.34f * S, 0.32f * S);
    cloudLayer(ox + 0.06f * S, oy + 0.12f * S, 0.94f * S, false);
    return;
  }
  if (!strcmp(cond, "cloudy"))
  {
    cloudLayer(ox + 0.24f * S, oy - 0.08f * S, 0.76f * S, true);   // darker one behind
    cloudLayer(ox - 0.02f * S, oy + 0.10f * S, S, false);
    return;
  }
  if (!strcmp(cond, "rainy"))
  {
    cloudLayer(ox, oy - 0.14f * S, S, true);
    drops(ox, oy, S, 3, false);
    return;
  }
  if (!strcmp(cond, "pouring"))
  {
    cloudLayer(ox, oy - 0.16f * S, S, true);
    drops(ox, oy, S, 4, true);
    return;
  }
  if (!strcmp(cond, "snowy"))
  {
    cloudLayer(ox, oy - 0.14f * S, S, false);
    int r = max(3, (int)(0.08f * S));
    snowflake(ox + 0.30f * S, oy + 0.80f * S, r);
    snowflake(ox + 0.52f * S, oy + 0.90f * S, r);
    snowflake(ox + 0.74f * S, oy + 0.80f * S, r);
    return;
  }
  if (!strcmp(cond, "snowy-rainy"))
  {
    cloudLayer(ox, oy - 0.14f * S, S, true);
    snowflake(ox + 0.30f * S, oy + 0.84f * S, max(3, (int)(0.08f * S)));
    dropLayer(ox + 0.56f * S, oy + 0.72f * S, ox + 0.52f * S, oy + 0.86f * S, 0.045f * S);
    snowflake(ox + 0.76f * S, oy + 0.84f * S, max(3, (int)(0.08f * S)));
    return;
  }
  if (!strcmp(cond, "hail"))
  {
    cloudLayer(ox, oy - 0.14f * S, S, true);
    int r = max(3, (int)(0.06f * S));
    hailstone(ox + 0.32f * S, oy + 0.80f * S, r);
    hailstone(ox + 0.52f * S, oy + 0.90f * S, r);
    hailstone(ox + 0.72f * S, oy + 0.80f * S, r);
    return;
  }
  if (!strcmp(cond, "lightning") || !strcmp(cond, "lightning-rainy"))
  {
    cloudLayer(ox, oy - 0.16f * S, S, true);
    if (cond[9] == '-')   // lightning-rainy
    {
      dropLayer(ox + 0.26f * S, oy + 0.72f * S, ox + 0.22f * S, oy + 0.86f * S, 0.045f * S);
      dropLayer(ox + 0.80f * S, oy + 0.72f * S, ox + 0.76f * S, oy + 0.86f * S, 0.045f * S);
    }
    boltLayer(ox, oy, S);
    return;
  }
  if (!strcmp(cond, "fog"))
  {
    cloudLayer(ox, oy - 0.18f * S, S, false);
    float r = fmaxf(2, 0.045f * S);
    bandLayer(ox + 0.14f * S, ox + 0.80f * S, oy + 0.72f * S, r, 120);
    bandLayer(ox + 0.24f * S, ox + 0.90f * S, oy + 0.84f * S, r, 150);
    bandLayer(ox + 0.10f * S, ox + 0.66f * S, oy + 0.96f * S - r, r, 180);
    return;
  }
  if (!strcmp(cond, "windy") || !strcmp(cond, "windy-variant"))
  {
    windLayer(ox, oy, S);
    return;
  }
  // "exceptional" or unrecognised: warning triangle
  int t = max(2, s / 16);
  gThickLine(cx, oy + 0.08f * S, ox + 0.06f * S, oy + 0.90f * S, t, BLACK);
  gThickLine(cx, oy + 0.08f * S, ox + 0.94f * S, oy + 0.90f * S, t, BLACK);
  gThickLine(ox + 0.06f * S, oy + 0.90f * S, ox + 0.94f * S, oy + 0.90f * S, t, BLACK);
  gFillRect(cx - t / 2 - 1, oy + 0.34f * S, t + 2, 0.30f * S, BLACK);
  gFillRect(cx - t / 2 - 1, oy + 0.72f * S, t + 2, t + 2, BLACK);
}

// ---------------- light bulb ----------------
// Bulb levels, from the room's average brightness
enum { BULB_OFF = 0, BULB_LOW, BULB_MEDIUM, BULB_HIGH };

// off:    gray glass with a specular highlight, no glow
// low:    light-gray glass, faint dim filament, small soft glow
// medium: near-white glass, dark filament, medium glow
// high:   pure white glass, bright halo and five bold, round-ended light rays
// Nothing is drawn above oy - 3 so the glow never touches the room name.
static void drawBulb(int ox, int oy, int s, int level)
{
  level = constrain(level, BULB_OFF, BULB_HIGH);
  float S = s;
  float cx = ox + S / 2, cy = oy + 0.42f * S;
  float R = 0.26f * S;
  float rim = fmaxf(1.6f, S / 26);

  static const float HALO[4]   = { 0, 0.09f, 0.16f, 0.15f };   // glow width, fraction of s
  static const int   HALO_G[4] = { 0, 85, 135, 170 };          // glow strength at the glass
  float halo = HALO[level] * S;
  float rayIn = R + 0.13f * S, rayOut = R + 0.22f * S;       // gap between halo and rays
  float rayHalfW = fmaxf(1.0f, 0.034f * S);
  float reach = R + fmaxf(halo, level == BULB_HIGH ? 0.30f * S : 0);
  const int topLimit = oy - 3;

  float baseW = 0.30f * S;
  float baseY0 = cy + 0.78f * R;
  float baseY1 = oy + 0.84f * S;
  float tipW = 0.16f * S, tipY1 = oy + 0.93f * S;

  // Glass and glow
  for (int y = (int)(cy - reach); y <= (int)(cy + reach); y++)
  {
    if (y < topLimit) continue;
    for (int x = (int)(cx - reach); x <= (int)(cx + reach); x++)
    {
      float dx = x + 0.5f - cx, dy = y + 0.5f - cy;
      float rr = hypotf(dx, dy);
      if (rr > R)
      {
        if ((y + 0.5f) >= baseY0) continue;   // nothing beside the screw base
        int g = 0;
        if (halo > 0 && rr < R + halo)
        {
          float t = (rr - R) / halo;
          // high holds its glow further out, so it reads brighter
          float fall = (level == BULB_HIGH) ? powf(1 - t, 1.3f) : (1 - t) * (1 - t);
          g = (int)(HALO_G[level] * fall);
        }
        if (g > 0) gPxGray(x, y, g);
        continue;
      }
      if (rr > R - rim) { gPx(x, y, BLACK); continue; }
      int g;
      switch (level)
      {
        case BULB_OFF:
        {
          g = 105 + (int)(70 * (dx + dy) / (2 * R));    // lit top-left, dark bottom-right
          float hd = hypotf(dx + 0.42f * R, dy + 0.42f * R) / (0.20f * R);
          if (hd < 1) g = (int)(g * hd * hd);           // specular highlight
          break;
        }
        case BULB_LOW:    g = 45 + (int)(45 * rr / R); break;
        case BULB_MEDIUM: g = (int)(30 * rr / R);      break;
        default:          g = 0;                        break;
      }
      gPxGray(x, y, g);
    }
  }

  // Rays (high only): solid, never dithered, so they stay crisp
  if (level == BULB_HIGH)
  {
    // left, upper-left, up, upper-right, right (unit vectors)
    static const float UX[5] = { -1.0f, -0.7071f,  0.0f,  0.7071f, 1.0f };
    static const float UY[5] = {  0.0f, -0.7071f, -1.0f, -0.7071f, 0.0f };
    for (int y = max(topLimit, (int)(cy - reach)); y <= (int)(cy + rayHalfW + 1); y++)
    {
      for (int x = (int)(cx - reach); x <= (int)(cx + reach); x++)
      {
        float dx = x + 0.5f - cx, dy = y + 0.5f - cy;
        for (int k = 0; k < 5; k++)
        {
          // distance to the segment: gives rounded ends
          float t = iClamp(dx * UX[k] + dy * UY[k], rayIn, rayOut);
          if (hypotf(dx - t * UX[k], dy - t * UY[k]) <= rayHalfW) { gPx(x, y, BLACK); break; }
        }
      }
    }
  }

  // Filament: two support wires and a little zig-zag coil
  static const int FIL_G[4] = { 190, 200, 255, 255 };
  int fg = FIL_G[level];
  bool thick = level >= BULB_MEDIUM;
  int wx = (int)(0.10f * S);
  for (int y = (int)(cy + 0.05f * S); y < (int)baseY0; y++)
  {
    gPxGray((int)cx - wx, y, fg);
    gPxGray((int)cx + wx, y, fg);
  }
  for (int x = (int)cx - wx; x <= (int)cx + wx; x++)
  {
    int zy = (int)(cy + 0.05f * S) - (((x - ((int)cx - wx)) / 2) & 1) * 2;
    gPxGray(x, zy, fg);
    if (thick) gPxGray(x, zy + 1, fg);
  }

  // Screw base: alternating thread bands with a black outline
  int bx0 = (int)(cx - baseW / 2), bx1 = (int)(cx + baseW / 2);
  float band = fmaxf(2, 0.05f * S);
  for (int y = (int)baseY0; y <= (int)baseY1; y++)
  {
    int k = (int)((y - baseY0) / band);
    for (int x = bx0; x <= bx1; x++)
    {
      if (x == bx0 || x == bx1 || y == (int)baseY0 || y == (int)baseY1) gPx(x, y, BLACK);
      else gPxGray(x, y, (k & 1) ? 215 : 85);
    }
  }
  // Tip
  int tx0 = (int)(cx - tipW / 2), tx1 = (int)(cx + tipW / 2);
  for (int y = (int)baseY1 + 1; y <= (int)tipY1; y++)
  {
    int inset = (y > tipY1 - 2) ? 1 : 0;
    gHLine(tx0 + inset, tx1 - inset, y, BLACK);
  }
}

// ---------------- pickaxe ----------------
// Handle runs up-right from a pivot near the bottom-left corner; the head is
// an arc around that pivot, thick in the middle and tapering to two points.
static void drawPickaxe(int ox, int oy, int s, uint8_t c)
{
  const float S = s;
  const float px0 = ox + 0.12f * S, py0 = oy + 0.88f * S;   // pivot (handle butt)
  const float R = 0.92f * S;                                // head radius
  const float ux = 0.7071f, uy = -0.7071f;                  // handle direction
  const float span = 40.0f;                                 // head half-angle, degrees
  for (int y = oy - 1; y <= oy + s; y++)
  {
    for (int x = ox - 1; x <= ox + s; x++)
    {
      float dx = x + 0.5f - px0, dy = y + 0.5f - py0;
      // handle
      float t = dx * ux + dy * uy, lat = fabsf(-dx * uy + dy * ux);
      if (t >= 0 && t <= R - 0.05f * S && lat <= 0.075f * S + 0.4f) { gPx(x, y, c); continue; }
      // head
      float da = fabsf(atan2f(dy, dx) * 57.2958f + 45.0f);
      if (da <= span)
      {
        float th = 0.16f * S * (1 - powf(da / span, 1.6f)) + 0.03f * S;
        if (fabsf(hypotf(dx, dy) - R) <= th / 2 + 0.3f) gPx(x, y, c);
      }
    }
  }
}

// Small status dot: filled = online, ring = offline
static void drawStatusDot(int cx, int cy, int r, bool on)
{
  if (on) gFillCircle(cx, cy, r, BLACK);
  else    gRing(cx, cy, r, 2, BLACK, 15);
}
