# Home Assistant setup

Back to the [README](../../README.md).

This guide creates every Home Assistant entity the panel reads. The panel is modular: set up only the parts you want. Any slot you skip, or any entity that is `unknown` or `unavailable`, shows as `--` on the panel.

| Module | What you need | Custom YAML |
|---|---|---|
| [Weather](#1-weather) | A weather station integration and/or any `weather.*` entity | None |
| [Indoor climate](#2-indoor-climate) | Any temperature/humidity sensors | None |
| [Lights](#3-lights) | Lights assigned to areas | None |
| [Mining](#4-mining-bitaxe) | Bitaxe miners + the Bitaxe integration | `packages/bitaxe.yaml` |
| [Bitcoin and earnings](#5-bitcoin-network-and-earnings) | Internet access; mining module for earnings | `packages/bitcoin.yaml` |

Then see [SD card and recorder](#6-sd-card-and-recorder), [Panel config mapping](#7-panel-config-mapping) and [Troubleshooting](#8-troubleshooting).

### Example files

Only mining and Bitcoin need custom YAML. Complete, ready-to-copy files sit next to this guide.

**Bonus metrics.** Both packages also contain a long list of extra metrics that the panel doesn't use but that make great Home Assistant dashboards: daily and monthly hashes and energy, miners online, network hash rate, block height, the difficulty epoch and next retarget, fee rates, and accrued lifetime, daily and monthly earnings in sats and USD. They ship **commented out**, in the place they belong, so enabling one is just uncommenting it. See [4.5](#45-optional-extras) and [5.4](#54-optional-extras). Copy the ones you need into your `packages` folder, then edit the entity IDs marked in each file. The guide explains what each part does.

| File | Copy to | Needed for |
|---|---|---|
| [`configuration-snippet.yaml`](configuration-snippet.yaml) | merge into `configuration.yaml` | packages + recorder settings |
| [`bitaxe.yaml`](bitaxe.yaml) | `packages/bitaxe.yaml` | mining |
| [`bitcoin.yaml`](bitcoin.yaml) | `packages/bitcoin.yaml` | Bitcoin network and earnings |

---

## 0. Before you start

### How the panel talks to Home Assistant

- Every 60 s it renders one Jinja template through `POST /api/template`, authenticated with a long-lived access token.
- Numbers are read as `states('<entity>') | float(none)`. They must be **plain numbers in the units listed in this guide**. The panel does not convert units.
- Text values are read as the raw state string.
- Light control uses only `light.turn_on` (optionally with `brightness_pct`) and `light.turn_off`.
- Which entity fills each slot is set in `config.h` (see [section 7](#7-panel-config-mapping)).

Create the token under **your profile → Security → Long-lived access tokens**, put it in `secrets.h`, and keep it
out of version control. `/api/template` may need a token from an admin user. A long-lived token can do anything its
user can, so a dedicated user for the panel is a good idea.

### Units

The panel prints numbers exactly as Home Assistant reports them and adds the unit labels set in `config.h`
(`TEMP_UNIT`, `WIND_UNIT`, `RAIN_UNIT`, `PRESSURE_UNIT`; the defaults are °C, km/h, mm and hPa). It never converts.
So either keep those sensors metric, or set the labels to match yours (for example `TEMP_UNIT "F"` and
`WIND_UNIT "mph"`). You can also change a single sensor's display unit: open the entity → ⚙ → *Unit of measurement*.

Mining and Bitcoin values have fixed units, whatever your unit system: GH/s per miner, W, TH/s, J/TH, PH, kWh, and
difficulty in T (trillions).

### Enable packages

The custom entities ship as *packages*: self-contained YAML files that can each hold sensors, templates and helpers. Add this to `configuration.yaml` once (also in [`configuration-snippet.yaml`](configuration-snippet.yaml)):

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Then create a `packages` folder **next to `configuration.yaml`** (the same folder, not a subfolder of something else) and put the package files in it.

After adding or changing a package: **Developer tools → YAML → Check configuration**, then **restart** Home Assistant. New template, REST, integral and utility-meter entities need a full restart, not a YAML reload.

### Finding entity IDs

Every YAML block below has entity IDs that you may need to change to match yours. To look them up, go to **Settings → Devices & services → Entities** and search, or use **Developer tools → States**.

---

## 1. Weather

No custom YAML. Map the panel's weather slots straight to entities you already have (see [section 7](#7-panel-config-mapping)).

- **Condition icon (`HA_WEATHER`):** any `weather.*` entity. The default **Met.no** integration creates `weather.forecast_home`.
- **Outdoor numbers:** a weather station integration gives the most complete set. The reference build uses an Ecowitt station through the official **Ecowitt** integration (**Settings → Devices & services → Add integration → Ecowitt**, then set the station's *Customized* upload to the server and path it shows: protocol *Ecowitt*, plain HTTP). Its entities are named after the station model, for example `sensor.<model>_outdoor_temperature` and `sensor.<model>_rain_rate`. Netatmo, Ambient Weather and similar integrations work the same way.
- **Sunrise and sunset:** leave `HA_SUNRISE` / `HA_SUNSET` blank and the panel reads the built-in `sun.sun` entity (the *next* sunrise and sunset).

**No weather station?** Leave the outdoor slots blank (they show `--`), or expose a weather entity's attributes as sensors, because the panel reads sensor states, not attributes. One template sensor per value you want, for example:

```yaml
template:
  - sensor:
      - name: "Outdoor Temperature"
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement
        state: "{{ state_attr('weather.forecast_home', 'temperature') }}"
```

The same pattern works for `humidity`, `pressure`, `wind_speed`, `wind_bearing`, `dew_point` and `uv_index`, depending on the provider. Forecast providers don't report rain rate, rain totals or solar radiation.

---

## 2. Indoor climate

No custom entities. The panel has two indoor slots, each a temperature (°C) and humidity (%) sensor from any integration: a Zigbee/Thread room sensor, a weather station's indoor console, a thermostat, and so on. Map their entity IDs to `HA_INDOOR1_TEMP` / `HA_INDOOR1_HUMIDITY` and `HA_INDOOR2_TEMP` / `HA_INDOOR2_HUMIDITY`.

---

## 3. Lights

The panel toggles and dims lights directly through Home Assistant, using **areas**. No custom entities, groups or helpers are needed.

### Set up

1. Assign each light (or its device) to an area: open the device → ✏ → *Area*. Prefer setting the area on the **device**; an area set directly on an entity overrides the device's.
2. Put each tile's area ID in `config.h` (`LIGHT_ROOMS`). The area ID is the last part of the URL when you open **Settings → Areas, labels & zones → <area>** (for example `living_room`). An "All" tile uses `nullptr` and covers every `light.*` entity.

Lights you add to an area later are picked up automatically.

### What the panel does with an area

| Panel action | Home Assistant side |
|---|---|
| Tile shows `2 of 4` | `area_entities()` → lights that are on, out of the area's available lights (unavailable ones are ignored) |
| Brightness bar | Average `brightness` attribute of the lights that are on |
| Toggle a tile | `light.turn_on` / `light.turn_off` with the tile's `area_id` (or `entity_id: all` for an "All" tile) |
| Brighter / dimmer | `light.turn_on` with `brightness_pct` set to the next level in `BRIGHTNESS_LEVELS` (`config.h`), sent only to the lights in that tile that are currently on. A dark tile stepped up turns its whole area on at the lowest level; stepping below the lowest level sends `light.turn_off`. On an "All" tile every lit light is set to the same level. |
| Goodnight (hold EXIT) | `light.turn_off` with `entity_id: all` |

### Things to avoid

- **Light groups inside an area.** A group entity in the same area as its member lights is counted twice and skews the brightness average. Leave groups out of the panel's areas.
- **Dead lights.** Unavailable lights are left out of the count, but an old light that still reports a state is
  counted and still receives commands. Delete it, disable it, or remove it from the area.
- **On/off-only lights** (smart plugs, some switches) toggle fine but report no brightness, so they don't contribute to the bar.

---

## 4. Mining (Bitaxe)

### 4.1 Install the Bitaxe integration

Raw miner data comes from the community **Bitaxe** integration: <https://github.com/DerMiika/Bitaxe-HA-Integration>

1. **HACS → Integrations → ⋮ → Custom repositories**, add `https://github.com/DerMiika/Bitaxe-HA-Integration` (category *Integration*), install it, and restart. (Manual alternative: copy the repository's `custom_components/bitaxe` folder into your config folder's `custom_components/` and restart.)
2. **Settings → Devices & services → Add integration → Bitaxe**. Enter the miner's IP address and a name. This guide uses the name `bitaxe` for the first miner.
3. Repeat step 2 for each miner, with a unique name each time (`bitaxe2`, `bitaxe3`, …).

Each miner gets these sensors, named `"<sensor> (<miner name>)"`:

| Sensor | Unit | Notes |
|---|---|---|
| Hash Rate | GH/s | |
| Power Consumption | W | |
| Temperature ASIC | °C | |
| Temperature VR | °C | voltage regulator |
| All-Time Best Difficulty | text | e.g. `87.94 G` (suffix k/M/G/T/P/E). Not a number |
| Best Difficulty Since System Boot | text | same format |
| Uptime | text | e.g. `0d 3h 43m 31s`. Changes on every poll |
| Shares Accepted / Shares Rejected | count | |
| Fan Speed / Fan RPM | % / RPM | |

**Entity IDs** are generated by Home Assistant from that name, so for a miner named `bitaxe` expect IDs like `sensor.bitaxe_hash_rate_bitaxe`. Depending on your HA version and the device's area, the area name may be prefixed (for example `sensor.living_room_bitaxe_hash_rate_bitaxe`). **Look up the real IDs** (search your miner name in the Entities list) and use them in the YAML below.

**Keep polling on.** Leave *Enable polling for updates* enabled in the integration's system options. With it disabled, the integration stops fetching, and `homeassistant.update_entity` does not trigger a fetch either. The integration polls about every 30 s.

### 4.2 Why there is a `bitaxe.yaml`

The raw sensors are not panel-ready:

- When a miner goes offline, the integration keeps showing its **last** hash rate and power instead of 0.
- The API occasionally returns **absurd spikes**, which wreck lifetime counters.
- Best difficulty is **text**, so it can't be compared numerically across miners.
- There are no fleet totals, efficiency or lifetime counters.

`bitaxe.yaml` fixes all of this:

```
raw integration sensors
  └─ online check (uptime changed in the last 180 s)
       └─ clean per-miner hash rate + power (0 when offline, out-of-range readings dropped)
            └─ fleet totals (hash rate, power, efficiency, TH/s)
                 └─ lifetime counters (integrals): hashes (PH), energy (kWh)
  └─ best difficulty: parse "87.94 G" → number → fleet max → "118.14 G" display text
```

### 4.3 `packages/bitaxe.yaml`

Full file: [`bitaxe.yaml`](bitaxe.yaml), saved as `packages/bitaxe.yaml`. It has **one miner** named `bitaxe`. Before saving:

1. Replace the five raw entity IDs marked `# RAW` with yours.
2. Set the per-miner range bounds for your model (see the comments). A reading outside the range is ignored and the last good value is kept.

Every block in the file is commented, so read it top to bottom before copying.

Entities this creates:

| Entity | Unit | Used by panel |
|---|---|---|
| `binary_sensor.bitaxe_online` | on/off | dependency |
| `sensor.bitaxe_hash_rate` | GH/s | per-miner hash rate |
| `sensor.bitaxe_power` | W | per-miner power |
| `sensor.miners_total_hash_rate` | GH/s | dependency (also feeds `bitcoin.yaml`) |
| `sensor.miners_hash_rate_th` | TH/s | `HA_MINING_HASHRATE_TH` |
| `sensor.miners_total_power` | W | `HA_MINING_POWER` |
| `sensor.miners_efficiency` | J/TH | `HA_MINING_EFFICIENCY` |
| `sensor.miners_total_hashes` | PH (lifetime) | `HA_MINING_HASHES_TOTAL` |
| `sensor.miners_total_energy` | kWh (lifetime) | `HA_MINING_ENERGY_TOTAL` |
| `sensor.miners_total_hashes_gh` | GH | dependency, exclude from recorder |
| `sensor.miners_best_difficulty` | number | dependency |
| `sensor.miners_best_difficulty_display` | text, e.g. `118.14 G` | `HA_MINING_BEST_SHARE` |

The lifetime counters start at 0 when created. There is no backfill.

### 4.4 Adding more miners

For each additional miner (say `bitaxe2`):

1. Copy the `Bitaxe Online` binary sensor and the `Bitaxe Hash Rate` / `Bitaxe Power` pair. Rename them (`Bitaxe2 Online`, `Bitaxe2 Hash Rate`, …), give them new `unique_id`s, point the `# RAW` lines at `bitaxe2`'s entities, and update the `binary_sensor.bitaxe2_online` references inside the pair.
2. Add `states('sensor.bitaxe2_hash_rate') | float(0)` to the **Miners Total Hash Rate** list, and `sensor.bitaxe2_power` to **Miners Total Power**.
3. Add `'sensor.bitaxe2_all_time_best_difficulty_bitaxe2'` to the **Miners Best Difficulty** list.

### 4.5 Optional extras

`bitaxe.yaml` includes these, commented out where they belong. To enable one, remove the leading `# ` from each line of its block and restart.

| Entity | What it is | Where in the file |
|---|---|---|
| `sensor.miners_online` | Number of miners currently hashing | template sensor list, after Miners Efficiency. Add each miner's `binary_sensor` |
| `sensor.miners_hashes_daily` / `_monthly` | Hashes (PH) since midnight / since the 1st | `utility_meter:` block at the bottom |
| `sensor.miners_energy_daily` / `_monthly` | Energy (kWh) since midnight / since the 1st | same block |

`sensor.miners_total_energy` (always on) has the energy device class, so you can add it to the Energy dashboard as an individual device to see mining's share of your usage. The per-miner raw sensors (VR temperature, fan speed, shares, uptime) are also worth putting on a dashboard as they are.

---

## 5. Bitcoin network and earnings

### 5.1 How the data gets into Home Assistant

Everything comes from the free, keyless [mempool.space REST API](https://mempool.space/docs/api/rest) through Home Assistant's built-in **RESTful** integration (`rest:` in YAML). Each `resource` is one HTTP GET, made every `scan_interval` seconds. One request can feed several sensors, each with its own `value_template`:

```yaml
rest:
  - resource: https://mempool.space/api/v1/prices    # one request...
    scan_interval: 300                               # ...every 5 minutes
    sensor:
      - name: "BTC Price USD"                         # ...feeds one or more sensors
        value_template: "{{ value_json.USD }}"         # value_json = parsed JSON body
```

- JSON responses are available as `value_json`. Plain-text responses (such as the block height, which is a bare integer) are available as `value`.
- REST sensors fetch once at startup, then on the interval. Expect `unavailable` until the first response arrives.
- The package makes **3 requests every 5 minutes** as shipped, and up to 6 with every optional block enabled. mempool.space rate-limits heavy users (HTTP 429), so don't poll aggressively.

Endpoints used:

| Endpoint | Gives | Required for |
|---|---|---|
| `/api/v1/prices` | BTC price in USD and other currencies | price, USD earnings |
| `/api/v1/mining/hashrate/3d` | `currentDifficulty`, `currentHashrate` | difficulty, all earnings |
| `/api/v1/mining/reward-stats/144` | total reward and fees (sats) over the last 144 blocks | all earnings |
| `/api/blocks/tip/height` | block height (plain text) | optional |
| `/api/v1/difficulty-adjustment` | epoch progress, next retarget estimate, average block time | optional |
| `/api/v1/fees/recommended` | fee rates (sat/vB) | optional |

### 5.2 The earnings model

Earnings are **expected value**, calculated continuously from your current hash rate:

```
blocks per second (your share) = hash_rate / (difficulty × 2^32)
sats per hour                  = blocks/s × 3600 × avg_block_reward_sats × (1 − pool_fee)
expected time to find a block  = difficulty × 2^32 / hash_rate
```

- `avg_block_reward` is the 144-block (about one day) average of subsidy plus fees, which smooths out fee spikes.
- `pool_fee` is a helper you set in the UI (`input_number.mining_pool_fee`, default 0%).
- This approximates an FPPS-style pool payout. PPLNS pools and solo mining vary around it. Solo, your real income is 0 until you find a block. "Years to find a block" is the solo expectation.
- The rate is integrated over time (left Riemann sum) to produce accrued sats and USD.

### 5.3 `packages/bitcoin.yaml`

**Depends on** `sensor.miners_total_hash_rate` (GH/s) from `bitaxe.yaml`. Without the mining module, point the `Mining Sats Per Hour` template at any hash-rate sensor in GH/s, or skip the earnings section. The network sensors work on their own.

Full file: [`bitcoin.yaml`](bitcoin.yaml), saved as `packages/bitcoin.yaml`. The active YAML is exactly what the panel needs. Everything marked **OPTIONAL** is commented out (see [5.4](#54-optional-extras)).

Every block in the file is commented, so read it top to bottom before copying.

Entities the panel reads:

| Entity | Unit | Slot |
|---|---|---|
| `sensor.btc_price_usd` | USD | `HA_BTC_PRICE` |
| `sensor.btc_difficulty` | T (trillions), e.g. `134.824` | `HA_BTC_DIFFICULTY` |
| `sensor.mining_years_to_find_block` | years (unavailable at 0 hash rate) | `HA_MINING_YEARS_PER_BLOCK` |
| `sensor.mining_sats_per_day` | sats/day | `HA_MINING_SATS_PER_DAY` |
| `sensor.mining_usd_per_day` | USD | `HA_MINING_USD_PER_DAY` |

Also created (dependencies): `sensor.btc_avg_block_reward`, `input_number.mining_pool_fee`, `sensor.mining_sats_per_hour` and `sensor.mining_usd_per_hour`.

USD sensors use `device_class: monetary`, so Home Assistant's UI shows them with a `$`. The state the panel reads is still a plain number. HA only allows the `total` state class (or none) on monetary sensors, which is why the USD rate sensors have no `state_class`.

Set your pool fee under **Settings → Devices & services → Helpers → Mining pool fee**.

### 5.4 Optional extras

`bitcoin.yaml` includes these, commented out where they belong. To enable one, remove the leading `# ` from each line of its block and restart.

| Entities | What they are | Cost |
|---|---|---|
| `sensor.btc_network_hash_rate` | Network hash rate (EH/s) | same request as difficulty |
| `sensor.btc_avg_fees_per_block`, `sensor.btc_fee_share_of_reward` | Average fees per block (BTC) and fees as a share of the block reward (%) | same request as block reward |
| `sensor.btc_block_height` | Current block height | +1 request |
| `sensor.btc_epoch_progress`, `sensor.btc_difficulty_change_estimate`, `sensor.btc_blocks_to_retarget`, `sensor.btc_hours_to_retarget`, `sensor.btc_average_block_time` | Progress through the 2016-block difficulty epoch, projected next adjustment (%), blocks and hours left, average block time this epoch | +1 request |
| `sensor.btc_fee_fastest`, `sensor.btc_fee_economy` | Recommended fee rates (sat/vB) | +1 request |
| `sensor.mining_sats_earned`, `sensor.mining_usd_earned` | Accrued lifetime earnings | needs the two `integration` sensors (block near the bottom) |
| `sensor.mining_sats_daily` / `_monthly`, `sensor.mining_usd_daily` / `_monthly` | Earnings since midnight / since the 1st | needs the accrued earnings above |

Enable the accrual blocks together: the two "Earned" template sensors, the `sensor:` integration block, then the `utility_meter:` block. Accrued totals start at 0 when created.

---

## 6. SD card and recorder

Home Assistant on an SD card wears it out with frequent database writes. The recorder writes every state change of every entity by default, and the miners update about every 30 s.

The panel reads **live** states only, so nothing it uses needs history. Add a `recorder:` block to `configuration.yaml` (there can only be one, so merge it with any you already have). It is also in [`configuration-snippet.yaml`](configuration-snippet.yaml):

```yaml
recorder:
  commit_interval: 30        # batch writes every 30 s instead of every 5 s
  purge_keep_days: 10
  exclude:
    entity_globs:
      # Raw Bitaxe entities: one line per miner (match your real IDs)
      - sensor.*_bitaxe
    entities:
      # Intermediate sensors that change on every poll
      - sensor.miners_total_hashes_gh
      - sensor.mining_sats_per_hour
      - sensor.mining_usd_per_hour
      - sensor.mining_sats_integral   # only if accrual is enabled
      - sensor.mining_usd_integral    # only if accrual is enabled
  # Optional: keep history for a few raw sensors despite the glob above
  # include:
  #   entities:
  #     - sensor.bitaxe_temperature_asic_bitaxe
```

Notes:

- Excluded entities still work live. They just have no history graphs.
- Integrals and utility meters restore their values after a restart from HA's own state storage, not the recorder, so excluding them is safe.
- The clean per-miner sensors, fleet totals and lifetime counters stay recorded. Exclude them too if you don't want any mining history.
- Polling interval does not wear the card. Recorder writes do. Leave integration polling at its default.

---

## 7. Panel config mapping

Reference values for `config.h`. Leave a slot blank to show `--`.

| Config name | Entity (as named in this guide) | Format |
|---|---|---|
| `HA_WEATHER` | `weather.forecast_home` | condition string (`sunny`, `rainy`, …) |
| `HA_OUTDOOR_TEMP` | station or template sensor | °C |
| `HA_FEELS_LIKE` | station sensor | °C |
| `HA_OUTDOOR_HUMIDITY` | station or template sensor | % |
| `HA_DEW_POINT` | station or template sensor | °C |
| `HA_RAIN_RATE` | station sensor | mm/h |
| `HA_RAIN_TODAY` | station sensor | mm |
| `HA_RAIN_WEEK` | station sensor | mm |
| `HA_WIND_SPEED` | station or template sensor | km/h |
| `HA_WIND_GUST` | station or template sensor | km/h |
| `HA_WIND_DIRECTION` | station or template sensor | degrees, 0 = north |
| `HA_UV_INDEX` | station or template sensor | number |
| `HA_PRESSURE` | station or template sensor | hPa |
| `HA_SOLAR_RADIATION` | station sensor | W/m² |
| `HA_SUNRISE` / `HA_SUNSET` | blank (uses `sun.sun`), or a sensor with a local time string | text, at most 7 characters |
| `HA_INDOOR1_TEMP` / `_HUMIDITY` | any sensor | °C / % |
| `HA_INDOOR2_TEMP` / `_HUMIDITY` | any sensor | °C / % |
| Light tiles | area IDs, e.g. `living_room` | |
| `HA_MINING_HASHRATE_TH` | `sensor.miners_hash_rate_th` | TH/s |
| `HA_MINING_POWER` | `sensor.miners_total_power` | W |
| `HA_MINING_EFFICIENCY` | `sensor.miners_efficiency` | J/TH |
| `HA_MINING_HASHES_TOTAL` | `sensor.miners_total_hashes` | PH, lifetime |
| `HA_MINING_ENERGY_TOTAL` | `sensor.miners_total_energy` | kWh, lifetime |
| `HA_MINING_BEST_SHARE` | `sensor.miners_best_difficulty_display` | text, at most 15 characters |
| `MINERS[]` hash rate | `sensor.bitaxe_hash_rate` | GH/s |
| `MINERS[]` power | `sensor.bitaxe_power` | W |
| `MINERS[]` ASIC temperature | raw `Temperature ASIC` sensor | °C |
| `MINERS[]` best share | raw `All-Time Best Difficulty` sensor | text |
| `HA_BTC_PRICE` | `sensor.btc_price_usd` | USD |
| `HA_BTC_DIFFICULTY` | `sensor.btc_difficulty` | T |
| `HA_MINING_YEARS_PER_BLOCK` | `sensor.mining_years_to_find_block` | years |
| `HA_MINING_SATS_PER_DAY` | `sensor.mining_sats_per_day` | sats/day |
| `HA_MINING_USD_PER_DAY` | `sensor.mining_usd_per_day` | USD |

`HA_MINING_HASHRATE_TH`, `HA_MINING_POWER` and `HA_MINING_EFFICIENCY` are optional: if blank, the panel derives them from the `MINERS[]` entries.

**Check before flashing.** At boot the panel prints the exact template it sends on the serial monitor (115200
baud). Paste it into **Developer tools → Template**: the result should be JSON, with `null` wherever an entity is
missing, misspelled or not a number. It's the quickest way to find a wrong ID.

**Recommended creation order:** packages enabled → Bitaxe integration (and miners) → `bitaxe.yaml` → restart → check the clean sensors have values → `bitcoin.yaml` → restart → recorder excludes → restart.

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| None of the package's entities exist | The `packages` folder isn't next to `configuration.yaml`, or `packages: !include_dir_named packages` is missing. Check **Settings → System → Logs** for `Invalid config`. |
| Clean miner sensors stuck at 0, `*_online` is off | The `# RAW` uptime entity ID is wrong, or integration polling is disabled. Check the raw uptime sensor changes every ~30 s in Developer tools → States. |
| Clean hash rate frozen at one value | Raw readings are outside your range bounds. Raise the upper bound for your model. |
| `miners_best_difficulty` stays `unknown` | A raw best-difficulty entity ID in the list is wrong. |
| `btc_*` sensors `unavailable` | No internet from HA, the first poll hasn't happened yet (wait up to 5 min), or mempool.space is rate-limiting you (`429` in the logs). |
| Earnings `unavailable` | `sensor.miners_total_hash_rate`, `sensor.btc_difficulty` or `sensor.btc_avg_block_reward` has no value yet. |
| A "unit changed" or "state class" repair appears | Statistics were recorded under an older definition. Open the repair and choose to delete the old statistics. |
| Panel shows `--` for a slot | The entity is blank in `config.h`, misspelled, `unknown`/`unavailable`, or not a plain number. Paste the boot template into Developer tools → Template to see which. |
| Light tile shows too many lights | A light group, or an old light that still reports a state, is in the area. Unavailable lights are already ignored. |
