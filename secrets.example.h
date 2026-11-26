// =====================================================
// secrets.example.h: template for secrets.h
//
// Copy this file to secrets.h (same folder) and fill in real values.
// secrets.h is gitignored. Never commit it: the HA token has the full
// rights of the HA user that created it.
//
// (Arduino can't read a .env file at compile time, so this header plays
// that role.)
// =====================================================
#pragma once

// ---------- WiFi ----------
#define WIFI_SSID      "your-wifi-name"
#define WIFI_PASSWORD  "your-wifi-password"

// ---------- Home Assistant ----------
// HA runs on port 80 on this network, so no :8123
#define HA_BASE_URL    "http://192.168.68.111"
// Profile -> Security -> Long-lived access tokens -> Create token
#define HA_TOKEN       "paste-long-lived-access-token-here"

// ---------- Static IP ----------
// Set USE_STATIC_IP to 0 to use DHCP instead.
// Pick an address outside the Deco's DHCP pool (Deco app -> More ->
// Advanced -> DHCP Server shows the range), or reserve it in the Deco app.
// Deco defaults to 192.168.68.1 with a /22 mask (255.255.252.0); confirm
// in the same screen.
#define USE_STATIC_IP  1
#define PANEL_IP       192, 168, 68, 60
#define PANEL_GATEWAY  192, 168, 68, 1
#define PANEL_SUBNET   255, 255, 252, 0
#define PANEL_DNS      192, 168, 68, 1
