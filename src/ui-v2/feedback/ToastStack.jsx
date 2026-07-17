// LifeMap UI V2 — compact live-region notifications (Stage 5A).
import { useEffect, useRef } from 'react';

const AUTO_DISMISS_MS = 2800;

export function ToastStack({ toasts, onDismiss }) {
  const timersRef = useRef({});

  useEffect(() => {
    toasts.forEach((toast) => {
      if (timersRef.current[toast.id]) return;
      timersRef.current[toast.id] = window.setTimeout(() => {
        delete timersRef.current[toast.id];
        onDismiss(toast.id);
      }, AUTO_DISMISS_MS);
    });
    const activeIds = new Set(toasts.map((toast) => toast.id));
    Object.keys(timersRef.current).forEach((id) => {
      if (!activeIds.has(id)) {
        window.clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    });
  }, [onDismiss, toasts]);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = {};
    },
    []
  );

  if (!toasts.length) return null;

  return (
    <div className="lifemapV2ToastStack" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const tone = ['error', 'warning'].includes(toast.kind) ? toast.kind : 'success';
        return (
          <div key={toast.id} className={`lifemapV2Toast lifemapV2Toast--${tone}`}>
            <span className="lifemapV2ToastText">{toast.message}</span>
            <button type="button" className="lifemapV2ToastClose" onClick={() => onDismiss(toast.id)} aria-label="Скрыть уведомление">
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
