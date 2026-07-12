// LifeMap UI V2 — OrbitSystem (Stage 2)
// Renders the supplied level description and reports activations upward.
// It owns no route, camera, API, or viewport state.
import { Planet } from './Planet.jsx';

const CENTER_X = 640;
const CENTER_Y = 400;

export function OrbitSystem({ level, disabled = false, onPlanetActivate, onCoreActivate }) {
  if (!level) return null;
  const { core, orbit, planets = [] } = level;

  return (
    <div className="lifemapV2OrbitSystem">
      <div
        className="lifemapV2OrbitRing"
        style={{
          '--orbit-x': `${CENTER_X}px`,
          '--orbit-y': `${CENTER_Y}px`,
          '--orbit-size': `${orbit?.size ?? 500}px`,
        }}
      />
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
        ariaLabel={onCoreActivate ? `${core?.title} — назад, на предыдущий уровень` : core?.title}
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
            ariaLabel={`${planet.title} — открыть`}
          />
        );
      })}
    </div>
  );
}
