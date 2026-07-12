// LifeMap UI V2 — OrbitSystem (Stage 4)
// Renders the supplied level description and reports activations upward.
// It owns no route, camera, API, or viewport state.
//
// Stage 4 addition: supports an optional `level.rings` array (multiple ring
// diameters, drawn as concentric guide circles) so a level with more branch
// children than one ring comfortably fits can promote overflow onto further
// rings (see lifeMapUiAdapter.js's layout algorithm). Fully backward
// compatible with the Stage 2/3 shape — a level that only has `level.orbit`
// (mapTreeMock.js, still the documented fallback) renders exactly one ring,
// unchanged.
import { Planet } from './Planet.jsx';

const CENTER_X = 640;
const CENTER_Y = 400;

export function OrbitSystem({ level, disabled = false, onPlanetActivate, onCoreActivate }) {
  if (!level) return null;
  const { core, orbit, rings, planets = [] } = level;
  const ringSizes = Array.isArray(rings) && rings.length ? rings : [orbit?.size ?? 500];

  return (
    <div className="lifemapV2OrbitSystem">
      {ringSizes.map((size, index) => (
        <div
          key={index}
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
