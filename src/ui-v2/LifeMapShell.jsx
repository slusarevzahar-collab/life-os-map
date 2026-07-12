// LifeMap UI V2 — root shell (Stage 2).
// Composes StageScaler > Frame > SpaceBackground + CameraFlightLayer >
// MapViewport > OrbitSystem. The mock route is a stack of {id, origin} frames;
// origin is the visual point used to enter that level, including the parent's
// stored pan/zoom, so ascending returns through the correct screen position.
import { useEffect, useRef, useState } from 'react';
import { StageScaler } from './stage/StageScaler.jsx';
import { SpaceBackground } from './stage/SpaceBackground.jsx';
import { MapViewport, defaultViewport } from './stage/MapViewport.jsx';
import { useCameraFlight } from './stage/useCameraFlight.js';
import { pointThroughViewport } from './stage/cameraMath.js';
import { OrbitSystem } from './map/OrbitSystem.jsx';
import { mapTreeMock } from './mock/mapTreeMock.js';

const ROOT_ID = 'root';
const ROOT_ORIGIN = { x: 640, y: 400 };

function isDebugMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('uiv2debug') === '1';
}

export function LifeMapShell() {
  const [route, setRoute] = useState([{ id: ROOT_ID, origin: ROOT_ORIGIN }]);
  const [viewportByLevel, setViewportByLevel] = useState({});
  const [dragging, setDragging] = useState(false);
  const pendingEntryRef = useRef(null);
  const debugMode = useRef(isDebugMode()).current;

  const cameraFlight = useCameraFlight({
    onSwap: (targetId, mode, flightOrigin) => {
      pendingEntryRef.current = { mode, origin: flightOrigin };
      setRoute((prev) => {
        if (mode === 'ascend') return prev.slice(0, -1);
        if (mode === 'lateral') {
          const parentFrame = prev.length > 1 ? prev[prev.length - 2] : null;
          const parentLevel = parentFrame ? mapTreeMock[parentFrame.id] : null;
          const targetInParent = parentLevel?.planets?.find((planet) => planet.id === targetId);
          const parentViewport = parentFrame
            ? viewportByLevel[parentFrame.id] || defaultViewport()
            : defaultViewport();
          const routeOrigin = targetInParent
            ? pointThroughViewport(targetInParent, parentViewport)
            : flightOrigin;
          return [...prev.slice(0, -1), { id: targetId, origin: routeOrigin }];
        }
        return [...prev, { id: targetId, origin: flightOrigin }];
      });
    },
  });

  const currentFrame = route[route.length - 1];
  const level = mapTreeMock[currentFrame.id];
  const parentFrame = route.length > 1 ? route[route.length - 2] : null;
  const flying = cameraFlight.phase !== 'idle';

  useEffect(() => {
    const pending = pendingEntryRef.current;
    if (!pending) return;
    pendingEntryRef.current = null;
    cameraFlight.playEntry(pending.mode, pending.origin);
    // The effect is intentionally keyed to the rendered level id. playEntry is
    // invoked only after the route swap has committed the new map DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame.id]);

  const getViewport = (levelId) => viewportByLevel[levelId] || defaultViewport();
  const setViewport = (levelId, next) => {
    setViewportByLevel((prev) => ({ ...prev, [levelId]: next }));
  };

  const handlePlanetActivate = (planet) => {
    if (flying || cameraFlight.isFlying()) return;
    const targetLevel = mapTreeMock[planet.id];
    if (!targetLevel) return;
    const isSameParent = targetLevel.parentId === level.parentId && targetLevel.id !== currentFrame.id;
    const mode = isSameParent && level.parentId != null ? 'lateral' : 'descend';
    const visualOrigin = pointThroughViewport(planet, getViewport(currentFrame.id));
    cameraFlight.flyTo(mode, visualOrigin, planet.id);
  };

  const handleCoreActivate = () => {
    if (flying || cameraFlight.isFlying() || !parentFrame) return;
    cameraFlight.flyTo('ascend', currentFrame.origin, parentFrame.id);
  };

  return (
    <div className="lifemapV2">
      <StageScaler>
        <div className={`lifemapV2Frame${dragging ? ' lifemapV2Dragging' : ''}`}>
          <SpaceBackground pose={cameraFlight.pose} />
          <div ref={cameraFlight.layerRef} className="lifemapV2CameraLayer">
            <MapViewport
              disabled={flying}
              viewport={getViewport(currentFrame.id)}
              onViewportChange={(next) => setViewport(currentFrame.id, next)}
              onDragStateChange={setDragging}
            >
              <OrbitSystem
                level={level}
                disabled={flying}
                onPlanetActivate={handlePlanetActivate}
                onCoreActivate={parentFrame ? handleCoreActivate : undefined}
              />
            </MapViewport>
          </div>
          {debugMode ? (
            <button
              type="button"
              className="lifemapV2DebugBack"
              disabled={flying || !parentFrame}
              onClick={handleCoreActivate}
            >
              DEBUG · Back
            </button>
          ) : null}
        </div>
      </StageScaler>
    </div>
  );
}
