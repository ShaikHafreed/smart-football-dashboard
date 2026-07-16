# ⚽ Smart Football AI

An IoT-powered football analytics platform. An ESP32 + MPU6050 sensor on the ball captures kick speed, spin, and force in real time; a web dashboard turns that into live telemetry, session history, and performance analytics for both players and coaches.

**Live app:** https://football.hafreedshaik.online (also reachable at https://smart-football-dashboard.vercel.app)

## Features

**Every account**
- Email/password and Google sign-in (Supabase Auth)
- Onboarding: name → date of birth → role (Player / Coach)
- Profile with avatar, editable details, and role switching at any time

**Player**
- Live dashboard — speed, spin, force, and distance streamed from the ESP32 in real time
- **My Performance** — personal bests, a live trend chart, and practice drills generated from your own data
- **Performance by Session** — every session broken down with a composite Best-Kick score, Max-Speed-Kick, and spin at each of those moments

**Coach**
- Full roster management (add/remove players, edit their DOB and avatar)
- Team analytics — session attendance and shot-type distribution (pie charts), team-wide speed/spin trend
- Per-player drill-down into their full session history, using the same session-breakdown view players see for themselves

## Architecture

```
Football (ESP32 + MPU6050)
        │  Wi-Fi, one HTTP POST per kick
        ▼
Flask backend (local, next to the hardware)
        │  GET /data  → polled every 1s for live dashboard cards
        │  POST /api/data → relayed into Supabase while a Session is active
        ▼
Supabase (Postgres + Auth)
        │  football_profiles / football_players / football_sessions / football_shots
        │  Row Level Security — every account only ever sees its own data
        ▼
React (Vite) frontend, deployed on Vercel
```

The Flask relay is deliberately local-only — it needs to be reachable by the ESP32 over the same Wi-Fi network, so it runs on whatever machine is near the hardware, not in the cloud. Everything else (auth, players, history, leaderboard, analytics) talks directly to Supabase and works anywhere, including the deployed site.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Framer Motion, Recharts, React Router v6 |
| Backend (hardware relay) | Flask, Python |
| Database / Auth | Supabase (Postgres, Row Level Security, Auth) |
| Hardware | ESP32, MPU6050 (accelerometer + gyroscope) |
| Hosting | Vercel (frontend) |

## Project structure

```
src/
  pages/              Route-level pages (Dashboard, CoachDashboard, PlayerAnalytics, Login, ...)
  components/
    layout/            Sidebar + app shell
    dashboard/          Live sensor cards, connection panel, charts, ball animation
    players/            Player detail modal
    performance/        Shared session-by-session breakdown (used by both roles)
  lib/
    supabaseClient.js   Supabase client init
    AuthContext.jsx      Session/profile state, role, auth actions
    performanceMetrics.js Composite Best-Kick scoring, Max-Speed-Kick

backend/
  server.py             Flask relay: receives ESP32 readings, serves live data, persists shots
  serial_bridge.py       Optional: read sensor data over USB serial instead of Wi-Fi
  requirements.txt

firmware/
  smart_football/smart_football.ino   ESP32 sketch: MPU6050 + vibration-based kick
                                       detection, push-button reset, error buzzer
```

## Getting started

### Prerequisites
- Node.js 18+
- Python 3.10+
- A Supabase project (or your own — see `.env.example`)

### Frontend
```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon/publishable key
npm run dev
```

### Backend (hardware relay)
```bash
cd backend
python -m venv venv
./venv/Scripts/activate      # or `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
python server.py
```

The Flask server listens on `http://127.0.0.1:5000` and expects the ESP32 to `POST /api/data` with `{ speed, spin, force, distance, shot }` after each detected kick.

### Hardware (ESP32)
Flash `firmware/smart_football/smart_football.ino` from the Arduino IDE. Update `ssid`, `password`, and `serverIP` (the machine running `server.py`, not a public address) at the top of the file, and confirm these pins match your actual wiring:

| Pin | Purpose |
|---|---|
| `VIB_PIN` (27) | Vibration sensor — signals a kick was detected |
| `RESET_PIN` (26) | Push button (wired to GND) — restarts the board, clearing any error/buzzer state |
| `BUZZER_PIN` (25) | Buzzer — sounds continuously on WiFi loss, MPU6050 init failure, or a failed send, until reset is pressed |

### Google sign-in
Requires a Google OAuth Client ID/Secret enabled under **Authentication → Providers → Google** in your Supabase project, with the redirect URI `<your-supabase-url>/auth/v1/callback`.

## Database

Four tables in Supabase Postgres, each with Row Level Security scoping every row to its owning account:

- `football_profiles` — one row per user (name, DOB, avatar, role)
- `football_players` — a coach's roster (or a player's own self-record)
- `football_sessions` — start/end time per training session
- `football_shots` — one row per detected kick (speed, spin, force, distance, shot type)

## Team

Shaik Hafreed · Meda Sai Nihal · Vedhesh P P
