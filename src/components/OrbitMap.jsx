import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { topItems } from '../lib/lifeMapSelectors.js';

function canonicalTitle(node = {}) {
  if (node?.id === 'sphere-inbox' || node?.id === 'inbox-signals' || node?.title === 'AI Inbox') return 'LM Inbox';
  return node?.title || '';
}

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

function progressRingStyle(progress) {
  return {
    position: 'absolute',
    inset: '-5px',
    top: '-5px',
    right: '-5px',
    width: 'auto',
    minWidth: 0,
    height: 'auto',
    padding: 0,
    border: 0,
    borderRadius: 999,
    color: 'transparent',
    fontSize: 0,
    lineHeight: 0,
    background: `conic-gradient(rgba(87, 224, 168, 0.98) ${progress}%, rgba(255,255,255,0.1) 0)`,
    boxShadow: '0 0 18px rgba(87, 224, 168, 0.28), inset 0 0 10px rgba(87, 224, 168, 0.12)',
    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
    mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
    pointerEvents: 'none',
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const children = topItems(map).filter((node) => !(isRoot && node.id === 'sphere-inbox'));
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
    if (event.target.closest('button, input')) return;
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
  const coreEditing = inlineEditor?.nodeId === map.id;
  const coreTitle = canonicalTitle(map);
  const cameraVariants = isRoot
    ? {
        initial: { opacity: 0, scale: 1.12, filter: 'blur(3px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 1.72, filter: 'blur(4px)' },
      }
    : {
        initial: { opacity: 0, scale: 0.7, filter: 'blur(3px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.84, filter: 'blur(3px)' },
      };

  return (
    <motion.section
      key={map.id}
      className={`mapStage ${hasSide ? 'mapWithSide' : ''} ${draggingCanvas ? 'draggingCanvas' : ''}`}
      variants={cameraVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.68, ease: [0.22, 0.1, 0.12, 1] }}
      style={{ transformOrigin: '50% 50%' }}
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
          className={`coreNode ${isRoot ? 'rootCore' : 'titleCore'} ${coreEditing ? 'editingTitle' : ''}`}
          onClick={(event) => coreEditing ? event.stopPropagation() : onOpenMenu(map, event)}
          onContextMenu={(event) => onOpenMenu(map, event)}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.34, ease: 'easeOut' }}
        >
          {coreEditing ? (
            <PlanetTitleEditor
              value={inlineEditor.value}
              onChange={onInlineRenameChange}
              onSubmit={(event) => onSubmitInlineRename(map, event)}
              onCancel={onCancelInlineRename}
            />
          ) : <b>{isRoot ? 'LifeMap' : coreTitle}</b>}
        </motion.button>
        {children.map((node, index) => {
          const title = canonicalTitle(node);
          const angle = (360 / Math.max(children.length, 1)) * index;
          const size = planetSize(title);
          const fontSize = planetFontSize(title);
          const progress = progressValue(node);
          const editing = inlineEditor?.nodeId === node.id;
          const progressText = progressTitle(node);
          const style = { '--angle': `${angle}deg`, '--angle-back': `${-angle}deg`, '--orbit-shift': orbitShift, '--node-size': `${size}px`, '--node-font': `${fontSize}px`, '--node-progress': `${progress}%`, '--float-delay': `${index * -0.7}s` };
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
              <strong aria-label={progressText} title={progressText} style={progressRingStyle(progress)} />
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
              title={`${title} · ${progressText}`}
              onContextMenu={(event) => onOpenMenu(node, event)}
              onPointerDown={(event) => startPress(node, event)}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onClick={() => onOpen(node.id)}
            >
              {content}
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
