import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';
import { topItems } from '../lib/lifeMapSelectors.js';

const DESIGN_CENTER_X = 640;
const DESIGN_CENTER_Y = 400;
const DEFAULT_FLIGHT_MS = 600;
const BLUR_PX = 3;
const CAMERA_STATE_KEY = 'lifemap.claude.camera.v1';
const VIEWPORT_STORAGE_KEY = 'lifemap.map.viewport.v2';
const SOURCE_EASE_IN = 'cubic-bezier(.45,.05,.85,.4)';
const SOURCE_EASE_OUT = 'cubic-bezier(.22,1,.36,1)';

const ROOT_ORDER = [
  'sphere-projects',
  'sphere-goals',
  'sphere-backlog',
  'sphere-sessions',
  'sphere-life',
];

const ROOT_POSITIONS = {
  'sphere-projects': { x: 640, y: 150 },
  'sphere-goals': { x: 890, y: 400 },
  'sphere-backlog': { x: 390, y: 400 },
  'sphere-sessions': { x: 810, y: 625 },
  'sphere-life': { x: 470, y: 625 },
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function reducedMotionEnabled() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function stageScale() {
  if (typeof window === 'undefined') return 1;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--claude-stage-scale');
  return Number.parseFloat(value) || 1;
}

function canonicalTitle(node = {}) {
  if (node?.id === 'sphere-inbox' || node?.id === 'inbox-signals' || node?.title === 'AI Inbox') return 'LM Inbox';
  return node?.title || '';
}

function progressValue(node = {}) {
  return clamp(Math.round(Number(node.progress) || 0), 0, 100);
}

function planetMeta(node = {}) {
  const active = Number(node.tasks) || 0;
  const total = Number(node.totalTasks) || 0;
  if (node.id === 'sphere-projects') return `${active} active`;
  if (node.id === 'sphere-goals') return `${progressValue(node)}%`;
  if (node.id === 'sphere-backlog') return `${total} later`;
  if (node.id === 'sphere-sessions') return `${total} logs`;
  if (node.id === 'sphere-life') return `${node.children?.length || total} areas`;
  if (active) return `${active} active`;
  if (total) return `${total} items`;
  return `${progressValue(node)}%`;
}

function visualItems(map) {
  const isRoot = map?.id === 'root';
  const items = topItems(map).filter((node) => !(isRoot && node.id === 'sphere-inbox'));
  if (!isRoot) return items;
  const rank = new Map(ROOT_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

function radialPositions(count) {
  if (!count) return [];
  const center = { x: DESIGN_CENTER_X, y: 410 };
  const rings = [
    { capacity: 6, radiusX: 190, radiusY: 170 },
    { capacity: 10, radiusX: 300, radiusY: 260 },
    { capacity: 14, radiusX: 410, radiusY: 335 },
  ];
  const result = [];
  let remaining = count;
  let offset = 0;

  rings.forEach((ring, ringIndex) => {
    if (remaining <= 0) return;
    const amount = Math.min(remaining, ring.capacity);
    for (let index = 0; index < amount; index += 1) {
      const angle = -Math.PI / 2 + ((Math.PI * 2) / amount) * index + ringIndex * 0.16;
      result.push({
        x: center.x + Math.cos(angle) * ring.radiusX,
        y: center.y + Math.sin(angle) * ring.radiusY,
      });
    }
    remaining -= amount;
    offset += amount;
  });

  while (result.length < count) {
    const index = result.length - offset;
    result.push({
      x: 640 + (index % 5) * 126 - 252,
      y: 742 + Math.floor(index / 5) * 124,
    });
  }

  return result;
}

function positionFor(node, index, items, isRoot) {
  if (isRoot && ROOT_POSITIONS[node.id]) return ROOT_POSITIONS[node.id];
  return radialPositions(items.length)[index] || { x: DESIGN_CENTER_X, y: 150 };
}

function readViewport(mapId) {
  if (typeof window === 'undefined') return { x: 0, y: 0, scale: 1 };
  try {
    const all = JSON.parse(window.localStorage.getItem(VIEWPORT_STORAGE_KEY) || '{}');
    const saved = all?.[mapId];
    return {
      x: Number(saved?.x) || 0,
      y: Number(saved?.y) || 0,
      scale: clamp(Number(saved?.scale) || 1, 0.72, 1.65),
    };
  } catch {
    return { x: 0, y: 0, scale: 1 };
  }
}

function writeViewport(mapId, viewport) {
  if (typeof window === 'undefined') return;
  try {
    const all = JSON.parse(window.localStorage.getItem(VIEWPORT_STORAGE_KEY) || '{}');
    all[mapId] = viewport;
    window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

function writeCameraState(value) {
  if (typeof window === 'undefined') return;
  window.__lifemapCameraState = value;
  try {
    if (value) window.sessionStorage.setItem(CAMERA_STATE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(CAMERA_STATE_KEY);
  } catch {}
}

function readCameraState(targetId) {
  if (typeof window === 'undefined') return null;
  let value = window.__lifemapCameraState || null;
  if (!value) {
    try {
      value = JSON.parse(window.sessionStorage.getItem(CAMERA_STATE_KEY) || 'null');
    } catch {
      value = null;
    }
  }
  if (!value || value.targetId !== targetId) return null;
  writeCameraState(null);
  return value;
}

function cancelAnimations(element) {
  element?.getAnimations?.().forEach((animation) => animation.cancel());
}

function settleElement(element) {
  if (!element) return;
  cancelAnimations(element);
  element.style.opacity = '1';
  element.style.transform = 'none';
  element.style.filter = 'none';
  element.style.transformOrigin = '50% 50%';
}

function animateElement(element, keyframes, options) {
  return new Promise((resolve) => {
    if (!element || document.hidden || reducedMotionEnabled()) {
      settleElement(element);
      resolve();
      return;
    }

    cancelAnimations(element);
    const animation = element.animate(keyframes, options);
    let complete = false;
    const finish = () => {
      if (complete) return;
      complete = true;
      resolve();
    };
    animation.addEventListener('finish', finish, { once: true });
    animation.addEventListener('cancel', finish, { once: true });
    window.setTimeout(finish, Number(options.duration || 0) + 140);
  });
}

function setBackgroundCamera({ camIn, origin, focusOpen = false }) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const ox = Number(origin?.x) || DESIGN_CENTER_X;
  const oy = Number(origin?.y) || DESIGN_CENTER_Y;
  const backgroundOrigin = camIn ? `${ox + 128}px ${oy + 80}px` : '640px 400px';
  const backgroundTransform = camIn
    ? `translate(${((DESIGN_CENTER_X - ox) * 0.16).toFixed(1)}px,${((DESIGN_CENTER_Y - oy) * 0.16).toFixed(1)}px) scale(1.32)`
    : focusOpen
      ? 'translate(20.4px,-1.8px) scale(1.06)'
      : 'translate(0px,0px) scale(1)';

  root.style.setProperty('--claude-bg-origin', backgroundOrigin);
  root.style.setProperty('--claude-bg-transform', backgroundTransform);
  root.style.setProperty('--claude-bg-ms', `${DEFAULT_FLIGHT_MS + 550}ms`);
  root.style.setProperty('--claude-dim-opacity', camIn ? '1' : '0');
}

function PlanetTitleEditor({ value, onChange, onSubmit, onCancel }) {
  return (
    <input
      className="inlineTitleInput planetTitleInput"
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onSubmit}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit(event);
        if (event.key === 'Escape') onCancel(event);
      }}
    />
  );
}

export function OrbitMap({
  map,
  hasSide,
  onOpen,
  onOpenMenu,
  inlineEditor,
  onInlineRenameChange,
  onSubmitInlineRename,
  onCancelInlineRename,
}) {
  const isRoot = map.id === 'root';
  const children = useMemo(() => visualItems(map), [map]);
  const shellRef = useRef(null);
  const pressTimer = useRef(null);
  const panRef = useRef(null);
  const settleTimer = useRef(null);
  const [viewport, setViewport] = useState(() => readViewport(map.id));
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const [flying, setFlying] = useState(false);
  const coreEditing = inlineEditor?.nodeId === map.id;
  const coreTitle = canonicalTitle(map);

  useLayoutEffect(() => {
    setViewport(readViewport(map.id));
  }, [map.id]);

  useLayoutEffect(() => {
    writeViewport(map.id, viewport);
  }, [map.id, viewport]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const entry = readCameraState(map.id);
    const origin = entry?.origin || window.__lifemapLastCameraOrigin || { x: DESIGN_CENTER_X, y: DESIGN_CENTER_Y };
    setBackgroundCamera({ camIn: !isRoot, origin });

    const settle = () => settleElement(shell);
    settle();

    if (document.hidden || reducedMotionEnabled()) return undefined;

    let duration = 300;
    const transformOrigin = `${origin.x}px ${origin.y}px`;
    let keyframes = [
      { opacity: 0, transform: 'scale(.9)' },
      { opacity: 1, transform: 'scale(1)' },
    ];

    if (entry?.mode === 'descend') {
      duration = Math.round(DEFAULT_FLIGHT_MS * 0.54);
      keyframes = [
        { opacity: 0, transform: 'scale(.55)', filter: `blur(${BLUR_PX}px)` },
        { opacity: 1, transform: 'scale(.86)', filter: `blur(${BLUR_PX * 0.25}px)`, offset: 0.45 },
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
      ];
    } else if (entry?.mode === 'ascend') {
      duration = Math.round(DEFAULT_FLIGHT_MS * 0.58);
      const tx = DESIGN_CENTER_X - origin.x;
      const ty = DESIGN_CENTER_Y - origin.y;
      keyframes = [
        { opacity: 0, transform: `translate(${tx}px,${ty}px) scale(3.4)`, filter: `blur(${BLUR_PX}px)` },
        { opacity: 1, transform: `translate(${(tx * 0.5).toFixed(1)}px,${(ty * 0.5).toFixed(1)}px) scale(1.7)`, filter: `blur(${BLUR_PX * 0.3}px)`, offset: 0.5 },
        { opacity: 1, transform: 'translate(0px,0px) scale(1)', filter: 'blur(0px)' },
      ];
    }

    shell.style.transformOrigin = transformOrigin;
    animateElement(shell, keyframes, { duration, easing: SOURCE_EASE_OUT, fill: 'both' }).then(settle);
    settleTimer.current = window.setTimeout(settle, duration + 120);

    return () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      cancelAnimations(shell);
    };
  }, [isRoot, map.id]);

  useLayoutEffect(() => {
    const handleFocusZoom = (event) => {
      if (!isRoot) return;
      setBackgroundCamera({
        camIn: false,
        origin: { x: DESIGN_CENTER_X, y: DESIGN_CENTER_Y },
        focusOpen: Boolean(event.detail?.open),
      });
    };

    window.addEventListener('lifemap:focus-zoom', handleFocusZoom);
    return () => window.removeEventListener('lifemap:focus-zoom', handleFocusZoom);
  }, [isRoot]);

  useLayoutEffect(() => {
    const prepareReturn = async () => {
      const shell = shellRef.current;
      const origin = window.__lifemapLastCameraOrigin || { x: DESIGN_CENTER_X, y: DESIGN_CENTER_Y };
      setFlying(true);
      setBackgroundCamera({ camIn: false, origin });
      writeCameraState({ mode: 'ascend', origin, targetId: 'root' });

      if (!shell || document.hidden || reducedMotionEnabled()) return origin;
      shell.style.transformOrigin = '50% 50%';
      await animateElement(shell, [
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'scale(.6)', filter: `blur(${BLUR_PX * 0.8}px)` },
      ], {
        duration: Math.round(DEFAULT_FLIGHT_MS * 0.42),
        easing: SOURCE_EASE_IN,
        fill: 'forwards',
      });
      return origin;
    };

    const prepareOverlayExit = async () => {
      const shell = shellRef.current;
      if (!shell || document.hidden || reducedMotionEnabled()) return;
      shell.style.transformOrigin = '50% 50%';
      await animateElement(shell, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.04)' },
      ], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    };

    const restoreOverlay = async (origin = { x: DESIGN_CENTER_X, y: DESIGN_CENTER_Y }) => {
      const shell = shellRef.current;
      if (!shell) return;
      settleElement(shell);
      if (document.hidden || reducedMotionEnabled()) return;
      const tx = DESIGN_CENTER_X - Number(origin.x || DESIGN_CENTER_X);
      const ty = DESIGN_CENTER_Y - Number(origin.y || DESIGN_CENTER_Y);
      shell.style.transformOrigin = `${origin.x || DESIGN_CENTER_X}px ${origin.y || DESIGN_CENTER_Y}px`;
      await animateElement(shell, [
        { opacity: 0, transform: `translate(${tx}px,${ty}px) scale(3.4)`, filter: `blur(${BLUR_PX}px)` },
        { opacity: 1, transform: `translate(${(tx * 0.5).toFixed(1)}px,${(ty * 0.5).toFixed(1)}px) scale(1.7)`, filter: `blur(${BLUR_PX * 0.3}px)`, offset: 0.5 },
        { opacity: 1, transform: 'translate(0px,0px) scale(1)', filter: 'blur(0px)' },
      ], {
        duration: Math.round(DEFAULT_FLIGHT_MS * 0.58),
        easing: SOURCE_EASE_OUT,
        fill: 'both',
      });
      settleElement(shell);
    };

    window.__lifemapPrepareCameraReturn = prepareReturn;
    window.__lifemapPrepareOverlayExit = prepareOverlayExit;
    window.__lifemapRestoreOverlay = restoreOverlay;

    return () => {
      if (window.__lifemapPrepareCameraReturn === prepareReturn) window.__lifemapPrepareCameraReturn = null;
      if (window.__lifemapPrepareOverlayExit === prepareOverlayExit) window.__lifemapPrepareOverlayExit = null;
      if (window.__lifemapRestoreOverlay === restoreOverlay) window.__lifemapRestoreOverlay = null;
    };
  }, [map.id]);

  const clearPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const startPress = (node, event) => {
    if (event.pointerType === 'mouse' || flying) return;
    const point = { clientX: event.clientX, clientY: event.clientY };
    pressTimer.current = window.setTimeout(() => onOpenMenu(node, point), 560);
  };

  const startCanvasDrag = (event) => {
    if (flying || event.target.closest('button, input, textarea, select')) return;
    event.preventDefault();
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: viewport.x,
      baseY: viewport.y,
    };
    setDraggingCanvas(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveCanvasDrag = (event) => {
    if (!panRef.current) return;
    const scale = stageScale();
    const nextX = panRef.current.baseX + (event.clientX - panRef.current.startX) / scale;
    const nextY = panRef.current.baseY + (event.clientY - panRef.current.startY) / scale;
    setViewport((current) => ({ ...current, x: nextX, y: nextY }));
  };

  const endCanvasDrag = () => {
    panRef.current = null;
    setDraggingCanvas(false);
  };

  const zoomCanvas = (event) => {
    if (flying) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setViewport((current) => ({
      ...current,
      scale: clamp(current.scale + direction * 0.08, 0.72, 1.65),
    }));
  };

  const flyToNode = async (node, position) => {
    if (flying) return;
    const shell = shellRef.current;
    setFlying(true);
    window.__lifemapLastCameraOrigin = position;
    writeCameraState({ mode: 'descend', origin: position, targetId: node.id });
    setBackgroundCamera({ camIn: true, origin: position });

    if (!shell || document.hidden || reducedMotionEnabled()) {
      onOpen(node.id);
      return;
    }

    const tx = DESIGN_CENTER_X - position.x;
    const ty = DESIGN_CENTER_Y - position.y;
    const duration = Math.round(DEFAULT_FLIGHT_MS * 0.46);
    shell.style.transformOrigin = `${position.x}px ${position.y}px`;
    animateElement(shell, [
      { opacity: 1, transform: 'translate(0px,0px) scale(1)', filter: 'blur(0px)' },
      { opacity: 1, transform: `translate(${(tx * 0.45).toFixed(1)}px,${(ty * 0.45).toFixed(1)}px) scale(2.15)`, filter: `blur(${BLUR_PX * 0.5}px)`, offset: 0.6 },
      { opacity: 0, transform: `translate(${tx}px,${ty}px) scale(3.8)`, filter: `blur(${BLUR_PX}px)` },
    ], {
      duration,
      easing: SOURCE_EASE_IN,
      fill: 'forwards',
    });

    window.setTimeout(() => onOpen(node.id), Math.max(0, duration - 10));
  };

  return (
    <motion.section
      key={map.id}
      className={`mapStage ${hasSide ? 'mapWithSide' : ''} ${draggingCanvas ? 'draggingCanvas' : ''} ${flying ? 'cameraFlying' : ''}`}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.22, ease: 'easeIn' }}
      onPointerDown={startCanvasDrag}
      onPointerMove={moveCanvasDrag}
      onPointerUp={endCanvasDrag}
      onPointerCancel={endCanvasDrag}
      onWheel={zoomCanvas}
    >
      <div ref={shellRef} className="cameraShell">
        <div className="mapCanvas" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
          <div className="mapGlow" />
          <div className="orbit orbit1" />
          <div className="orbit orbit2" />
          <div className="orbit orbit3" />

          <button
            className={`coreNode ${isRoot ? 'rootCore' : 'titleCore'} ${coreEditing ? 'editingTitle' : ''}`}
            type="button"
            onClick={(event) => (coreEditing ? event.stopPropagation() : onOpenMenu(map, event))}
            onContextMenu={(event) => onOpenMenu(map, event)}
          >
            {coreEditing ? (
              <PlanetTitleEditor
                value={inlineEditor.value}
                onChange={onInlineRenameChange}
                onSubmit={(event) => onSubmitInlineRename(map, event)}
                onCancel={onCancelInlineRename}
              />
            ) : (
              <>
                <b>{isRoot ? 'LifeMap' : coreTitle}</b>
                <small>{isRoot ? 'HOME' : 'BRANCH'}</small>
              </>
            )}
          </button>

          {children.map((node, index) => {
            const title = canonicalTitle(node);
            const position = positionFor(node, index, children, isRoot);
            const editing = inlineEditor?.nodeId === node.id;
            const progress = progressValue(node);
            const style = {
              left: `${position.x}px`,
              top: `${position.y}px`,
              '--planet-progress': `${progress}%`,
              '--planet-arc-rotation': `${-40 + index * 27}deg`,
              '--planet-label': node.id === 'sphere-backlog' ? '#c7d0dc' : '#eef2f8',
              '--planet-meta': node.id === 'sphere-backlog' ? 'rgba(125,140,160,.62)' : 'rgba(120,200,165,.8)',
            };

            const content = (
              <span className="nodeOrb">
                <span className="planetArc" />
                <span className="planetContent">
                  {editing ? (
                    <PlanetTitleEditor
                      value={inlineEditor.value}
                      onChange={onInlineRenameChange}
                      onSubmit={(event) => onSubmitInlineRename(node, event)}
                      onCancel={onCancelInlineRename}
                    />
                  ) : <em>{title}</em>}
                  <small>{planetMeta(node)}</small>
                </span>
              </span>
            );

            if (editing) {
              return (
                <div key={node.id} className={`mapNode orbitNode state-${node.state} editingTitle`} style={style}>
                  {content}
                </div>
              );
            }

            return (
              <button
                key={node.id}
                className={`mapNode orbitNode state-${node.state}`}
                style={style}
                type="button"
                title={`${title} · ${planetMeta(node)} · ${progress}%`}
                onContextMenu={(event) => onOpenMenu(node, event)}
                onPointerDown={(event) => startPress(node, event)}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onClick={() => flyToNode(node, position)}
                disabled={flying}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
