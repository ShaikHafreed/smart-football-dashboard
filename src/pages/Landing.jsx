import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Gauge,
  RotateCw,
  Zap,
  Ruler,
  RadioTower,
  ShieldCheck,
  LineChart,
  Users,
  Play,
  Database,
  Cpu,
  Wifi,
  ListChecks,
  Trophy,
  History as HistoryIcon,
  Building2,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { prefetchRoute, onIdle } from "../lib/routes";

/**
 * Public landing page.
 *
 * Everything claimed here is something the system actually does today. The
 * shot-quality model in `ml/` is trained on synthetic data and is not wired
 * into the running application, so it is deliberately not described as a
 * product capability — no predictions, no scores, no "AI coaching".
 */

const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#players", label: "For players" },
  { href: "#coaches", label: "For coaches" },
  { href: "#technology", label: "Technology" },
];

// Only what the sensor can defend. Spin and impact are physical units read
// straight off the gyroscope and accelerometer; speed and carry stay indices
// until the calibration experiment in firmware/smart_football/calibration.h
// has actually been run.
const MEASUREMENTS = [
  { icon: RotateCw, label: "Spin", tag: "Measured", measured: true, hint: "rotation rate at contact, in rpm" },
  { icon: Zap, label: "Impact", tag: "Measured", measured: true, hint: "peak acceleration through the strike, in g" },
  { icon: Gauge, label: "Speed index", tag: "Index", measured: false, hint: "how hard the ball was struck, on a full-scale index" },
  { icon: Ruler, label: "Carry index", tag: "Derived", measured: false, hint: "calculated from the speed index, not measured separately" },
];

const STEPS = [
  {
    icon: Cpu,
    title: "The ball senses the strike",
    body: "An ESP32 with a motion sensor sits inside the football. A vibration trigger marks the instant of contact, and the sensor is sampled across a short window around it, so the peak of the strike is captured rather than missed.",
  },
  {
    icon: Wifi,
    title: "It sends the reading securely",
    body: "The ball connects to any Wi-Fi with internet and posts over HTTPS with its own credentials, validating the server's certificate first. Lose signal mid-session and readings are buffered on the ball until it reconnects.",
  },
  {
    icon: Play,
    title: "A session attributes it",
    body: "Start a session and the ball is bound to one player. Every kick that follows is recorded against that player and that session — automatically, with no tagging afterwards.",
  },
  {
    icon: LineChart,
    title: "The dashboard updates live",
    body: "Readings appear on the dashboard as they land, and roll up into session history, personal bests and team trends you can come back to later.",
  },
];

const PLAYER_FEATURES = [
  { icon: RadioTower, title: "Live telemetry", body: "Spin, impact and strike index from the last kick, updating as you play." },
  { icon: Trophy, title: "Personal bests", body: "Your best figures across every kick you have ever recorded, not just this session." },
  { icon: LineChart, title: "Session breakdown", body: "Each session scored for its Best Kick and Max Speed Kick, with the spin at both of those moments." },
  { icon: ListChecks, title: "Practice suggestions", body: "Drills matched to your own force profile, as a checklist you can work through." },
  { icon: HistoryIcon, title: "Full shot history", body: "Every recorded kick, searchable and exportable as CSV." },
];

const COACH_FEATURES = [
  { icon: Users, title: "A roster you manage", body: "Add players, open any of them, and set who the next session records for." },
  { icon: LineChart, title: "Team trend", body: "Average speed and spin across the whole squad, day by day." },
  { icon: Trophy, title: "Attendance and shot mix", body: "Who is turning up to sessions, and the distribution of shot types across the roster." },
  { icon: HistoryIcon, title: "Per-player drill-down", body: "The same session-by-session view players see for themselves, for anyone on your roster." },
  { icon: Building2, title: "Shared organisations", body: "Coaches join an academy by invite code and work from one shared roster." },
];

const TECHNOLOGY = [
  { term: "Hardware", detail: "ESP32 microcontroller with an MPU6050 accelerometer and gyroscope run at their widest ranges (±16 g, ±2000 °/s), plus a vibration trigger for kick detection." },
  { term: "On-device", detail: "Credentials held in flash, offline buffering when the network drops, and over-the-air firmware updates." },
  { term: "Transport", detail: "HTTPS with certificate validation against pinned roots, and per-device credentials the ball proves on every request." },
  { term: "Backend", detail: "A Python relay that authenticates each device, resolves the active session, and writes the kick." },
  { term: "Data", detail: "Postgres on Supabase with row-level security, so an account only ever reads its own players and their sessions." },
  { term: "Frontend", detail: "React, with live updates pushed over a websocket instead of polling for changes." },
];

function BrandMark({ className = "" }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span aria-hidden="true" className="text-xl leading-none">⚽</span>
      <span className="font-display text-[15px] font-semibold tracking-tight">Smart Football AI</span>
    </span>
  );
}

/** Hero illustration: the ball, the sensor inside it, and the strike leaving it. */
function SmartBall({ reduceMotion }) {
  return (
    <svg viewBox="0 0 420 380" role="img" aria-label="A football with a motion sensor inside it, sending a reading as it is struck" className="h-full w-full">
      <defs>
        <radialGradient id="ballFill" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#f1f4f1" />
          <stop offset="100%" stopColor="#d9e0da" />
        </radialGradient>
        <linearGradient id="arcFade" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(82 92% 44%)" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(82 92% 44%)" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* pitch shadow */}
      <ellipse cx="150" cy="322" rx="96" ry="14" fill="hsl(158 32% 9%)" opacity="0.10" />

      {/* flight of the strike */}
      <path d="M196 214 C 268 178, 320 132, 372 74" fill="none" stroke="url(#arcFade)" strokeWidth="2.5" strokeDasharray="7 9" strokeLinecap="round" />
      <circle cx="372" cy="74" r="4.5" fill="hsl(82 92% 44%)" />

      {/* contact pulse */}
      {!reduceMotion && (
        <g style={{ transformOrigin: "150px 232px" }}>
          <circle cx="150" cy="232" r="84" fill="none" stroke="hsl(82 92% 44%)" strokeWidth="1.5" opacity="0.5" className="animate-pulseRing" />
        </g>
      )}

      {/* ball */}
      <circle cx="150" cy="232" r="84" fill="url(#ballFill)" stroke="hsl(155 12% 80%)" strokeWidth="1.5" />
      <path d="M150 168 l31 23 -12 37 h-38 l-12 -37 z" fill="hsl(158 32% 9%)" opacity="0.88" />
      <path d="M150 168 v-16 M181 191 l22 -12 M169 228 l27 20 M131 228 l-27 20 M119 191 l-22 -12" stroke="hsl(158 32% 9%)" strokeWidth="2.2" opacity="0.32" strokeLinecap="round" />
      <path d="M79 208 a 84 84 0 0 1 24 -33 M221 208 a 84 84 0 0 0 -24 -33 M104 300 a 84 84 0 0 0 92 0" fill="none" stroke="hsl(158 32% 9%)" strokeWidth="2.2" opacity="0.22" strokeLinecap="round" />

      {/* sensor module inside */}
      <g transform="translate(150 232)">
        <rect x="-21" y="-15" width="42" height="30" rx="7" fill="hsl(154 52% 17%)" />
        <rect x="-13" y="-8" width="26" height="16" rx="3" fill="hsl(82 92% 44%)" opacity="0.92" />
        <path d="M-21 -6 h-7 M-21 6 h-7 M21 -6 h7 M21 6 h7" stroke="hsl(154 52% 17%)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Illustrative dashboard readout, mirroring the cards the app shows live. */
function ReadoutCard() {
  const rows = [
    { icon: RotateCw, label: "Spin", value: "182", unit: "rpm" },
    { icon: Zap, label: "Impact", value: "11.4", unit: "g" },
    { icon: Gauge, label: "Speed index", value: "62", unit: "" },
    { icon: Ruler, label: "Carry index", value: "155", unit: "" },
  ];

  return (
    <div className="w-[248px] rounded-2xl border border-border bg-card p-4 shadow-[0_18px_44px_-24px_rgba(11,32,22,0.45)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Last strike</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--lime))]" />
          <span className="text-[11px] font-medium text-muted-foreground">Live</span>
        </span>
      </div>

      <span className="sr-only">Illustration of the live dashboard readout.</span>

      <dl className="mt-3 space-y-2.5">
        {rows.map(({ icon: Icon, label, value, unit }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="ml-auto font-data text-sm font-semibold tabular-nums">
              {value}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Entrance animation for a block.
 *
 * Deliberately NOT scroll-triggered. A `whileInView` reveal starts the
 * element at opacity 0 and only pays it off when an IntersectionObserver
 * fires, which means every section below the fold is invisible until
 * something JavaScript-driven rescues it — and stays invisible in a
 * full-page screenshot, in print, and anywhere the observer misbehaves.
 * Content should never depend on an animation to exist.
 *
 * This runs on mount with a small stagger instead, reusing the app's own
 * fadeIn keyframes so the landing moves the way the dashboard does.
 */
function Reveal({ children, delay = 0, reduceMotion, className = "" }) {
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <div className={`animate-fadeIn ${className}`} style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}>
      {children}
    </div>
  );
}

function SectionHeading({ eyebrow, title, lead, id }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h2 id={id} className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const reduceMotion = useReducedMotion();

  const primaryCta = isAuthenticated
    ? { to: "/dashboard", label: "Open dashboard" }
    : { to: "/login", label: "Get started" };

  // Whatever this visitor's next step is, it is now a separate chunk. Fetch
  // it once the page is idle - after the landing has painted, before they
  // reach the button - so the first click into the product is instant rather
  // than the slowest moment of the visit.
  useEffect(() => {
    const cancel = onIdle(() => prefetchRoute(primaryCta.to));
    return cancel;
  }, [primaryCta.to]);

  return (
    <div className="landing min-h-screen scroll-smooth font-sans antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-[hsl(var(--paper)/0.85)] backdrop-blur-md">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <Link to="/" className="shrink-0" aria-label="Smart Football AI, home">
            <BrandMark />
          </Link>

          <ul className="ml-4 hidden items-center gap-7 md:flex">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <a href={s.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            {/* On a phone the pill already leads to sign-in, so the extra
                text link is dropped rather than wrapped onto two lines. */}
            {!isAuthenticated && (
              <Link to="/login" className="hidden whitespace-nowrap px-1 text-sm font-medium text-foreground transition-opacity hover:opacity-70 sm:inline">
                Log in
              </Link>
            )}
            <Link
              to={primaryCta.to}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px sm:px-5"
            >
              {primaryCta.label}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* ================= HERO ================= */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_18%_0%,hsl(82_92%_44%/0.10),transparent_70%)]" />

          <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-12 lg:gap-10 lg:pb-28 lg:pt-24">
            <div className="lg:col-span-6 lg:pt-6">
              <Reveal reduceMotion={reduceMotion}>
                <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--lime))]" />
                  Sensor-instrumented football
                </p>

                <h1 className="font-display mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                  Every strike,{" "}
                  <span className="landing-underline">measured</span>.
                </h1>

                <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                  Smart Football AI puts a motion sensor inside the ball. Each kick is captured the
                  moment it happens, attributed to the player who took it, and turned into session
                  analytics players and coaches can actually train from.
                </p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    to={primaryCta.to}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px"
                  >
                    {primaryCta.label}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  <a
                    href="#how"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary"
                  >
                    See how it works
                  </a>
                </div>

                <p className="mt-7 text-sm text-muted-foreground">
                  Built on a working ESP32 prototype — the hardware, the relay and the dashboard all run today.
                </p>
              </Reveal>
            </div>

            <div className="lg:col-span-6">
              <Reveal reduceMotion={reduceMotion} delay={0.1} className="relative mx-auto max-w-[480px] lg:max-w-none">
                <div className="relative aspect-[420/380] w-full">
                  <SmartBall reduceMotion={reduceMotion} />
                </div>
                {/* Overlaid on the illustration where there is room for it,
                    but placed underneath on a phone rather than sitting on
                    top of the ball. */}
                <div className="mx-auto -mt-6 w-fit sm:absolute sm:bottom-4 sm:right-2 sm:mt-0 lg:bottom-8">
                  <ReadoutCard />
                </div>
              </Reveal>
            </div>
          </div>

          {/* what the ball measures */}
          <div className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-24">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
              {MEASUREMENTS.map(({ icon: Icon, label, hint, tag, measured }) => (
                <div key={label} className="bg-card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Icon aria-hidden="true" className="h-4 w-4 text-[hsl(var(--lime))]" />
                    {/* Says plainly which of these the ball measures and
                        which stand in for something not yet calibrated. */}
                    <span
                      className={`chip ${measured ? "border-[hsl(var(--lime))]/50 text-foreground" : "text-muted-foreground"}`}
                    >
                      {tag}
                    </span>
                  </div>
                  <p className="font-display mt-3 text-base font-semibold">{label}</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t border-border py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal reduceMotion={reduceMotion}>
              <SectionHeading
                id="how-title"
                eyebrow="How it works"
                title="From the boot to the dashboard"
                lead="Four steps, and only the first one happens on the pitch."
              />
            </Reveal>

            <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="bg-card">
                  <Reveal reduceMotion={reduceMotion} delay={i * 0.06} className="flex h-full flex-col p-6">
                    <div className="flex items-center gap-3">
                      <span className="font-data text-xs font-semibold text-[hsl(var(--lime))]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                      <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h3 className="font-display mt-5 text-lg font-semibold leading-snug">{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ================= LIVE SESSION (pitch band) ================= */}
        <section aria-labelledby="live-title" className="landing-pitch turf-texture py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <Reveal reduceMotion={reduceMotion}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live session</p>
                <h2 id="live-title" className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  The dashboard keeps up with the session
                </h2>
                <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                  Press start, and the ball is bound to the player on the sheet. Readings are pushed to the
                  dashboard as they arrive rather than polled for, so the number on screen is the kick that
                  just happened. Stop the session and it closes into the history with its own breakdown.
                </p>

                <ul className="mt-8 space-y-3">
                  {[
                    "Kicks attributed to one player for the length of the session",
                    "Readings pushed live, not refreshed on a timer",
                    "Sessions close into a record you can revisit and export",
                  ].map((line) => (
                    <li key={line} className="flex gap-3 text-sm text-muted-foreground">
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {line}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <div className="lg:col-span-6">
              <Reveal reduceMotion={reduceMotion} delay={0.1}>
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      {!reduceMotion && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                      )}
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    Session running
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-4">
                    {[
                      { icon: RadioTower, label: "Ball" },
                      { icon: Database, label: "Recorded" },
                      { icon: LineChart, label: "Dashboard" },
                    ].map(({ icon: Icon, label }, i) => (
                      <div key={label} className="text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary">
                          <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">{label}</p>
                        {i < 2 && <span className="sr-only">then</span>}
                      </div>
                    ))}
                  </div>

                  <svg viewBox="0 0 300 64" className="mt-7 w-full" aria-hidden="true">
                    <path
                      d="M4 50 C 40 44, 52 22, 84 30 S 130 54, 160 34 S 214 10, 248 24 S 286 40, 296 20"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                  </svg>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Illustration of the session view — your own figures replace this once a ball is paired.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ================= PLAYERS ================= */}
        <section id="players" aria-labelledby="players-title" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal reduceMotion={reduceMotion}>
                <SectionHeading
                  id="players-title"
                  eyebrow="For players"
                  title="Know whether you are actually improving"
                  lead="Not a feeling at the end of a session — the same measurements, taken the same way, every time you train."
                />
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <dl className="divide-y divide-border border-y border-border">
                {PLAYER_FEATURES.map(({ icon: Icon, title, body }, i) => (
                  <Reveal key={title} reduceMotion={reduceMotion} delay={i * 0.04}>
                    <div className="flex gap-5 py-5">
                      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--lime))]" />
                      <div>
                        <dt className="font-display text-base font-semibold">{title}</dt>
                        <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</dd>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ================= COACHES ================= */}
        <section id="coaches" aria-labelledby="coaches-title" className="scroll-mt-20 border-t border-border bg-[hsl(var(--surface-2))] py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal reduceMotion={reduceMotion}>
                <SectionHeading
                  id="coaches-title"
                  eyebrow="For coaches"
                  title="See the squad, not just the session"
                  lead="One roster, every player's record behind it, and the team's direction of travel in front of it."
                />
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <dl className="divide-y divide-border border-y border-border">
                {COACH_FEATURES.map(({ icon: Icon, title, body }, i) => (
                  <Reveal key={title} reduceMotion={reduceMotion} delay={i * 0.04}>
                    <div className="flex gap-5 py-5">
                      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--lime))]" />
                      <div>
                        <dt className="font-display text-base font-semibold">{title}</dt>
                        <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</dd>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ================= TECHNOLOGY ================= */}
        <section id="technology" aria-labelledby="tech-title" className="scroll-mt-20 border-t border-border py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal reduceMotion={reduceMotion}>
              <SectionHeading
                id="tech-title"
                eyebrow="Technology"
                title="What it is built from"
                lead="A ball that can be trusted to report its own kicks, and a backend that can be trusted to file them against the right player."
              />
            </Reveal>

            <dl className="mt-14 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {TECHNOLOGY.map(({ term, detail }, i) => (
                <Reveal key={term} reduceMotion={reduceMotion} delay={i * 0.04}>
                  <div className="border-t border-border pt-5">
                    <dt className="font-display text-sm font-semibold uppercase tracking-[0.1em]">{term}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</dd>
                  </div>
                </Reveal>
              ))}
            </dl>

            <Reveal reduceMotion={reduceMotion}>
              <p className="mt-12 flex max-w-2xl items-start gap-3 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--lime))]" />
                Each ball is paired to one account using a code it prints on first boot, and its credentials can
                be revoked from the app at any time. Your players, sessions and shots are readable only by your
                account and the coaches you share an organisation with.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ================= CTA ================= */}
        <section aria-labelledby="cta-title" className="border-t border-border py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
            <Reveal reduceMotion={reduceMotion}>
              <h2 id="cta-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Pair a ball and start a session
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Create an account, choose whether you are training as a player or running a roster as a coach,
                and the dashboard is ready before your first kick lands.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to={primaryCta.to}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px sm:w-auto"
                >
                  {primaryCta.label}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                {!isAuthenticated && (
                  <Link
                    to="/login"
                    className="inline-flex w-full items-center justify-center rounded-full border border-border bg-card px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary sm:w-auto"
                  >
                    I already have an account
                  </Link>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <BrandMark />
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              An IoT football analytics prototype: sensor hardware, a secure relay, and the dashboard that
              turns kicks into sessions.
            </p>
          </div>

          <nav aria-label="Footer" className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/legal" className="transition-colors hover:text-foreground">Privacy &amp; terms</Link>
            <Link to="/login" className="transition-colors hover:text-foreground">Log in</Link>
            <a
              href="https://github.com/ShaikHafreed/smart-football-dashboard"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-foreground"
            >
              Source
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
