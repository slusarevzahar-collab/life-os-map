// LifeMap UI V2 — MapViewport (Stage 2)
// Owns ONLY the user's pan (translate) and zoom (scale), applied to its own DOM
// node. Never touches the cinematic camera transform (useCameraFlight owns a
// separate ancestor node). Pointer Events (mouse/pen/touch), setPointerCapture,
// drag-vs-click threshold, wheel-zoom anchored at the cursor. Fully blocked
// while `disabled` (camera flight in progress). No MutationObserver, no
// setInterval, no global DOM writes.
import { useCallback, useEffect, useRef } from 'react';

export const MIN_SCALE = 0.72;
export const MAX_SCALE = 1.65;
export const DRAG_THRESHOLD = 5;
const DESIGN_WIDTH = 1280;
const ZOOM_STEP = 0.08;

export function clampScale(value) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

export function defaultViewport() {
  return { x: 0, y: 0, scale: 1 };
}

export function MapViewport({ children, disabled = false, viewport, onViewportChange, onDragStateChange }) {
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef(0);

  const stageScale = useCallback(() => {
    const frame = rootRef.current?.closest('.lifemapV2Frame');
    const rect = frame?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect.width / DESIGN_WIDTH : 1;
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      if (disabled) return;
      if (event.target.closest('button, [role="button"], input, textarea, select, a')) return;
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: viewport.x,
        baseY: viewport.y,
        dragging: false,
        pointerId: event.pointerId,
      };
      try {
        rootRef.current?.setPointerCapture?.(event.pointerId);
      } catch {
        // Capture is best-effort and must never abort the rest of the gesture.
      }
    },
    [disabled, viewport.x, viewport.y]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || disabled || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!drag.dragging) {
        drag.dragging = true;
        suppressClickRef.current = true;
        onDragStateChange?.(true);
      }
      const scale = stageScale();
      onViewportChange({
        ...viewport,
        x: drag.baseX + dx / scale,
        y: drag.baseY + dy / scale,
      });
    },
    [disabled, viewport, onViewportChange, stageScale, onDragStateChange]
  );

  const endDrag = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.pointerId != null) {
        try {
          rootRef.current?.releasePointerCapture?.(drag.pointerId);
        } catch {
          // Capture release is best-effort too.
        }
      }
      if (drag.dragging) {
        onDragStateChange?.(false);
        // The click generated directly after pointerup must still be suppressed.
        window.clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
          suppressTimerRef.current = 0;
        }, 0);
      }
      dragRef.current = null;
    },
    [onDragStateChange]
  );

  const handleClickCapture = useCallback((event) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const handleWheel = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      const frame = rootRef.current?.closest('.lifemapV2Frame');
      const rect = frame?.getBoundingClientRect();
      if (!rect) return;
      const scale = stageScale();
      const designX = (event.clientX - rect.left) / scale;
      const designY = (event.clientY - rect.top) / scale;
      if (event.deltaY === 0) return;
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextScale = clampScale(viewport.scale + direction * ZOOM_STEP);
      if (nextScale === viewport.scale) return;
      const contentX = (designX - viewport.x) / viewport.scale;
      const contentY = (designY - viewport.y) / viewport.scale;
      onViewportChange({
        x: designX - contentX * nextScale,
        y: designY - contentY * nextScale,
        scale: nextScale,
      });
    },
    [disabled, viewport, onViewportChange, stageScale]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(
    () => () => {
      window.clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = 0;
      suppressClickRef.current = false;
      dragRef.current = null;
      onDragStateChange?.(false);
    },
    [onDragStateChange]
  );

  return (
    <div
      ref={rootRef}
      className="lifemapV2Viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={handleClickCapture}
      style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
    >
      {children}
    </div>
  );
}
