// LifeMap UI V2 — ProgressArc (Stage 1)
// Pure SVG progress ring: one component, one source of truth for the percentage.
// No canvas, no global DOM writes, no legacy CSS classes, no !important.
export function ProgressArc({
  value = 0,
  size = 120,
  strokeWidth = 3,
  trackColor = 'rgba(255,255,255,.12)',
  arcColor = '#57e0a8',
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg
      className="lifemapV2ProgressArc"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {pct > 0 ? (
        <circle
          className="lifemapV2ProgressArcValue"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      ) : null}
    </svg>
  );
}
