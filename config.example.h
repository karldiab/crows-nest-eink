// =====================================================
// config.example.h: panel settings and the Home Assistant entities it shows.
//
// Copy this file to config.h (same folder) and edit it. config.h is
// gitignored; if it's missing, the sketch builds with this example instead.
//
// How to find entity IDs: Home Assistant > Settings > Devices & services >
// Entities (or Developer Tools > States). Copy the "Entity ID" column, e.g.
// "sensor.outdoor_temperature".
//
// Rules:
//   - Any entity you don't have: leave it "" (or delete the line). It shows "--".
//   - Numeric sensors should report plain numbers in the units below.
//   - At boot the panel prints the full template it sends to Home Assistant on
//     the serial monitor. Paste it into Developer Tools > Template to check
//     every value before flashing again.
// =====================================================
#pragma once

// ---------- Display ----------
#define HOME_TITLE          "Home"     // title on the first page
#define TEMP_UNIT           "C"        // shown after temperatures: "C" or "F"
#define WIND_UNIT           "km/h"     // label only; use whatever your sensor reports
#define RAIN_UNIT           "mm"
#define PRESSURE_UNIT       "hPa"

// ---------- Power LED ----------
//   1 = always on
//   2 = lit only while the screen refreshes (partial and full)
//   3 = lit only during full refreshes
//   4 = always off
#define POWER_LED_MODE      2

// ---------- Outdoor weather ----------
// A weather entity drives the icon and condition text (sunny, rainy, ...).
// The Met.no integration creates "weather.forecast_home" by default.
#define HA_WEATHER          "weather.forecast_home"

// A local weather station (Ecowitt, Netatmo, Ambient, ...) gives the best
// numbers. Without one, you can point these at template sensors that read
// the weather entity's attributes (see README).
#define HA_OUTDOOR_TEMP     "sensor.outdoor_temperature"
#define HA_FEELS_LIKE       "sensor.outdoor_feels_like"
#define HA_OUTDOOR_HUMIDITY "sensor.outdoor_humidity"
#define HA_DEW_POINT        "sensor.outdoor_dew_point"
#define HA_RAIN_RATE        "sensor.rain_rate"          // per hour
#define HA_RAIN_TODAY       "sensor.rain_today"
#define HA_RAIN_WEEK        "sensor.rain_this_week"
#define HA_WIND_SPEED       "sensor.wind_speed"
#define HA_WIND_GUST        "sensor.wind_gust"
#define HA_WIND_DIRECTION   "sensor.wind_direction"     // degrees, 0 = north
#define HA_UV_INDEX         "sensor.uv_index"
#define HA_PRESSURE         "sensor.pressure"
#define HA_SOLAR_RADIATION  "sensor.solar_radiation"    // W/m2

// Sunrise / sunset as a local time string like "7:42". Leave "" to use
// Home Assistant's built-in sun.sun entity (shows the NEXT sunrise/sunset).
#define HA_SUNRISE          ""
#define HA_SUNSET           ""

// ---------- Indoor climate (two slots on the Home page) ----------
#define INDOOR1_LABEL       "LIVING"                    // short, upper case reads best
#define HA_INDOOR1_TEMP     "sensor.living_room_temperature"
#define HA_INDOOR1_HUMIDITY "sensor.living_room_humidity"
#define INDOOR2_LABEL       "BEDROOM"
#define HA_INDOOR2_TEMP     "sensor.bedroom_temperature"
#define HA_INDOOR2_HUMIDITY "sensor.bedroom_humidity"

// ---------- Light tiles ----------
// Each tile is a Home Assistant AREA (Settings > Areas, labels & zones; the
// area ID is in the URL when you open an area, e.g. .../areas/area/kitchen).
// Every light assigned to the area, directly or through its device, belongs
// to the tile. The tile shows "2 of 3" lights on and their average brightness,
// and the buttons toggle or dim the whole area.
//
// Use nullptr as the area for a tile that covers every light in the house.
// 1 to 5 tiles; names of about 7 characters or less fit.
#define LIGHT_ROOMS \
  { "Living",  "living_room" }, \
  { "Kitchen", "kitchen" },     \
  { "Bedroom", "bedroom" },     \
  { "All",     nullptr }

// ---------- Brightness levels ----------
// Percent levels that hold MENU + rocker up/down steps through, lowest first (1 to 8).
// The bar next to each bulb has one segment per level. Most bulbs look
// brighter than their percentage at the low end, so uneven steps such as
// 10, 20, 40, 60, 100 often look more even than 20, 40, 60, 80, 100.
// Stepping below the lowest level turns the lights off.
#define BRIGHTNESS_LEVELS 20, 40, 60, 80, 100

// ---------- Mining (optional) ----------
// A page for Bitaxe / other ASIC miners. Set to 0 to drop the Mining page;
// the Home page then shows a weather line in its place.
#define SHOW_MINING              0

// Totals. Leave "" to have the panel work them out from the miners below
// (hash rate, power and efficiency can be derived).
#define HA_MINING_HASHRATE_TH    ""     // TH/s
#define HA_MINING_POWER          ""     // W
#define HA_MINING_EFFICIENCY     ""     // J/TH
#define HA_MINING_HASHES_TOTAL   ""     // PH
#define HA_MINING_ENERGY_TOTAL   ""     // kWh
#define HA_MINING_BEST_SHARE     ""     // text, e.g. "118.14 G"

// Bitcoin network and earnings estimates. Any source works; mempool.space's
// free API via REST sensors is an easy one.
#define HA_BTC_PRICE              ""    // USD
#define HA_BTC_DIFFICULTY         ""    // in T (trillions), e.g. 134.8
#define HA_MINING_YEARS_PER_BLOCK ""    // expected years to solo-find a block
#define HA_MINING_SATS_PER_DAY    ""    // expected sats/day
#define HA_MINING_USD_PER_DAY     ""    // expected USD/day

// One line per miner (1 to 3):
// { "Name", hash rate (GH/s), power (W), ASIC temp, best share (text) }
// Entity names below match the hass-bitaxe integration's usual pattern;
// check yours under Developer Tools > States.
#define MINERS \
  { "Bitaxe", "sensor.bitaxe_hash_rate", "sensor.bitaxe_power", \
    "sensor.bitaxe_asic_temperature", "sensor.bitaxe_best_difficulty" }
