/** CSV helpers — pulled out of History.jsx so the formatting logic is
 * testable on its own, independent of the DOM download mechanics. */

export function toCsv(rows) {
  const header = ["Player", "Speed (km/h)", "Spin (rpm)", "Force (N)", "Distance (m)", "Shot Type", "Recorded At"];
  const lines = rows.map((r) => [
    r.football_players?.name || "Unknown",
    r.speed,
    r.spin,
    r.force,
    r.distance,
    r.shot_type || "",
    new Date(r.created_at).toISOString(),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

export function downloadCsv(rows, filename = `shot-history-${new Date().toISOString().slice(0, 10)}.csv`) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
