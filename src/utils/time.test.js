import { describe, it, expect } from "vitest";
import { formatClock, formatDuration } from "./time";

describe("formatClock", () => {
  it("pads the seconds so the clock doesn't jump width while running", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("does not render a negative or fractional clock", () => {
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(12.7)).toBe("0:12");
    expect(formatClock(undefined)).toBe("0:00");
  });
});

describe("formatDuration", () => {
  it("reads as words, which is how someone describes a session afterwards", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("drops the seconds on a whole minute rather than saying '2m 0s'", () => {
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(3600)).toBe("1h");
  });

  it("keeps a long session readable", () => {
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(7800)).toBe("2h 10m");
  });

  it("survives junk instead of rendering NaN at someone", () => {
    expect(formatDuration(null)).toBe("0s");
    expect(formatDuration(-30)).toBe("0s");
    expect(formatDuration("abc")).toBe("0s");
  });
});
