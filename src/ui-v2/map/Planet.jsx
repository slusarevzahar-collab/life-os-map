// LifeMap UI V2 — Planet (Stage 2)
// Purely visual plus one interaction contract: onActivate. Routing and camera
// decisions remain in the shell. Interactive planets support pointer, Enter,
// Space, focus-visible, and aria-disabled.
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
  interactive = false,
  disabled = false,
  onActivate,
  ariaLabel,
}) {
  const style = {
    '--planet-x': `${x}px`,
    '--planet-y': `${y}px`,
    '--planet-size': `${size}px`,
  };
  const active = interactive && !disabled;
  const className = [
    'lifemapV2Planet',
    central ? 'lifemapV2PlanetCentral' : 'lifemapV2PlanetOrbit',
    !central && variant === 'muted' ? 'lifemapV2PlanetMuted' : '',
    active ? 'lifemapV2PlanetInteractive' : '',
  ].filter(Boolean).join(' ');

  const activate = () => {
    if (active) onActivate?.();
  };

  const handleKeyDown = (event) => {
    if (!active) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <div
      className={className}
      style={style}
      role={interactive ? 'button' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-disabled={interactive ? disabled : undefined}
      aria-label={ariaLabel || title}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
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
