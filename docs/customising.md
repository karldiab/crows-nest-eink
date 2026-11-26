# Customising

Back to the [README](../README.md).

Most behaviour is set by constants at the top of the sketch:

| Constant | Default | Meaning |
|---|---|---|
| `USE_LIGHT_SLEEP` | `true` | Light sleep between polls (WiFi off), or stay connected |
| `POLL_INTERVAL_MS` | 60 s | How often to fetch from Home Assistant |
| `MINOR_REFRESH_MIN_MS` | 10 min | Minimum gap between number-only refreshes |
| `QUIET_START_HOUR` / `QUIET_END_HOUR` | 23 / 6 | No number-only refreshes in this window (set equal to disable) |
| `AWAKE_AFTER_INPUT_MS` | 20 s | Stay awake with WiFi up after a press |
| `AUTO_FULL_EVERY` | 20 | Partial refreshes between full refreshes |
| `LONG_PRESS_MS` | 1 s | Hold time for MENU / EXIT long presses |
| `BRIGHTNESS_LEVELS` (in `config.h`) | 20, 40, 60, 80, 100 | Levels UP/DOWN step through |
| `EGG_SHOW_MS` | 60 s | How long an Easter egg photo stays up |
| `POWER_LED_MODE` (in `config.h`) | 2 | Power LED: 1 always on, 2 lit during any refresh, 3 lit during full refreshes, 4 always off |

**Other changes**
- **Entities, light tiles, units, mining, the power LED and the Home page title** are all in `config.h` (see
  [Home Assistant setup guide](home_assistant_setup/home-assistant-setup.md)).
- **Button pins:** the `*_KEY` defines in the sketch. If up and down feel reversed, swap `UP_KEY` and `DOWN_KEY`.
- **Layout and pages:** `renderHome()`, `renderWeather()` and `renderMining()` in the sketch.
- **More controls:** the panel already sends Home Assistant service calls for lights. The same pattern
  (`enqueueAction()` in the sketch) can call `climate.set_temperature`, `fan.turn_on`, `cover.open_cover` or any
  other service, so thermostats, ventilation and blinds are a small change away.

