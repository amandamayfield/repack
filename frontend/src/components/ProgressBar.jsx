// Accessible progress indicator used by both the trips dashboard (server counts)
// and the trip view (client-computed counts). An empty set (max === 0) reads as
// 0% rather than NaN — a brand-new trip with no items is a valid, common state.
export default function ProgressBar({ value, max, label }) {
  const safeMax = max > 0 ? max : 0;
  const pct = safeMax === 0 ? 0 : Math.round((value / safeMax) * 100);

  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
    >
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
