"""
Turn a serial log from the ball into calibration datasets.

The firmware prints one CSV record per line, prefixed CAL_ (see
CALIBRATION DIAGNOSTICS in the sketch). This pulls those records out of an
ordinary serial log and writes one file per record type.

Two ways in, because a calibration session should not depend on a package
being installed at the pitch:

    # live, needs pyserial (pip install pyserial)
    python capture.py --port COM5 --out data/

    # from a log saved by the Arduino IDE serial monitor, or piped
    python capture.py --log session.txt --out data/
    type session.txt | python capture.py --out data/

Nothing here interprets the numbers. Parsing and fitting are separate on
purpose: a capture can be re-analysed, and a bad fit can never quietly
rewrite what the ball actually reported.
"""
import argparse
import csv
import os
import sys

RECORD_PREFIXES = ("CAL_INFO", "CAL_REST", "CAL_SPIN", "CAL_IMPACT", "CAL_NOTE")

# One output file per record type. CAL_NOTE is human text, not data.
OUTPUT_FILES = {
    "CAL_INFO": "info.csv",
    "CAL_REST": "rest.csv",
    "CAL_SPIN": "spin.csv",
    "CAL_IMPACT": "impacts.csv",
}


def parse_line(line):
    """'CAL_IMPACT,ms=12,peak_g=4.5' -> ('CAL_IMPACT', {'ms': '12', ...}).

    Returns None for anything that is not a calibration record, so ordinary
    firmware chatter in the same log is ignored rather than corrupting a
    dataset."""
    line = line.strip()
    if not line:
        return None

    parts = line.split(",")
    kind = parts[0].strip()
    if kind not in RECORD_PREFIXES:
        return None

    fields = {}
    for part in parts[1:]:
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        fields[key.strip()] = value.strip()

    return kind, fields


def collect(lines):
    """Group parsed records by kind, preserving order."""
    grouped = {kind: [] for kind in OUTPUT_FILES}
    notes = []

    for line in lines:
        parsed = parse_line(line)
        if not parsed:
            continue
        kind, fields = parsed
        if kind == "CAL_NOTE":
            notes.append(line.strip())
        elif fields:
            grouped[kind].append(fields)

    return grouped, notes


def write_csv(path, rows):
    """Write rows as CSV, with the union of keys as the header."""
    if not rows:
        return 0

    columns = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    return len(rows)


def read_serial(port, baud, seconds):
    """Live capture. pyserial is imported here, not at module scope, so the
    log-file path works on a machine without it."""
    try:
        import serial  # noqa: PLC0415
    except ImportError:
        sys.exit("Live capture needs pyserial:  pip install pyserial\n"
                 "Or save the serial monitor output and use --log instead.")

    import time

    print(f"Listening on {port} at {baud} baud. Ctrl-C to stop.", file=sys.stderr)
    lines = []
    deadline = time.time() + seconds if seconds else None

    with serial.Serial(port, baud, timeout=1) as conn:
        try:
            while deadline is None or time.time() < deadline:
                raw = conn.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace")
                if line.strip().startswith("CAL_"):
                    print(line.strip(), file=sys.stderr)
                lines.append(line)
        except KeyboardInterrupt:
            print("\nStopped.", file=sys.stderr)

    return lines


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", help="serial port for live capture, e.g. COM5 or /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200, help="serial baud rate (default: 115200)")
    parser.add_argument("--seconds", type=int, default=0, help="stop live capture after N seconds (0 = until Ctrl-C)")
    parser.add_argument("--log", help="read a saved serial log instead of a port")
    parser.add_argument("--out", default="data", help="directory for the CSV output (default: data)")
    args = parser.parse_args(argv)

    if args.port:
        lines = read_serial(args.port, args.baud, args.seconds)
    elif args.log:
        with open(args.log, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    else:
        lines = sys.stdin.readlines()

    grouped, notes = collect(lines)

    total = 0
    for kind, filename in OUTPUT_FILES.items():
        written = write_csv(os.path.join(args.out, filename), grouped[kind])
        total += written
        if written:
            print(f"{written:5d}  {kind:<12} -> {os.path.join(args.out, filename)}")

    for note in notes:
        print(f"       note: {note}")

    if not total:
        print("No CAL_ records found. Is CALIBRATION_LOGGING set to 1 in calibration.h?")
        return 1

    impacts = len(grouped["CAL_IMPACT"])
    if impacts:
        print(f"\nNext: pair each of the {impacts} impact(s) with its reference speed, then run")
        print("  python fit_speed_model.py --paired paired.csv")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
