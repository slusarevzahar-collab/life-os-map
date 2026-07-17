// LifeMap UI V2 — renders one visual level and reports activation/menu events.
import { Planet } from './Planet.jsx';

const CENTER_X = 640;
const CENTER_Y = 400;

export function OrbitSystem({
  level,
  disabled = false,
  onPlanetActivate,
  onCoreActivate,
  onOpenNodeMenu,
}) {
  if (!level) return null;
  const { core, orbit, rings, planets = [] } = level;
  const ringSizes = Array.isArray(rings) && rings.length ? rings : [orbit?.size ?? 500];

  return (
    <div className="lifemapV2OrbitSystem">
      {ringSizes.map((size, index) => (
        <div
          key={`${level.id || 'level'}-ring-${index}`}
          className="lifemapV2OrbitRing"
          style={{
            '--orbit-x': `${CENTER_X}px`,
            '--orbit-y': `${CENTER_Y}px`,
            '--orbit-size': `${size}px`,
          }}
        />
      ))}
      <Planet
        central
        x={CENTER_X}
        y={CENTER_Y}
        size={core?.size ?? 196}
        title={core?.title}
        sublabel={core?.sublabel}
        interactive={Boolean(onCoreActivate)}
        disabled={disabled}
        onActivate={onCoreActivate}
        onOpenMenu={onOpenNodeMenu ? (point) => onOpenNodeMenu(level.id, point) : undefined}
        ariaLabel={onCoreActivate ? `${core?.title} — назад, на предыдущий уровень` : `${core?.title} — меню действий`}
      />
      {planets.map((planet) => {
        const navigable = planet.navigable !== false;
        return (
          <Planet
            key={planet.id}
            x={planet.x}
            y={planet.y}
            size={planet.size}
            title={planet.title}
            metric={planet.metric}
            progress={planet.progress}
            variant={planet.variant}
            interactive={navigable}
            disabled={disabled}
            onActivate={navigable ? () => onPlanetActivate?.(planet) : undefined}
            onOpenMenu={onOpenNodeMenu ? (point) => onOpenNodeMenu(planet.id, point) : undefined}
            ariaLabel={`${planet.title} — открыть; Shift+F10 — действия`}
          />
        );
      })}
    </div>
  );
}
