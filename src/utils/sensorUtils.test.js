import { describe, it, expect } from "vitest";
import { classifyForce, getFootballAnimParams, fmt, getValueColor } from "./sensorUtils";

describe("classifyForce", () => {
  it("classifies below 280 as low", () => {
    expect(classifyForce(0)).toBe("low");
    expect(classifyForce(279)).toBe("low");
  });

  it("classifies 280-449 as medium", () => {
    expect(classifyForce(280)).toBe("medium");
    expect(classifyForce(449)).toBe("medium");
  });

  it("classifies 450+ as high", () => {
    expect(classifyForce(450)).toBe("high");
    expect(classifyForce(1000)).toBe("high");
  });
});

describe("getFootballAnimParams", () => {
  it("returns a distinct animation for each force level", () => {
    const low = getFootballAnimParams(100);
    const medium = getFootballAnimParams(300);
    const high = getFootballAnimParams(500);

    expect(low.duration).toBeGreaterThan(medium.duration);
    expect(medium.duration).toBeGreaterThan(high.duration);
  });

  it("always returns a scale keyframe array", () => {
    const params = getFootballAnimParams(500);
    expect(Array.isArray(params.scale)).toBe(true);
    expect(params.scale.length).toBeGreaterThan(0);
  });
});

describe("fmt", () => {
  it("adds locale separators to numbers", () => {
    expect(fmt(1234)).toBe((1234).toLocaleString());
  });

  it("returns an em dash for non-numbers", () => {
    expect(fmt(undefined)).toBe("—");
    expect(fmt(null)).toBe("—");
    expect(fmt("abc")).toBe("—");
  });

  it("handles zero correctly (not falsy-checked)", () => {
    expect(fmt(0)).toBe("0");
  });
});

describe("getValueColor", () => {
  it("returns the high-value color above 75%", () => {
    expect(getValueColor(80, 100)).toBe("text-blue-600");
  });

  it("returns the mid-value color between 45% and 75%", () => {
    expect(getValueColor(50, 100)).toBe("text-amber-500");
  });

  it("returns the muted color at or below 45%", () => {
    expect(getValueColor(40, 100)).toBe("text-muted-foreground");
  });
});
