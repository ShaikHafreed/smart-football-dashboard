import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { createPrefetcher, routeLoaders, onIdle } from "./routes";

// The prefetcher is the part that can silently go wrong: a double fetch is
// invisible, and a cached rejection would turn one flaky network moment into
// a permanently broken link. Both are asserted here rather than hoped for.
describe("createPrefetcher", () => {
  it("fetches a route chunk once, however many times intent is signalled", async () => {
    const load = vi.fn(() => Promise.resolve({ default: () => null }));
    const prefetch = createPrefetcher({ "/history": load });

    prefetch("/history");
    prefetch("/history");
    await prefetch("/history");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns the same in-flight promise for repeat calls", () => {
    const prefetch = createPrefetcher({ "/history": () => Promise.resolve({}) });
    expect(prefetch("/history")).toBe(prefetch("/history"));
  });

  it("ignores a path it does not know, rather than throwing at a hover", () => {
    const prefetch = createPrefetcher({ "/history": () => Promise.resolve({}) });
    expect(prefetch("/not-a-route")).toBeNull();
    expect(() => prefetch(undefined)).not.toThrow();
    // Object.prototype keys must not look like registered routes.
    expect(prefetch("toString")).toBeNull();
  });

  it("swallows a failed prefetch instead of rejecting into the UI", async () => {
    const prefetch = createPrefetcher({ "/history": () => Promise.reject(new Error("offline")) });
    await expect(prefetch("/history")).resolves.toMatchObject({ prefetchFailed: expect.any(Error) });
  });

  it("forgets a failure so the real navigation can still load the chunk", async () => {
    let attempt = 0;
    const load = vi.fn(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ default: () => null });
    });
    const prefetch = createPrefetcher({ "/history": load });

    await prefetch("/history");
    await prefetch("/history");

    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("route registry", () => {
  // Every link the sidebar renders. Kept as a literal list so that adding a
  // nav item without a loader fails here rather than as a dead click.
  const NAV_PATHS = [
    "/dashboard",
    "/leaderboard",
    "/analytics",
    "/session",
    "/history",
    "/devices",
    "/organization",
    "/profile",
  ];

  it("has a loader for every navigable path", () => {
    for (const path of NAV_PATHS) {
      expect(routeLoaders[path], `no chunk registered for ${path}`).toBeTypeOf("function");
    }
  });

  it("registers absolute paths only, so they match what NavLink passes", () => {
    for (const path of Object.keys(routeLoaders)) {
      expect(path.startsWith("/")).toBe(true);
    }
  });

  it("does not register the landing page, which must stay in the entry chunk", () => {
    expect(routeLoaders["/"]).toBeUndefined();
  });
});

// The registry and the router are two lists of the same paths. Nothing at
// runtime notices when they drift -- a typo in the registry is just a
// prefetch that never fires, and a route missing from the registry is a page
// that silently stops being code-split. Compare them as text instead.
describe("registry matches the router", () => {
  const appSource = readFileSync(
    fileURLToPath(new URL("../App.jsx", import.meta.url)),
    "utf8"
  );
  const declaredPaths = [...appSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);

  it("finds the routes it is comparing against", () => {
    expect(declaredPaths).toContain("/dashboard");
    expect(declaredPaths).toContain("*");
  });

  it("registers a loader for every real path the router declares", () => {
    const real = declaredPaths.filter((p) => p !== "*" && p !== "/");
    for (const path of real) {
      expect(routeLoaders[path], `${path} is routed but not code-split`).toBeTypeOf("function");
    }
  });

  it("routes every path it registers", () => {
    for (const path of Object.keys(routeLoaders)) {
      expect(declaredPaths, `${path} is code-split but never routed`).toContain(path);
    }
  });

  it("still answers unknown URLs with the not-found page, not a redirect", () => {
    expect(appSource).toMatch(/path="\*"\s+element=\{<NotFound \/>\}/);
  });
});

describe("onIdle", () => {
  it("does nothing and stays cancellable without a window", () => {
    const cancel = onIdle(() => { throw new Error("should not run"); });
    expect(() => cancel()).not.toThrow();
  });
});
