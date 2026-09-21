/**
 * One registry for every code-split route.
 *
 * The app used to build as a single 1.12 MB bundle, so a visitor who only
 * wanted to read the public landing page still downloaded Recharts, every
 * authenticated screen and the whole coach workflow before anything rendered.
 * Splitting per route fixes that, but naive splitting trades one problem for
 * another: the first click on a nav link now waits for a network round trip
 * that the single bundle had already paid for.
 *
 * So the loaders live here rather than inline in the router, and the same map
 * serves both purposes: `routeComponents` is what the router renders, and
 * `prefetchRoute` is what the sidebar calls on hover/focus so the chunk is
 * usually already in memory by the time the click lands. A dynamic import of
 * the same specifier resolves to the same module promise, so a prefetch and
 * the later render share one request - prefetching cannot double-fetch.
 *
 * Landing is deliberately NOT here. It is the public entry point, so making
 * it lazy would cost every first-time visitor a second round trip to see
 * anything at all.
 */
import { lazy } from "react";

/** path -> dynamic import. Specifiers must stay literal so the bundler can
 *  statically find them and emit a chunk per entry. */
export const routeLoaders = {
  "/login": () => import("../pages/Login"),
  "/legal": () => import("../pages/Legal"),
  "/auth/callback": () => import("../pages/AuthCallback"),
  "/onboarding/name": () => import("../pages/onboarding/NameInput"),
  "/onboarding/dob": () => import("../pages/onboarding/DOBInput"),
  "/onboarding/role": () => import("../pages/onboarding/RoleSelect"),
  "/dashboard": () => import("../pages/DashboardRouter"),
  "/analytics": () => import("../pages/PlayerAnalytics"),
  "/leaderboard": () => import("../pages/Leaderboard"),
  "/session": () => import("../pages/Session"),
  "/history": () => import("../pages/History"),
  "/devices": () => import("../pages/Devices"),
  "/organization": () => import("../pages/Organization"),
  "/profile": () => import("../pages/Profile"),
};

/** The shell itself is split too: a signed-out visitor never needs the
 *  sidebar, the drawer or the confirm dialog. */
export const appLayoutLoader = () => import("../components/layout/AppLayout");

/**
 * Builds a prefetcher over a loader map. Separated from the module-level
 * instance so it can be tested without pulling every page into the test
 * process.
 */
export function createPrefetcher(loaders) {
  const started = new Map();

  return function prefetch(path) {
    // Own properties only: a plain object inherits `toString`, `constructor`
    // and friends, so a bare lookup would treat those names as real routes
    // and then try to call the result as a loader.
    if (!Object.prototype.hasOwnProperty.call(loaders, path)) return null;
    if (started.has(path)) return started.get(path);

    const load = loaders[path];

    // A prefetch is an optimisation, never a failure the user should see:
    // swallow the rejection, and forget it so a genuine navigation can
    // retry rather than inheriting a poisoned promise.
    const promise = load().catch((error) => {
      started.delete(path);
      return { prefetchFailed: error };
    });

    started.set(path, promise);
    return promise;
  };
}

/** Warm the chunk for a route. Safe to call repeatedly and for unknown paths. */
export const prefetchRoute = createPrefetcher(routeLoaders);

/** React components for the router, one lazy wrapper per registered path. */
export const routeComponents = Object.fromEntries(
  Object.entries(routeLoaders).map(([path, load]) => [path, lazy(load)])
);

/**
 * Run work when the browser is next idle, so prefetching never competes with
 * the render the user is actually waiting on. Returns a cancel function.
 */
export function onIdle(callback, timeout = 2000) {
  if (typeof window === "undefined") return () => {};

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback?.(handle);
  }

  // Safari has no requestIdleCallback; a timer after first paint is close
  // enough for a prefetch.
  const handle = window.setTimeout(callback, 300);
  return () => window.clearTimeout(handle);
}
