import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { topItems } from '../lib/lifeMapSelectors.js';
import { mapVariants } from '../constants/lifeMap.js';

function planetSize(title = '') {
  const len = String(title).length;
  if (len > 54) return 226;
  if (len > 42) return 206;
  if (len > 30) return 184;
  if (len > 18) return 150;
  return 118;
}

function planetFontSize(title = '') {
  const len = String(title).length;
  if (len > 54) return 11;
  if (len > 42) return 12;
  if (len > 30) return 13;
  if (len > 18) return 14;
  return 16;
}

function progressValue(node) {
  return Math.max(0, Math.min(100, Math.round(Number(node.progress) || 0)));
}

function progressTitle(node) {
  const progress = progressValue(node);
  const done = Number(node.completedTasks) || 0;
  const total = Number(node.totalTasks) || 0;
  return total > 0 ? `${progress}% · ${done}/${total}` : `${progress}%`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function OrbitMap({ map, hasSide, onOpen, onSelect, onOpenMenu }) {
  const children = topItems(map);
  const isRoot = map.id === 'root';
  const pressTimer = useRef(null);
  const panRef = useRef(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [draggingCanvas, setDraggingCanvas] = useState(false);

  const clearPress = () => { if (pressTimer.current) window.clearTimeout(pressTimer.current); pressTimer.current = null; };
  const startPress = (node, event) => {
    if (event.pointerType === 'mouse') return;
    const point = { clientX: event.clientX, clientY: event.clientY };
    pressTimer.current = window.setTimeout(() => onOpenMenu(node, point), 560);
  };

  const startCanvasDrag = (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    panRef.current = { startX: event.clientX, startY: event.clientY, baseX: viewport.x, baseY: viewport.y };
    setDraggingCanvas(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveCanvasDrag = (event) => {
    if (!panRef.current) return;
    const nextX = panRef.current.baseX + event.clientX - panRef.current.startX;
    const nextY = panRef.current.baseY + event.clientY - panRef.current.startY;
    setViewport((current) => ({ ...current, x: nextX, y: nextY }));
  };

  const endCanvasDrag = () => {
    panRef.current = null;
    setDraggingCanvas(false);
  };

  const zoomCanvas = (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setViewport((current) => ({ ...current, scale: clamp(current.scale + direction * 0.08, 0.72, 1.65) }));
  };

  const orbitShift = children.length <= 2 ? 'clamp(-215px, -20vw, -170px)' : 'clamp(-220px, -21vw, -190px)';

  return (
    <motion.section
      key={map.id}
      className={`mapStage ${hasSide ? 'mapWithSide' : ''} ${draggingCanvas ? 'draggingCanvas' : ''}`}
      variants={mapVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={startCanvasDrag}
      onPointerMove={moveCanvasDrag}
      onPointerUp={endCanvasDrag}
      onPointerCancel={endCanvasDrag}
      onWheel={zoomCanvas}
    >
      <div className="mapCanvas" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
        <div className="mapGlow" />
        <div className="orbit orbit1" />
        <div className="orbit orbit2" />
        <div className="orbit orbit3" />
        <motion.button
          className={`coreNode ${isRoot ? 'rootCore' : 'titleCore'}`}
          onClick={(event) => onOpenMenu(map, event)}
          onContextMenu={(event) => onOpenMenu(map, event)}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <b>{isRoot ? 'LifeMap' : map.title}</b>
        </motion.button>
        {children.map((node, index) => {
          const angle = (360 / Math.max(children.length, 1)) * index;
          const nested = Boolean((node.children || []).length || (node.taskList || []).length);
          const size = planetSize(node.title);
          const fontSize = planetFontSize(node.title);
          const progress = progressValue(node);
          return (
            <button
              key={node.id}
              className={`mapNode orbitNode state-${node.state}`}
              style={{ '--angle': `${angle}deg`, '--angle-back': `${-angle}deg`, '--orbit-shift': orbitShift, '--node-size': `${size}px`, '--node-font': `${fontSize}px`, '--node-progress': `${progress}%` }}
              title={`${node.title} · ${progressTitle(node)}`}
              onContextMenu={(event) => onOpenMenu(node, event)}
              onPointerDown={(event) => startPress(node, event)}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onClick={() => nested ? onOpen(node.id) : onSelect(node)}
            >
              <span className="nodeOrb"><em>{node.title}</em><strong>{progress}%</strong></span>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
