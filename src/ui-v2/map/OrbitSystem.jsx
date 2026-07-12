// LifeMap UI V2 — OrbitSystem (Stage 1)
// Renders the orbit ring, the central core and the home-level planets from a
// plain mock array. Owns no API, no route, no camera animation.
import { Planet } from './Planet.jsx';

const CENTER_X = 640;
const CENTER_Y = 400;
const ORBIT_SIZE = 500;
const CORE = { title: 'LifeMap', sublabel: 'HOME', x: CENTER_X, y: CENTER_Y, size: 196 };

export function OrbitSystem({ planets = [] }) {
  return (
    <div className="lifemapV2OrbitSystem">
      <div
        className="lifemapV2OrbitRing"
        style={{
          '--orbit-x': `${CENTER_X}px`,
          '--orbit-y': `${CENTER_Y}px`,
          '--orbit-size': `${ORBIT_SIZE}px`,
        }}
      />
      <Planet central x={CORE.x} y={CORE.y} size={CORE.size} title={CORE.title} sublabel={CORE.sublabel} />
      {planets.map((planet) => (
        <Planet
          key={planet.id}
          x={planet.x}
          y={planet.y}
          size={planet.size}
          title={planet.title}
          metric={planet.metric}
          progress={planet.progress}
          variant={planet.variant}
        />
      ))}
    </div>
  );
}
