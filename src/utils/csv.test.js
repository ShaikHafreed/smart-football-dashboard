import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("includes the header row", () => {
    const csv = toCsv([]);
    expect(csv).toBe("Player,Speed (km/h),Spin (rpm),Force (N),Distance (m),Shot Type,Recorded At");
  });

  it("formats a row with a known player", () => {
    const csv = toCsv([{
      football_players: { name: "Ali Hassan" },
      speed: 24.5, spin: 300, force: 410, distance: 18,
      shot_type: "kick",
      created_at: "2026-08-06T10:00:00.000Z",
    }]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Ali Hassan"');
    expect(lines[1]).toContain('"24.5"');
    expect(lines[1]).toContain('"2026-08-06T10:00:00.000Z"');
  });

  it("falls back to Unknown when the player join is missing", () => {
    const csv = toCsv([{ speed: 1, spin: 1, force: 1, distance: 1, created_at: "2026-01-01T00:00:00.000Z" }]);
    expect(csv).toContain('"Unknown"');
  });

  it("escapes embedded quotes so a name doesn't break the CSV", () => {
    const csv = toCsv([{
      football_players: { name: 'Player "The Rocket" Smith' },
      speed: 1, spin: 1, force: 1, distance: 1,
      created_at: "2026-01-01T00:00:00.000Z",
    }]);
    expect(csv).toContain('"Player ""The Rocket"" Smith"');
  });

  it("produces one line per row, in the given order", () => {
    const csv = toCsv([
      { football_players: { name: "A" }, speed: 1, spin: 1, force: 1, distance: 1, created_at: "2026-01-01T00:00:00.000Z" },
      { football_players: { name: "B" }, speed: 2, spin: 2, force: 2, distance: 2, created_at: "2026-01-02T00:00:00.000Z" },
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('"A"');
    expect(lines[2]).toContain('"B"');
  });
});
