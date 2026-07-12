// LifeMap UI V2 — Planet (Stage 1)
// Purely visual: size, position, title, metric, progress, central/regular variant.
// No onClick navigation, no context menu, no drag/zoom/camera, no business-state hover.
import { ProgressArc } from './ProgressArc.jsx';

export function Planet({
  x,
  y,
  size = 120,
  title,
  metric,
  sublabel,
  progress,
  variant = 'default',
  central = false,
}) {
  const style = {
    '--planet-x': `${x}px`,
    '--planet-y': `${y}px`,
    '--planet-size': `${size}px`,
  };
  const className = [
    'lifemapV2Planet',
    central ? 'lifemapV2PlanetCentral' : 'lifemapV2PlanetOrbit',
    !central && variant === 'muted' ? 'lifemapV2PlanetMuted' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} style={style}>
      {central ? <div className="lifemapV2PlanetGlow" aria-hidden="true" /> : null}
      <div className="lifemapV2PlanetBody" aria-hidden="true" />
      {!central ? (
        <div className="lifemapV2PlanetArcHost">
          <ProgressArc value={progress} size={size} strokeWidth={1.5} />
        </div>
      ) : null}
      <div className="lifemapV2PlanetLabel">
        <b>{title}</b>
        <small>{central ? sublabel : metric}</small>
      </div>
    </div>
  );
}
