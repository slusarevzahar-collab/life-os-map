// LifeMap UI V2 — visual planet plus activation/context-menu contracts.
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
  onOpenMenu,
  ariaLabel,
}) {
  const style = {
    '--planet-x': `${x}px`,
    '--planet-y': `${y}px`,
    '--planet-size': `${size}px`,
  };
  const activatable = interactive && !disabled && typeof onActivate === 'function';
  const menuEnabled = !disabled && typeof onOpenMenu === 'function';
  const focusable = activatable || menuEnabled;
  const className = [
    'lifemapV2Planet',
    central ? 'lifemapV2PlanetCentral' : 'lifemapV2PlanetOrbit',
    !central && variant === 'muted' ? 'lifemapV2PlanetMuted' : '',
    focusable ? 'lifemapV2PlanetInteractive' : '',
  ].filter(Boolean).join(' ');

  const openMenu = (event) => {
    if (!menuEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu({
      clientX: Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2,
      clientY: Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : rect.top + rect.height / 2,
      returnFocus: event.currentTarget,
    });
  };

  const handleKeyDown = (event) => {
    if (menuEnabled && event.shiftKey && event.key === 'F10') {
      openMenu(event);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (activatable) onActivate();
      else if (menuEnabled) openMenu(event);
    }
  };

  return (
    <div
      className={className}
      style={style}
      role={focusable ? 'button' : undefined}
      tabIndex={focusable ? 0 : undefined}
      aria-disabled={focusable ? disabled : undefined}
      aria-haspopup={menuEnabled ? 'menu' : undefined}
      aria-label={ariaLabel || title}
      onClick={activatable ? onActivate : undefined}
      onContextMenu={menuEnabled ? openMenu : undefined}
      onKeyDown={focusable ? handleKeyDown : undefined}
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
