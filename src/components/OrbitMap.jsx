import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { topItems } from '../lib/lifeMapSelectors.js';

const ROOT_ORDER = ['sphere-projects', 'sphere-goals', 'sphere-backlog', 'sphere-sessions', 'sphere-life'];
const ROOT_POSITIONS = {
  'sphere-projects': { x: 640, y: 150 },
  'sphere-goals': { x: 890, y: 400 },
  'sphere-backlog': { x: 390, y: 400 },
  'sphere-sessions': { x: 810, y: 625 },
  'sphere-life': { x: 470, y: 625 },
};

function canonicalTitle(node = {}) {
  if (node?.id === 'sphere-inbox' || node?.id === 'inbox-signals' || node?.title === 'AI Inbox') return 'LM Inbox';
  return node?.title || '';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stageScale() {
  if (typeof window === 'undefined') return 1;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--claude-stage-scale');
  return Number.parseFloat(value) || 1;
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
  const center = { x: 640, y: 410 };
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
    result.push({ x: 640 + (index % 5) * 126 - 252, y: 742 + Math.floor(index / 5) * 124 });
  }
  return result;
}

function positionFor(node, index, items, isRoot) {
  if (isRoot && ROOT_POSITIONS[node.id]) return ROOT_POSITIONS[node.id];
  return radialPositions(items.length)[index] || { x: 640, y: 150 };
}

function progressValue(node) {
  return Math.max(0, Math.min(100, Math.round(Number(node?.progress) || 0)));
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

function initialCameraPose(isRoot) {
  if (typeof window === 'undefined') return { opacity: 0, scale: isRoot ? 0.96 : 0.55, filter: 'blur(3px)' };
  const origin = window.__lifemapCameraOrigin;
  if (isRoot && origin) {
    return {
      opacity: 0,
      x: 640 - Number(origin.x || 640),
      y: 400 - Number(origin.y || 400),
      scale: 3.4,
      filter: 'blur(3px)',
    };
  }
  return { opacity: 0, scale: isRoot ? 0.96 : 0.55, filter: 'blur(3px)' };
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
  const controls = useAnimationControls();
  const pressTimer = useRef(null);
  const panRef = useRef(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const [flying, setFlying] = useState(false);
  const coreEditing = inlineEditor?.nodeId === map.id;
  const coreTitle = canonicalTitle(map);
  const initialPose = useMemo(() => initialCameraPose(isRoot), [map.id, isRoot]);

  useEffect(() => {
    controls.start({ opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }, {
      duration: isRoot ? 0.35 : 0.34,
      ease: [0.22, 1, 0.36, 1],
    });
    if (isRoot && typeof window !== 'undefined') {
      const timer = window.setTimeout(() => { window.__lifemapCameraOrigin = null; }, 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [controls, isRoot, map.id]);

  const clearPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const startPress = (node, event) => {
    if (event.pointerType === 'mouse') return;
    const point = { clientX: event.clientX, clientY: event.clientY };
    pressTimer.current = window.setTimeout(() => onOpenMenu(node, point), 560);
  };

  const startCanvasDrag = (event) => {
    if (flying || event.target.closest('button, input, textarea')) return;
    event.preventDefault();
    panRef.current = { startX: event.clientX, startY: event.clientY, baseX: viewport.x, baseY: viewport.y };
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
    setViewport((current) => ({ ...current, scale: clamp(current.scale + direction * 0.08, 0.72, 1.65) }));
  };

  const flyToNode = async (node, position) => {
    if (flying) return;
    setFlying(true);
    if (typeof window !== 'undefined') window.__lifemapCameraOrigin = position;
    const tx = 640 - position.x;
    const ty = 400 - position.y;
    await controls.start({
      opacity: 0,
      x: tx,
      y: ty,
      scale: 3.8,
      filter: 'blur(3px)',
    }, {
      duration: 0.28,
      ease: [0.45, 0.05, 0.85, 0.4],
    });
    onOpen(node.id);
  };

  return (
    <motion.section
      key={map.id}
      className={`mapStage ${hasSide ? 'mapWithSide' : ''} ${draggingCanvas ? 'draggingCanvas' : ''}`}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: isRoot ? 1.08 : 0.6, filter: 'blur(3px)' }}
      transition={{ duration: 0.25, ease: [0.45, 0.05, 0.85, 0.4] }}
      onPointerDown={startCanvasDrag}
      onPointerMove={moveCanvasDrag}
      onPointerUp={endCanvasDrag}
      onPointerCancel={endCanvasDrag}
      onWheel={zoomCanvas}
    >
      <motion.div className="cameraShell" initial={initialPose} animate={controls}>
        <div className="mapCanvas" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
          <div className="mapGlow" />
          <div className="orbit orbit1" />
          <div className="orbit orbit2" />
          <div className="orbit orbit3" />

          <button
            className={`coreNode ${isRoot ? 'rootCore' : 'titleCore'} ${coreEditing ? 'editingTitle' : ''}`}
            onClick={(event) => coreEditing ? event.stopPropagation() : onOpenMenu(map, event)}
            onContextMenu={(event) => onOpenMenu(map, event)}
          >
            {coreEditing ? (
              <PlanetTitleEditor
                value={inlineEditor.value}
                onChange={onInlineRenameChange}
                onSubmit={(event) => onSubmitInlineRename(map, event)}
                onCancel={onCancelInlineRename}
              />
            ) : <b>{isRoot ? 'LifeMap' : coreTitle}</b>}
          </button>

          {children.map((node, index) => {
            const title = canonicalTitle(node);
            const position = positionFor(node, index, children, isRoot);
            const editing = inlineEditor?.nodeId === node.id;
            const active = node.state === 'active' || node.state === 'next';
            const style = {
              left: `${position.x}px`,
              top: `${position.y}px`,
              '--planet-arc': active ? '#57e0a8' : 'transparent',
              '--planet-arc-opacity': active ? 0.85 : 0,
              '--planet-arc-rotation': `${-40 + index * 27}deg`,
              '--planet-label': node.id === 'sphere-backlog' ? '#c7d0dc' : '#eef2f8',
              '--planet-meta': active ? 'rgba(120,200,165,.8)' : 'rgba(140,155,175,.7)',
              '--float-delay': `${index * -0.72}s`,
            };

            const content = (
              <span className="nodeOrb">
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
            );

            if (editing) {
              return <div key={node.id} className={`mapNode orbitNode state-${node.state} editingTitle`} style={style}>{content}</div>;
            }

            return (
              <button
                key={node.id}
                className={`mapNode orbitNode state-${node.state}`}
                style={style}
                title={`${title} · ${planetMeta(node)}`}
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
      </motion.div>
    </motion.section>
  );
}
