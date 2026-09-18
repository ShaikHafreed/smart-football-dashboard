// Wi-Fi credentials for this board.
//
// Copy this file to `secrets.h` in the same folder and fill in your own
// networks. `secrets.h` is gitignored and must NEVER be committed -- real
// SSIDs and passwords previously lived directly in smart_football.ino,
// which published them to a public repository.
//
//   cp secrets.example.h secrets.h     (or copy/paste it in the Arduino IDE)
//
// The sketch will not compile without secrets.h -- that is deliberate, so a
// missing file fails loudly instead of silently flashing a board that can
// never reach Wi-Fi.
//
// Networks are tried in order at boot and on reconnect. Add a venue's
// network here ahead of an event instead of reflashing on-site.
#ifndef SMART_FOOTBALL_SECRETS_H
#define SMART_FOOTBALL_SECRETS_H

#define WIFI_NETWORKS { \
  {"your-wifi-ssid", "your-wifi-password"}, \
  /* {"venue-wifi-name", "venue-password"}, */ \
}

#endif
