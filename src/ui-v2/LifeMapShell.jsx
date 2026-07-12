// LifeMap UI V2 — root shell (Stage 4).
// Keeps the reviewed Stage-2/3 camera route/origin behavior and HUD layer
// EXACTLY as committed (pointThroughViewport, lateral parent-relative origin,
// morph, pill drag/snap, focus-return) and adds: real snapshot loading, the
// real LifeMap tree via the existing lib contracts, local alias/custom-object
// application (read-only), real Mission Control focus/queue, real Top HUD
// status, and V2 route persistence/validation. mapTreeMock remains the
// documented fallback for the cases in useLifeMapSnapshot/HANDOFF.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StageScaler } from './stage/StageScaler.jsx';
import { SpaceBackground } from './stage/SpaceBackground.jsx';
import { MapViewport, defaultViewport } from './stage/MapViewport.jsx';
import { useCameraFlight } from './stage/useCameraFlight.js';
import { pointThroughViewport } from './stage/cameraMath.js';
import { OrbitSystem } from './map/OrbitSystem.jsx';
import { mapTreeMock } from './mock/mapTreeMock.js';
import { TopHud } from './hud/TopHud.jsx';
import { MissionControl } from './mission/MissionControl.jsx';
import { LauncherPill, snapPillPosition } from './dock/LauncherPill.jsx';
import { useWindowMorph, WINDOW_RECTS } from './dock/useWindowMorph.js';
import { InboxWindow } from './windows/InboxWindow.jsx';
import { AssistantWindow } from './windows/AssistantWindow.jsx';
import { missionControlMock, inboxMock, assistantMock } from './mock/hudMock.js';

import { buildActionMap } from '../lib/actionMapModel.js';
import { applyTitleAliases, resolveFocus, buildFocusSequence } from '../lib/lifeMapSelectors.js';
import { useLifeMapSnapshot } from './data/useLifeMapSnapshot.js';
import { useLocalMapExtensions, useFocusQueueReadOnly, attachCustomObjects } from './adapters/localMapExtensions.js';
import { buildVisualTree } from './adapters/lifeMapUiAdapter.js';
import { readInitialRouteIds, validateRouteIds, deriveRouteFrames, persistRouteIds, sameRouteFrames } from './data/lifeMapV2Route.js';

const ROOT_ID = 'root';
const ROOT_ORIGIN = { x: 640, y: 400 };
const DESIGN_WIDTH = 1280;
const PILL_START = { x: 1122, y: 710 };

const STATUS_INFO = {
  loading: { label: 'LOADING', tone: 'loading' },
  connected: { label: 'CONNECTED', tone: 'connected' },
  'mock data': { label: 'MOCK', tone: 'mock' },
  'api offline': { label: 'OFFLINE', tone: 'offline' },
};

function isDebugMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('uiv2debug') === '1';
}

export function LifeMapShell() {
  const [route, setRoute] = useState([{ id: ROOT_ID, origin: ROOT_ORIGIN }]);
  const [viewportByLevel, setViewportByLevel] = useState({});
  const [dragging, setDragging] = useState(false);
  const [pill, setPill] = useState(PILL_START);
  const [pillDragging, setPillDragging] = useState(false);
  const [pillGhost, setPillGhost] = useState(false);
  const [pillLabelGhost, setPillLabelGhost] = useState(false);

  const pendingEntryRef = useRef(null);
  const homeChainRef = useRef(false);
  const stageScaleRef = useRef(1);
  const frameRef = useRef(null);
  const pillRef = useRef(null);
  const inboxSegRef = useRef(null);
  const aiSegRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const restoredRouteRef = useRef(false);
  const debugMode = useRef(isDebugMode()).current;

  // ---------- Stage 4: real data ----------
  const snapshotState = useLifeMapSnapshot();
  const { titleAliases, customObjects } = useLocalMapExtensions();
  const focusQueue = useFocusQueueReadOnly();

  const baseRootMap = useMemo(() => {
    try {
      return buildActionMap(snapshotState.snapshot);
    } catch {
      return null; // buildActionMap could not produce a safe root
    }
  }, [snapshotState.snapshot]);

  const rootMap = useMemo(() => {
    if (!baseRootMap) return null;
    try {
      return applyTitleAliases(attachCustomObjects(baseRootMap, customObjects), titleAliases);
    } catch {
      return baseRootMap;
    }
  }, [baseRootMap, customObjects, titleAliases]);

  const rootMapLooksEmpty = useMemo(() => {
    if (!rootMap) return true;
    return !(rootMap.children || []).some((child) => (child.children || []).length || (child.taskList || []).length);
  }, [rootMap]);

  // Fallback rules (documented in HANDOFF): before the first successful load
  // while offline; when buildActionMap/adapter could not produce a safe root;
  // or when a snapshot explicitly reports a mock source AND is vacuously empty.
  const useFallbackMock =
    !rootMap ||
    (snapshotState.status === 'api offline' && !snapshotState.hasLoadedOnce) ||
    (String(snapshotState.snapshot?.meta?.source || '').includes('mock') && rootMapLooksEmpty);

  const latestMapData = useMemo(() => {
    if (useFallbackMock) return mapTreeMock;
    try {
      const built = buildVisualTree(rootMap);
      return built && built.root ? built : mapTreeMock;
    } catch {
      return mapTreeMock;
    }
  }, [useFallbackMock, rootMap]);

  const latestMapIsFallback = latestMapData === mapTreeMock;
  const latestVisualBundle = useMemo(
    () => ({ mapData: latestMapData, rootMap, mapIsFallback: latestMapIsFallback }),
    [latestMapData, rootMap, latestMapIsFallback]
  );
  const [visualBundle, setVisualBundle] = useState(() => latestVisualBundle);
  const visualMapData = visualBundle.mapData;
  const visualMapIsFallback = visualBundle.mapIsFallback;

  const activeFocus = useMemo(() => {
    if (latestMapIsFallback || !rootMap) return null;
    try {
      return resolveFocus(rootMap, snapshotState.snapshot, focusQueue);
    } catch {
      return null;
    }
  }, [latestMapIsFallback, rootMap, snapshotState.snapshot, focusQueue]);

  const focusQueueItems = useMemo(() => {
    if (latestMapIsFallback || !rootMap || !activeFocus) return [];
    try {
      return buildFocusSequence(rootMap, activeFocus, focusQueue);
    } catch {
      return [];
    }
  }, [latestMapIsFallback, rootMap, activeFocus, focusQueue]);

  const missionControlData = useMemo(() => {
    if (latestMapIsFallback) return missionControlMock; // Stage-3 mock, fallback-only
    const now =
      activeFocus?.nextAction && activeFocus.title !== 'Фокус не выбран'
        ? `${activeFocus.title} — ${activeFocus.nextAction}`
        : activeFocus?.title || 'Фокус не выбран';
    const rest = focusQueueItems.slice(1);
    const next = rest[0]?.title || 'Очередь пуста';
    const queue = rest.slice(0, 12).map((item, index) => ({ n: String(index + 1).padStart(2, '0'), title: item.title }));
    return { now, next, queue };
  }, [latestMapIsFallback, activeFocus, focusQueueItems]);

  const effectiveStatus = latestMapIsFallback && snapshotState.status !== 'api offline' ? 'mock data' : snapshotState.status;
  const statusInfo = STATUS_INFO[effectiveStatus] || STATUS_INFO.connected;

  // ---------- camera / morph (Stage 2/3, unmodified logic) ----------
  const cameraFlight = useCameraFlight({
    onSwap: (targetId, mode, flightOrigin) => {
      pendingEntryRef.current = { mode, origin: flightOrigin };
      setRoute((prev) => {
        if (mode === 'ascend') return prev.slice(0, -1);
        if (mode === 'lateral') {
          const parentFrame = prev.length > 1 ? prev[prev.length - 2] : null;
          const parentLevel = parentFrame ? visualMapData[parentFrame.id] : null;
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

  const morph = useWindowMorph({
    onClosed: (target) => {
      pendingFocusRef.current = target;
      setPillGhost(false);
      setPillLabelGhost(false);
    },
  });

  const currentFrame = route[route.length - 1];
  const level = visualMapData[currentFrame.id] || visualMapData.root || mapTreeMock.root;
  const parentFrame = route.length > 1 ? route[route.length - 2] : null;
  const flying = cameraFlight.phase !== 'idle';
  const windowActive = morph.isActive;
  const busy = flying || morph.isBusy;
  const interactionLocked = busy || windowActive || pillDragging;

  useEffect(() => {
    const measure = () => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) stageScaleRef.current = rect.width / DESIGN_WIDTH;
    };

    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('orientationchange', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  useEffect(() => {
    const pending = pendingEntryRef.current;
    if (!pending) return;
    pendingEntryRef.current = null;
    cameraFlight.playEntry(pending.mode, pending.origin);
    // Entry begins only after React rendered the next level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame.id]);

  useEffect(() => {
    if (!homeChainRef.current || cameraFlight.phase !== 'idle') return;
    if (route.length <= 1) {
      homeChainRef.current = false;
      return;
    }
    ascendOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraFlight.phase, route.length]);

  useEffect(() => {
    if (morph.state !== 'closed' || !pendingFocusRef.current) return undefined;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const frameId = window.requestAnimationFrame(() => {
      const segment = target === 'assistant' ? aiSegRef.current : inboxSegRef.current;
      segment?.focus?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [morph.state]);

  const getViewport = (levelId) => viewportByLevel[levelId] || defaultViewport();
  const setViewport = (levelId, next) => {
    setViewportByLevel((prev) => ({ ...prev, [levelId]: next }));
  };

  const deriveFramesForMap = (ids, data) => {
    const frames = deriveRouteFrames(ids, (id) => data[id]);
    return frames.map((frame, index) => {
      if (index === 0) return frame;
      const parentId = ids[index - 1];
      const planet = data[parentId]?.planets?.find((item) => item.id === frame.id);
      if (!planet) return frame;
      return {
        ...frame,
        origin: pointThroughViewport(planet, getViewport(parentId)),
      };
    });
  };

  // Apply a newly loaded visual tree only when camera exit/entry and window
  // morph phases are idle. Snapshot state may update in the background, but
  // the rendered level cannot be replaced in the middle of a transition.
  useEffect(() => {
    if (flying || morph.isBusy) return;

    const nextBundle = latestVisualBundle;
    setVisualBundle((current) => (current === nextBundle ? current : nextBundle));

    setRoute((currentRoute) => {
      if (nextBundle.mapIsFallback || !nextBundle.rootMap || !snapshotState.hasLoadedOnce) {
        if (!nextBundle.mapData[currentRoute[currentRoute.length - 1]?.id]) {
          return [{ id: ROOT_ID, origin: ROOT_ORIGIN }];
        }
        return currentRoute;
      }

      const sourceIds = restoredRouteRef.current
        ? currentRoute.map((frame) => frame.id)
        : readInitialRouteIds();
      const validIds = validateRouteIds(sourceIds, nextBundle.rootMap, (id) => nextBundle.mapData[id]);
      const nextFrames = deriveFramesForMap(validIds, nextBundle.mapData);
      restoredRouteRef.current = true;
      return sameRouteFrames(currentRoute, nextFrames) ? currentRoute : nextFrames;
    });
    // deriveFramesForMap intentionally reads the current per-level viewports so
    // refreshed layouts preserve the correct visual ascend origin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestVisualBundle, flying, morph.isBusy, snapshotState.hasLoadedOnce, viewportByLevel]);

  useEffect(() => {
    if (visualMapIsFallback || !restoredRouteRef.current || !snapshotState.hasLoadedOnce) return;
    persistRouteIds(route.map((frame) => frame.id));
  }, [route, visualMapIsFallback, snapshotState.hasLoadedOnce]);

  const handlePlanetActivate = (planet) => {
    if (interactionLocked || cameraFlight.isFlying()) return;
    const targetLevel = visualMapData[planet.id];
    if (!targetLevel) return;
    const isSameParent = targetLevel.parentId === level?.parentId && targetLevel.id !== currentFrame.id;
    const mode = isSameParent && level?.parentId != null ? 'lateral' : 'descend';
    const visualOrigin = pointThroughViewport(planet, getViewport(currentFrame.id));
    cameraFlight.flyTo(mode, visualOrigin, planet.id);
  };

  function ascendOnce() {
    const current = route[route.length - 1];
    const parent = route.length > 1 ? route[route.length - 2] : null;
    if (!parent || cameraFlight.isFlying()) return;
    cameraFlight.flyTo('ascend', current.origin, parent.id);
  }

  const handleBack = () => {
    if (interactionLocked || !parentFrame) return;
    ascendOnce();
  };

  const handleHome = () => {
    if (interactionLocked || route.length <= 1) return;
    homeChainRef.current = true;
    ascendOnce();
  };

  const handlePillDragEnd = (wasDragging) => {
    setPillDragging(false);
    if (wasDragging) setPill((current) => snapPillPosition(current.x, current.y));
  };

  const segmentDesignRect = (target) => {
    const segment = target === 'assistant' ? aiSegRef.current : inboxSegRef.current;
    const frame = frameRef.current;
    if (!segment || !frame) return null;

    const scale = stageScaleRef.current || 1;
    const segmentRect = segment.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      x: (segmentRect.left - frameRect.left) / scale,
      y: (segmentRect.top - frameRect.top) / scale,
      w: segmentRect.width / scale,
      h: segmentRect.height / scale,
      r: 18,
    };
  };

  const openWindow = (target) => {
    if (interactionLocked) return;
    const startRect = segmentDesignRect(target);
    if (!startRect) return;
    setPillGhost(true);
    setPillLabelGhost(true);
    morph.open(target, startRect);
  };

  const closeWindow = () => {
    if (morph.state !== 'open') return;
    const endRect = segmentDesignRect(morph.target) || segmentDesignRect('inbox');
    if (!endRect) return;
    morph.close(endRect);
  };

  const windowRectStyle = (target) => {
    const rect = WINDOW_RECTS[target];
    return rect
      ? { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }
      : undefined;
  };

  const showBackNav = Boolean(parentFrame) && !windowActive;

  return (
    <div className="lifemapV2">
      <StageScaler>
        <div ref={frameRef} className={`lifemapV2Frame${dragging ? ' lifemapV2Dragging' : ''}`}>
          <SpaceBackground pose={cameraFlight.pose} />

          <div ref={cameraFlight.layerRef} className="lifemapV2CameraLayer">
            <MapViewport
              disabled={interactionLocked}
              viewport={getViewport(currentFrame.id)}
              onViewportChange={(next) => setViewport(currentFrame.id, next)}
              onDragStateChange={setDragging}
            >
              <OrbitSystem
                level={level}
                disabled={interactionLocked}
                onPlanetActivate={handlePlanetActivate}
                onCoreActivate={parentFrame ? handleBack : undefined}
              />
            </MapViewport>
          </div>

          <div className="lifemapV2HudLayer">
            <TopHud
              showBackNav={showBackNav}
              locked={interactionLocked}
              onBack={handleBack}
              onHome={handleHome}
              statusLabel={statusInfo.label}
              statusTone={statusInfo.tone}
              statusTitle={snapshotState.error || undefined}
            />
            <MissionControl data={missionControlData} hidden={windowActive} />

            <LauncherPill
              x={pill.x}
              y={pill.y}
              hidden={windowActive}
              activeTarget={windowActive ? morph.target : null}
              skinGhost={pillGhost}
              labelGhost={pillLabelGhost}
              locked={busy || windowActive}
              dragging={pillDragging}
              stageScaleRef={stageScaleRef}
              pillRef={pillRef}
              inboxSegRef={inboxSegRef}
              aiSegRef={aiSegRef}
              onDragMove={setPill}
              onDragStart={() => setPillDragging(true)}
              onDragEnd={handlePillDragEnd}
              onOpenInbox={() => openWindow('inbox')}
              onOpenAssistant={() => openWindow('assistant')}
            />

            <div ref={morph.morphRef} className="lifemapV2MorphFrame" aria-hidden="true" />

            {morph.target === 'inbox' && morph.isActive ? (
              <div className="lifemapV2WindowMount" style={windowRectStyle('inbox')}>
                <InboxWindow
                  data={inboxMock}
                  state={morph.state}
                  contentVisible={morph.contentVisible}
                  onClose={closeWindow}
                />
              </div>
            ) : null}

            {morph.target === 'assistant' && morph.isActive ? (
              <div className="lifemapV2WindowMount" style={windowRectStyle('assistant')}>
                <AssistantWindow
                  data={assistantMock}
                  state={morph.state}
                  contentVisible={morph.contentVisible}
                  onClose={closeWindow}
                />
              </div>
            ) : null}
          </div>

          {debugMode ? (
            <button
              type="button"
              className="lifemapV2DebugBack"
              disabled={interactionLocked || !parentFrame}
              onClick={handleBack}
            >
              DEBUG · Back
            </button>
          ) : null}
        </div>
      </StageScaler>
    </div>
  );
}
