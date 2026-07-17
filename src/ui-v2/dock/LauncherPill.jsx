// LifeMap UI V2 — LauncherPill (Stage 3).
// Draggable Inbox | AI launcher in the HUD layer. Dragging is isolated from the
// map viewport and all geometry stays in the 1280x800 design coordinate system.
import { useCallback, useRef } from 'react';

export const PILL_W = 126;
export const PILL_H = 58;
const DESIGN_W = 1280;
const DESIGN_H = 800;
const DRAG_CLAMP = 12;
const SNAP_INSET = 20;
const DRAG_THRESHOLD = 5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function snapPillPosition(x, y) {
  const centerX = x + PILL_W / 2;
  const centerY = y + PILL_H / 2;
  const distances = [centerX, DESIGN_W - centerX, centerY, DESIGN_H - centerY];
  const nearest = Math.min(...distances);
  let nextX = x;
  let nextY = y;

  if (nearest === distances[0]) nextX = SNAP_INSET;
  else if (nearest === distances[1]) nextX = DESIGN_W - PILL_W - SNAP_INSET;
  else if (nearest === distances[2]) nextY = SNAP_INSET;
  else nextY = DESIGN_H - PILL_H - SNAP_INSET;

  return {
    x: clamp(nextX, SNAP_INSET, DESIGN_W - PILL_W - SNAP_INSET),
    y: clamp(nextY, SNAP_INSET, DESIGN_H - PILL_H - SNAP_INSET),
  };
}

export function LauncherPill({
  x,
  y,
  hidden = false,
  activeTarget = null,
  skinGhost = false,
  labelGhost = false,
  locked = false,
  dragging = false,
  stageScaleRef,
  onDragMove,
  onDragStart,
  onDragEnd,
  onOpenInbox,
  onOpenAssistant,
  pillRef,
  inboxSegRef,
  aiSegRef,
}) {
  const dragRef = useRef(null);

  const stageScale = useCallback(() => {
    const scale = stageScaleRef?.current;
    return scale && scale > 0 ? scale : 1;
  }, [stageScaleRef]);

  const handlePointerDown = useCallback(
    (event) => {
      if (locked) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: x,
        baseY: y,
        dragging: false,
        pointerId: event.pointerId,
      };
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort across browsers and synthetic events.
      }
    },
    [locked, x, y]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || locked || event.pointerId !== drag.pointerId) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.dragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;

      if (!drag.dragging) {
        drag.dragging = true;
        onDragStart?.();
      }

      const scale = stageScale();
      onDragMove?.({
        x: clamp(drag.baseX + deltaX / scale, DRAG_CLAMP, DESIGN_W - PILL_W - DRAG_CLAMP),
        y: clamp(drag.baseY + deltaY / scale, DRAG_CLAMP, DESIGN_H - PILL_H - DRAG_CLAMP),
      });
    },
    [locked, onDragMove, onDragStart, stageScale]
  );

  const endDrag = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;

      try {
        event.currentTarget.releasePointerCapture?.(drag.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }

      dragRef.current = null;
      onDragEnd?.(drag.dragging);
    },
    [onDragEnd]
  );

  return (
    <div
      ref={pillRef}
      className="lifemapV2Pill"
      data-hidden={hidden ? 'true' : 'false'}
      style={{ left: `${x}px`, top: `${y}px`, transition: dragging ? 'none' : undefined }}
    >
      <div
        className="lifemapV2PillSkin"
        style={{
          opacity: skinGhost ? 0 : 1,
          transition: `opacity ${skinGhost ? 100 : 220}ms ease`,
        }}
        aria-hidden="true"
      />
      <div
        className="lifemapV2PillLabels"
        style={{
          opacity: labelGhost ? 0 : 1,
          transition: `opacity ${labelGhost ? 180 : 450}ms ease`,
        }}
      >
        <button
          type="button"
          ref={inboxSegRef}
          className="lifemapV2PillSeg lifemapV2PillInbox"
          onClick={onOpenInbox}
          disabled={locked}
          tabIndex={hidden ? -1 : 0}
          aria-label="Открыть Inbox"
          aria-haspopup="dialog"
          aria-controls="lifemap-v2-inbox-window"
          aria-expanded={activeTarget === 'inbox'}
        >
          Inbox
        </button>
        <div
          className="lifemapV2PillDivider"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          role="separator"
          aria-orientation="vertical"
          aria-label="Перетащить пилюлю"
        >
          <div className="lifemapV2PillGrip" aria-hidden="true" />
        </div>
        <button
          type="button"
          ref={aiSegRef}
          className="lifemapV2PillSeg lifemapV2PillAI"
          onClick={onOpenAssistant}
          disabled={locked}
          tabIndex={hidden ? -1 : 0}
          aria-label="Открыть AI Assistant"
          aria-haspopup="dialog"
          aria-controls="lifemap-v2-assistant-window"
          aria-expanded={activeTarget === 'assistant'}
        >
          AI
        </button>
      </div>
    </div>
  );
}
