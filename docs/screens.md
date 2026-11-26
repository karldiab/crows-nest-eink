# The screens

Every page has a black header with the page name, three page dots, and `Updated HH:MM` (when the shown data was
fetched) or `Offline HH:MM` (Home Assistant can't be reached; the data is from that time). A frame around the page
means you're in page mode. `--` means a value is missing or unavailable.

The units shown below are the defaults. The weather unit labels come from `config.h`.

Back to the [README](../README.md).

## Home

The title is `HOME_TITLE` from `config.h`.

**Top: outdoor and indoor climate**

| On screen | Meaning |
|---|---|
| Weather icon and text | Current condition from the weather entity (Rainy, Partly cloudy, ...) |
| Large temperature | Outdoor temperature |
| `Feels 10.8°  93%` | Feels-like temperature, then outdoor relative humidity |
| Two indoor slots (such as `OFFICE`, `BEDROOM`) | That room's temperature and relative humidity |

**Weather strip**

| Label | Meaning |
|---|---|
| `WIND km/h` | Wind speed and the compass direction it comes from, e.g. `3 WSW` |
| `GUST km/h` | Wind gust speed |
| `RAIN mm/h` | How hard it's raining right now |
| `UV` | UV index (strength of ultraviolet light) |
| `SUNRISE` / `SUNSET` | Local sunrise and sunset times |

**Light tiles** (one per room, plus an optional "All")

| Element | Meaning |
|---|---|
| Rounded box | The selected tile (lights mode) |
| Bulb | Off: gray. Low (under 34% brightness): soft glow. Medium (34 to 66%): brighter glow. High (67% and up): glow with rays. |
| Bar beside the bulb | Brightness of the lights that are on, averaged. One segment per level in `BRIGHTNESS_LEVELS`, filled from the bottom. |
| `2 of 4` | Lights on, out of the available lights in that room |

**Bottom line** (with mining on), for example `$58,668 · 8.12 TH/s · 2.25 KYRS/BLOCK`

| On screen | Meaning |
|---|---|
| `$58,668` | Bitcoin price in US dollars |
| `8.12 TH/s` | Combined hash rate of your miners, in terahashes per second |
| `2.25 KYRS/BLOCK` | Expected time for your miners to find a block on their own: 2.25 thousand years. Under 1,000 it reads `YRS/BLOCK`, and `MYRS/BLOCK` means millions of years. It's a statistical average, not a countdown. |

With mining off, the line shows air pressure, rain today and dew point instead.

## Weather

**Top:** the condition icon, outdoor temperature and condition text, plus:

| Label | Meaning |
|---|---|
| `Feels` | Feels-like temperature |
| `Dew` | Dew point: the temperature at which dew would form. Higher feels muggier. |
| `Hum` | Outdoor relative humidity |
| `Sun` | Solar radiation in W/m² (how strong the sunlight is right now) |

**Grid**

| Label | Meaning |
|---|---|
| `Rain rate` | How hard it's raining now, per hour |
| `Rain today / week` | Rain since midnight, then this week's total |
| `Wind / gust` + direction | Wind speed and gust speed; the letters are the compass direction |
| `Pressure` | Relative (sea-level) air pressure in hPa |
| `UV index` | Strength of ultraviolet light |
| `Sunrise / sunset` | Local times |

## Mining

The title has a pickaxe beside it. This page is hidden when `SHOW_MINING` is 0.

**Top**

| On screen | Meaning |
|---|---|
| Large number, `TH/s` | Combined hash rate of all miners, in terahashes (trillions of hashes) per second |
| `$58,668` | Bitcoin price in US dollars |
| `DIFF 134.8T` | Bitcoin network difficulty, in trillions. Higher means blocks are harder to find. |
| `148.6 W` | Combined power draw in watts |
| `18.2 J/TH` | Efficiency: joules of energy per terahash. Lower is better. |

**Miner table** (one row per miner)

| Column | Meaning |
|---|---|
| `MINER` | Miner name from `config.h` |
| `GH/s` | Its hash rate in gigahashes (billions of hashes) per second. 0 means it isn't mining. |
| `W` | Its power draw in watts |
| `ASIC` | Temperature of its mining chip, in degrees |
| `BEST` | Its best share ever: the highest difficulty it has solved. `M` is million, `G` billion, `T` trillion. |

**Bottom cells**

| Label | Meaning |
|---|---|
| `Years / block` | Expected years for your miners to find a block on their own (the full number behind `KYRS/BLOCK`) |
| `Sats / day` | Expected earnings per day in satoshis (1 BTC = 100,000,000 sats) at the current hash rate and difficulty |
| `USD / day` | The same estimate in US dollars |
| `Total hashes` | Lifetime hashes computed. `PH` is petahashes (10^15); past 1,000 PH it becomes `EH` (10^18), then `ZH`. |
| `Best share` | Highest difficulty solved by any miner. A share at or above the network difficulty finds a block. |
| `Total energy` | Lifetime electricity used, in kilowatt-hours |

The earnings figures are estimates calculated in Home Assistant, not payouts from a pool.
