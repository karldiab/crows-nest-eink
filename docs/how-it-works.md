# How it works

Back to the [README](../README.md).

**Refresh policy.** Each update renders the frame into a 15 KB buffer twice: once without the time stamp, to compare
with what's on the panel, and once for real.
- **No difference:** no refresh.
- **Significant change** (input, light state or brightness, weather condition, offline status): partial refresh now.
- **Numbers only:** deferred until at least `MINOR_REFRESH_MIN_MS` (10 min) since the last refresh, and skipped during quiet hours (23:00 to 06:00 by default).

**Ghosting fix.** The controller only drives pixels that differ between its "new" and "previous" memories. After every
full refresh, the sketch pushes the same frame again as a partial so both memories match. Without that, the first
partial after a full refresh leaves ghosts.

**Responsiveness.**
- Commands go to Home Assistant before the screen redraws, so the light reacts first.
- Rapid presses are coalesced into one redraw.
- After a command the panel re-fetches at 1.5 s and 6.5 s to confirm the real state.
- A FreeRTOS task on core 0 polls the buttons every 5 ms and queues debounced press/release events with
  timestamps. The main loop on core 1 handles them in order, so presses made during a refresh or an HTTP request
  are processed right after it, and short vs long presses are judged from the real timestamps.

**Power.** ESP-IDF can't keep WiFi associated through manual light sleep, and the Arduino core is built without
automatic light sleep. So the panel switches WiFi off, light-sleeps until the next poll (default 60 s) or a button, then
reconnects with a static IP and the cached BSSID and channel. Set `USE_LIGHT_SLEEP = false` to stay connected instead.

**Talking to Home Assistant.** One `POST /api/template` per poll returns everything as compact JSON, so there are no
extra entities or recorder writes. The template is built from `config.h` at boot and printed on the serial monitor.
Lights are controlled with `light.turn_on` / `light.turn_off` on areas; see the
[Home Assistant guide](home_assistant_setup/home-assistant-setup.md#3-lights).

