/**
 * Visual QA harness.
 *
 * Renders the built app in a real browser at the three viewports the design
 * has to survive, screenshots every screen, and reports console errors. It
 * exists because a visual change that has not been looked at has not been
 * verified, and this project's unit tests run without a DOM.
 *
 * Screenshots are written outside the repository: they are evidence for a
 * review, not artefacts to commit.
 *
 *   node tools/visual/shoot.mjs <baseUrl> <outDir> [--auth email:password]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [baseUrl = "http://localhost:4173", outDir = "./shots"] = process.argv.slice(2);
const authArg = process.argv.find((a) => a.startsWith("--auth="));
const [authEmail, authPassword] = authArg ? authArg.slice(7).split(":") : [];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const PUBLIC_ROUTES = [
  ["landing", "/"],
  ["login", "/login"],
  ["notfound", "/does-not-exist"],
];

const APP_ROUTES = [
  ["dashboard", "/dashboard"],
  ["session", "/session"],
  ["history", "/history"],
  ["analytics", "/analytics"],
  ["leaderboard", "/leaderboard"],
  ["devices", "/devices"],
  ["profile", "/profile"],
];

const problems = [];

async function shoot(page, label, route, viewport) {
  const errors = [];
  const onError = (msg) => { if (msg.type() === "error") errors.push(msg.text()); };
  page.on("console", onError);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" }).catch(() => {});
  // Entry animations are ~600ms; settle before capturing.
  await page.waitForTimeout(900);

  const file = path.join(outDir, `${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });

  // Horizontal overflow is the responsive failure that unit tests never see.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (overflow > 1) problems.push(`${label} @${viewport.name}: ${overflow}px horizontal overflow`);
  for (const e of errors) problems.push(`${label} @${viewport.name}: console ${e}`);

  page.off("console", onError);
  return { file, overflow, errors: errors.length };
}

async function signIn(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', authEmail);
  await page.fill('input[type="password"]', authPassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  return page.url();
}

const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });

// Sign in once and reuse the session across viewports. Signing in per
// viewport meant three password grants per run, which the auth service
// rate-limited into silent failures partway through a review.
let storageState;
if (authEmail) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const landed = await signIn(page);
  if (landed.includes("/login")) {
    console.error("sign-in failed; authenticated screens will be skipped");
  } else {
    storageState = await context.storageState();
    console.log(`  signed in once -> ${landed.replace(baseUrl, "")}`);
  }
  await context.close();
}

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, storageState });
  const page = await context.newPage();

  for (const [label, route] of PUBLIC_ROUTES) {
    const r = await shoot(page, label, route, viewport);
    console.log(`  ${label.padEnd(12)} ${viewport.name.padEnd(8)} overflow=${r.overflow} errors=${r.errors}`);
  }

  if (storageState) {
    for (const [label, route] of APP_ROUTES) {
      const r = await shoot(page, label, route, viewport);
      const stillPublic = page.url().includes("/login");
      if (stillPublic) problems.push(`${label} @${viewport.name}: bounced to login, shot is not this screen`);
      console.log(`  ${label.padEnd(12)} ${viewport.name.padEnd(8)} overflow=${r.overflow} errors=${r.errors}${stillPublic ? "  <- BOUNCED" : ""}`);
    }
  }

  await context.close();
}

await browser.close();

console.log(`\nscreenshots -> ${outDir}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
} else {
  console.log("\nno overflow or console errors");
}
