// The trip page's hero: a ring that fills as items are packed. Same ARIA
// contract as ProgressBar; at 100% it switches to the "complete" style, which
// stamps "All packed" once (skipped under prefers-reduced-motion).
const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ProgressRing({ value, max, label }) {
  const safeMax = max > 0 ? max : 0;
  const fraction = safeMax === 0 ? 0 : value / safeMax;
  const complete = safeMax > 0 && value === safeMax;

  return (
    <div
      className={
        complete ? "progress-ring progress-ring--complete" : "progress-ring"
      }
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          className="progress-ring__track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
        />
        <circle
          className="progress-ring__fill"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          // Start the arc at 12 o'clock instead of 3.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="progress-ring__center" aria-hidden="true">
        {complete ? (
          <span className="progress-ring__stamp">All packed</span>
        ) : (
          <>
            <span className="progress-ring__count">{value}</span>
            <span className="progress-ring__of">of {safeMax}</span>
          </>
        )}
      </div>
    </div>
  );
}
