# Troubleshooting

Back to the [README](../README.md).

| Symptom | Fix |
|---|---|
| Serial monitor is silent | Set **USB CDC On Boot: Disabled** and use 115200 baud. |
| `HA 401: check HA_TOKEN` on screen | The token is wrong or expired, or `/api/template` needs an admin user's token. |
| `HA unreachable (-1)` | Check `HA_BASE_URL`, including the port (`:8123` unless you changed it). |
| `WiFi connect failed` | Check the SSID and password, and that the static IP, gateway and subnet match your network. Try `USE_STATIC_IP 0`. |
| Some values show `--` | Those entities don't exist, are unavailable or aren't numbers. Paste the boot template into Developer Tools ▸ Template to see which. |
| A light tile shows `--` | The area ID is wrong, or the area has no available lights. |
| Light counts look doubled | The area contains a light group as well as its members. |
| Faint ghost images | Hold MENU for 1 s for a full refresh. Lower `AUTO_FULL_EVERY` if it happens often. |
| No brightness bar on a room | Its lights are off or don't report brightness (on/off-only plugs). |
| Upload hangs at "Connecting…" | Hold BOOT, tap RESET, release BOOT, then upload. |
| MENU + EXIT does nothing | Neither `easter_eggs.h` nor `easter_eggs_example.h` is in the sketch folder, or the file has no images. |

For problems on the Home Assistant side (packages not loading, miner or Bitcoin sensors `unavailable`), see the
[Home Assistant guide's troubleshooting](home_assistant_setup/home-assistant-setup.md#8-troubleshooting).

