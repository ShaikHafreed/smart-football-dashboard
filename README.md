# ⚽ Smart Football AI

An IoT-powered football analytics platform. An ESP32 + MPU6050 sensor inside the ball captures each strike as it happens - spin in rpm, peak impact in g, and a strike index - and a web dashboard turns that into live telemetry, session history, and performance analytics for players and coaches.

**Live app:** https://football.hafreedshaik.online (also reachable at https://smart-football-dashboard.vercel.app)

## Features

**Every account**
- Email/password and Google sign-in (Supabase Auth)
- Onboarding: name → date of birth → role (Player / Coach)
- Profile with avatar, editable details, and role switching at any time

**Player**
- Live dashboard — spin (rpm), impact (g) and a strike index streamed from the ESP32 in real time (see [Measurements](#measurements-and-calibration))
- **My Performance** — personal bests, a live trend chart, and practice drills generated from your own data
- **Performance by Session** — every session broken down with a composite Best-Kick score, Max-Speed-Kick, and spin at each of those moments

**Coach**
- Full roster management (add/remove players, edit their DOB and avatar)
- Team analytics — session attendance and shot-type distribution (pie charts), team-wide speed/spin trend
- Per-player drill-down into their full session history, using the same session-breakdown view players see for themselves

## Architecture

```
Football (ESP32 + MPU6050)
        │  Wi-Fi (any network with internet — HTTPS), one POST per kick
        ▼
Flask backend, deployed on Render
        │  GET /data  → polled every 1s for live dashboard cards
        │  POST /api/data → relayed into Supabase while a Session is active
        ▼
Supabase (Postgres + Auth)
        │  football_profiles / football_players / football_sessions / football_shots
        │  Row Level Security — every account only ever sees its own data
        ▼
React (Vite) frontend, deployed on Vercel
```

Earlier versions pointed the ESP32 at the Flask relay's local IP address, which only worked when the ball and the laptop running Flask were on the *same* Wi-Fi network — a college, public, or different home network couldn't reach it (private IPs aren't routable across networks, and many public/campus Wi-Fi networks block device-to-device traffic outright). Deploying Flask publicly (see `backend/render.yaml`) removes that constraint: the ESP32 just needs internet access, from anywhere. The frontend's `VITE_FLASK_URL` should point at the same deployed URL — see `.env.example`.

## Tech stack

### Frontend
- **React 19** + **Vite** — UI and build tooling, with the React Compiler (`babel-plugin-react-compiler`) enabled for automatic memoization
- **React Router v7** — client-side routing, including role-based route branching (Player vs. Coach)
- **Tailwind CSS 3** — utility-first styling, with `class-variance-authority` / `tailwind-merge` for composable component variants
- **Framer Motion** — page transitions, entrance animations, the live ball-impact pulse
- **Recharts** — the live performance trend chart, session speed/spin history, and coach team-analytics pie/line charts
- **@supabase/supabase-js** — auth, database queries, and realtime session/profile state (`src/lib/AuthContext.jsx`)
- **lucide-react** — icon set
- **date-fns** — date formatting (session timestamps, profile DOB/age)
- **Radix UI primitives** (`@radix-ui/react-slot`) — accessible building blocks for the UI component layer

### Backend (hardware relay)
- **Flask** (Python) — receives ESP32 readings, serves the live `/data` polling endpoint, and relays detected kicks into Supabase
- **Flask-CORS** — allows the browser frontend (any origin) to call the relay
- **gunicorn** — production WSGI server used on Render (Flask's built-in dev server isn't used in production)
- **python-dotenv** — loads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `.env` locally
- **requests** — forwards each detected shot to Supabase's REST API

### Database & Auth
- **Supabase** — hosted Postgres database, authentication, and instant REST API (PostgREST)
  - **Auth**: email/password and Google OAuth sign-in
  - **Row Level Security (RLS)** on every table — each account can only ever read or write its own rows
  - Four tables: `football_profiles`, `football_players`, `football_sessions`, `football_shots` (see [Database](#database) below)

### Hardware / Firmware
- **ESP32** — Wi-Fi microcontroller running the onboard logic (`firmware/smart_football/smart_football.ino`)
- **MPU6050** — 3-axis accelerometer + 3-axis gyroscope, read over I²C at ±16 g and ±2000 °/s, sampled across a short window around each impact
- **Vibration sensor** — digital trigger that detects the instant of ball impact (kicks are only measured and sent on a real hit, not continuously)
- Arduino libraries: `WiFi.h`, `WiFiClientSecure.h` (HTTPS), `HTTPClient.h`, `Wire.h` (I²C), `MPU6050.h`

### Hosting & infrastructure
- **Vercel** — frontend hosting, deployed from this GitHub repo on every push to `main`
- **Render** — public hosting for the Flask relay (`backend/render.yaml`), so the ESP32 can reach it over HTTPS from any Wi-Fi network with internet, not just one local network
- **Supabase Cloud** — managed Postgres + Auth
- **Custom domain** — `football.hafreedshaik.online`, DNS managed via Hostinger, pointed at Vercel
- **GitHub** — source control and CI trigger for Vercel deploys

### Tooling
- **Vitest** — unit tests (`npm test`)
- **ESLint** — linting (`eslint.config.js`)
- **`tools/benchmark/`** — runs the real migrations against a disposable
  Postgres container and measures the app's own queries at 300k and ~1M
  synthetic shots. Never point it at production.
- **Arduino IDE** — firmware development and flashing
- **Git / GitHub** — version control

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
  smart_football/smart_football.ino   ESP32 sketch: MPU6050 + vibration-based kick detection
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

The Flask server listens on `http://127.0.0.1:5000` locally and expects the ESP32 to `POST /api/data` with `{ speed, spin, force, distance, shot }` after each detected kick.

### Deploying the backend (so it works on any Wi-Fi, not just one network)
1. Push this repo to GitHub (already done if you're reading this from there).
2. In the [Render dashboard](https://dashboard.render.com), **New → Blueprint**, connect the repo — it reads `backend/render.yaml` and configures the service automatically.
3. Set the two environment variables it asks for (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — same values as `backend/.env`.
4. Deploy. Note the resulting URL (e.g. `https://smart-football-backend.onrender.com`).
5. Put that host into `firmware/smart_football/smart_football.ino`'s `serverHost`, and into `VITE_FLASK_URL` (both locally in `.env.local` and as a Vercel environment variable for the deployed site).

Render's free tier sleeps after 15 minutes idle and takes 30–50s to wake on the first request after that — the firmware's request timeout is set generously to accommodate this.

**Environment variables the backend expects:**

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | Render (secret) | Supabase project the relay writes to |
| `SUPABASE_SERVICE_ROLE_KEY` | Render (secret) | Service-role key — bypasses RLS, never commit it |
| `TRUST_PROXY_HEADERS` | Render (`render.yaml`, `"1"`) | Says the app is behind Render's proxy, so rate limits key on the real client IP and requests that reached the edge over plain HTTP are refused. Must stay **unset** anywhere the app is directly exposed, or callers could forge the headers |
| `ALLOWED_ORIGINS` | Render (optional) | Comma-separated CORS origins; defaults to the two production frontend URLs plus localhost |
| `VITE_FLASK_URL` | Vercel (Production) | The deployed backend URL. **Required** — without it the frontend falls back to `http://127.0.0.1:5000`, and device pairing, release, session start/stop and account deletion all fail. It must be `https://`; the app refuses to send an access token over plain HTTP |

**Deployment order matters:** apply database migrations → deploy the backend and set its variables → verify `/healthz` → set `VITE_FLASK_URL` and redeploy the frontend → only then reflash firmware.

### Hardware (ESP32)
Flash `firmware/smart_football/smart_football.ino` from the Arduino IDE. First copy `firmware/smart_football/secrets.example.h` to `secrets.h` in the same folder and fill in your Wi-Fi networks — `secrets.h` is gitignored, so credentials never reach the repository (the sketch won't compile without it). Update `serverHost` (the deployed Render hostname — see above) at the top of the sketch, and confirm these pins match your actual wiring:

| Pin | Purpose |
|---|---|
| `VIB_PIN` (27) | Vibration sensor — signals a kick was detected |

The sketch validates the backend's TLS certificate against the root CAs in `firmware/smart_football/certs.h` (GTS Root R4, which `*.onrender.com` chains to today, plus ISRG Root X1 for a future custom domain). It also syncs its clock over NTP first, because certificate validity dates cannot be checked by a board that thinks it is 1970. If validation or time sync fails, kicks are buffered — there is deliberately no insecure fallback. `certs.h` explains how to regenerate the bundle if the backend's CA ever changes.

### OTA authenticity — read before publishing firmware
Update images are fetched over validated TLS and verified against an `x-MD5` header, so a tampered-in-transit or truncated download is rejected. **That is integrity, not authenticity** — the image is not cryptographically signed, so anyone who can write to `backend/firmware_releases/` can publish firmware to every ball. Treat write access to that directory as equivalent to code execution on the hardware. Closing this properly requires a release signing key plus ESP32 secure boot, which fuses the key into the chip and is irreversible — an operational decision, not a code change, and deliberately not done here.

### Pairing a ball to an account
On first boot the board registers itself and generates a **pairing code**, which it prints to the Serial monitor alongside its **Device ID** on every boot. Enter both on the app's Devices page to claim the ball. The backend stores only a salted hash of the code, so knowing a Device ID is not enough to pair someone else's football — you have to be holding it.

**Release** on the Devices page gives a ball up: it revokes the device's credentials as well as its ownership, ends any session it was recording, and makes it register again on its next boot (printing a fresh pairing code) so it can be claimed by its next owner. That is also how to recover a ball whose stored credentials were lost — the backend will not re-issue credentials for a device that is still claimed.

### Google sign-in
Requires a Google OAuth Client ID/Secret enabled under **Authentication → Providers → Google** in your Supabase project, with the redirect URI `<your-supabase-url>/auth/v1/callback`.

## Database

Seven tables in Supabase Postgres, each with Row Level Security scoping every row to its owning account:

- `football_profiles` — one row per user (name, DOB, avatar, role)
- `football_players` — a coach's roster (or a player's own self-record)
- `football_sessions` — start/end time per training session
- `football_shots` — one row per detected kick (`speed`, `spin`, `force`, `distance`, shot type — see [Measurements](#measurements-and-calibration) for what each field actually carries)
- `football_devices` — a claimed ball, its hashed token and which account holds it
- `football_organizations` / `football_org_members` — a shared roster across several coaches

Aggregation happens in Postgres rather than in the browser, through
`security_invoker` views and functions (`football_leaderboard`,
`football_player_shot_stats`, `football_player_session_stats`,
`football_shot_daily_totals`, `football_shot_type_totals`) — the caller's own
RLS still applies before anything is aggregated.

### Migrations

`supabase/migrations/` applies in filename order. Every migration in there has
been applied to production **except one**:

- `20260919150000_shots_created_at_index.sql` — indexes `football_shots(created_at desc)`.
  The shot-history pager seeks through this index; without it the same page is
  correct but reads every visible row to return 25. Production holds no shots
  yet, so there is nothing to slow down today. **Apply it before real history
  accumulates.** The file explains the measurements behind it.

## Measurements and calibration

What the ball reports, and what that is worth. The rule this follows: a raw
sensor count multiplied by a made-up number is not a physical measurement,
and the app does not label it as one.

| Shown as | API field | Status |
|---|---|---|
| **Spin** (rpm) | `spin` | **Measured.** The gyroscope reads angular rate directly. Counts → °/s is the datasheet sensitivity, °/s → rpm is ÷6. No calibration needed. Ceiling: ±2000 °/s ≈ **333 rpm** — a faster strike reads as that ceiling, and the firmware logs the saturation. |
| **Impact** (g) | `force` | **Measured.** Peak acceleration magnitude over the impact window, scaled by the datasheet sensitivity. *Not newtons*: that needs the ball's mass and proof the sensor tracks its centre of mass rather than shell flex. |
| **Speed index** (0–100) | `speed` | **Index, not a speed.** An accelerometer does not measure velocity. This is the peak acceleration as a fraction of full scale — monotonic in how hard the ball was struck, and nothing more. It becomes km/h only after the reference experiment below. |
| **Carry index** | `distance` | **Derived, not measured.** It is the speed index times a fixed factor, so it contains no information the speed index does not. Nothing on this board observes where the ball lands. |

All four API field names are unchanged, so the relay, database and stored
history stay compatible. What each field carries is defined in one place:
[`firmware/smart_football/calibration.h`](firmware/smart_football/calibration.h).

### What was wrong before

The firmware left the MPU6050 at its power-on defaults of ±2 g and ±250 °/s.
A struck football produces accelerations in the hundreds of g and rotation in
the thousands of °/s, so **both sensors saturated on every real kick** — the
raw axis pinned to 32767 and the reported "measurement" was the same number
for a tap and for a full strike. On top of that, a single sample was taken
whenever the main loop happened to reach the sensor, once per ~300 ms pass
and after network work that can block for seconds, so the peak of a
few-millisecond contact was almost never in the sample that got sent. Speed
was `|ax|/500` (an acceleration relabelled as a speed), force was `|ay|/500`
on a different axis, and distance was speed × 2.5.

### To calibrate speed (not yet done)

Requires a trusted reference: a radar gun, two-gate timing, or high-speed
video at a known frame rate over a measured distance. Take 30+ strikes from
gentle to maximum, record this firmware's peak g alongside the reference
speed, fit `v = gain × peak_g + offset`, and record the residual spread. Put
the fitted values in `SPEED_MODEL_GAIN` / `SPEED_MODEL_OFFSET` and set
`SPEED_CALIBRATED` to 1 — the app then shows km/h. If residuals are large,
peak g alone is not a sufficient predictor and the model needs more features
(contact duration, impulse) rather than a nudged coefficient.

Force in newtons needs the ball's mass and mount verification
(`BALL_MASS_KG`, `FORCE_NEWTONS_CALIBRATED`). Carry distance needs a
different instrument entirely.

**No calibration has been performed and no coefficients have been measured.**
The placeholders are zero on purpose: a wrong coefficient is worse than an
absent one, because it produces a number that looks like a result.

## Team

Shaik Hafreed · Meda Sai Nihal · Vedhesh P P
