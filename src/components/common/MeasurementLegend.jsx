/**
 * What each number on screen is actually worth.
 *
 * The app shows four figures that look alike but are not: two the sensor
 * measures, one that is an index standing in for a quantity nobody has
 * calibrated yet, and one that is derived from another. Without saying so,
 * the interface quietly implies all four are equal.
 *
 * A native <details> so it costs nothing until someone wants it, is
 * keyboard-operable for free, and never hides content behind script.
 */
const METRICS = [
  {
    name: "Spin",
    tag: "Measured",
    measured: true,
    detail: "Angular rate straight from the gyroscope, in rpm. Reads up to 333 rpm; a faster strike reports that ceiling.",
  },
  {
    name: "Impact",
    tag: "Measured",
    measured: true,
    detail: "Peak acceleration through the strike, in g. Not newtons — that needs the ball's mass and a verified sensor mount.",
  },
  {
    name: "Speed index",
    tag: "Index",
    measured: false,
    detail: "How hard the ball was struck, on a 0–100 scale. An accelerometer cannot measure velocity, so this is not km/h until a reference calibration is run.",
  },
  {
    name: "Carry index",
    tag: "Derived",
    measured: false,
    detail: "Calculated from the speed index, so it adds nothing the speed index does not already say. Nothing on the ball observes where it lands.",
  },
];

export default function MeasurementLegend({ className = "" }) {
  return (
    <details className={`panel group overflow-hidden ${className}`}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium sm:px-6">
        What these numbers mean
        <span aria-hidden="true" className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <dl className="border-t border-border px-5 py-4 sm:px-6">
        {METRICS.map(({ name, tag, measured, detail }) => (
          <div key={name} className="flex flex-col gap-1 border-b border-border py-3 last:border-0 last:pb-0 sm:flex-row sm:gap-4">
            <dt className="flex w-44 shrink-0 items-center gap-2">
              <span
                className={`chip ${measured ? "border-primary/40 bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
              >
                {tag}
              </span>
              <span className="text-sm font-medium">{name}</span>
            </dt>
            <dd className="text-xs leading-relaxed text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
