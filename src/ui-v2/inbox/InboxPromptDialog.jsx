// LifeMap UI V2 — InboxPromptDialog (Stage 5B1, fix pass 2).
// In-window prompt viewer with copy-to-clipboard. Renders INSIDE the Inbox
// window (absolute overlay over the window body, not a document portal) so
// the morph window stays the only modal layer — stays inside
// lifemapV2Frame, no createPortal. Owns its OWN Tab-trap and Escape
// handling (stopping propagation to the window's handler).
//
// Copy: tries navigator.clipboard.writeText first; if that's unavailable
// or rejected, falls back to a temporary offscreen <textarea> +
// document.execCommand('copy') (removed right after); if BOTH fail, shows
// an inline error instead of silently pretending nothing happened.
//
// Focus: opens focused on its own close button; closing restores focus to
// `returnFocus` (the exact button the user opened it from, e.g. an
// InboxAssetRow "Посмотреть промпт" button) instead of leaving focus
// wherever it lands by default.
import { useEffect, useRef, useState } from 'react';

export function InboxPromptDialog({ asset, returnFocus, onClose }) {
  const [copyState, setCopyState] = useState('idle'); // idle | copied | manual | error
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const resetTimeoutRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (asset) {
      closeRef.current?.focus();
      returnFocusRef.current = returnFocus || null;
    }
    setCopyState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  useEffect(() => () => {
    if (resetTimeoutRef.current) window.clearTimeout(resetTimeoutRef.current);
  }, []);

  const handleClose = () => {
    const target = returnFocusRef.current;
    onClose();
    if (target && typeof target.focus === 'function') {
      window.requestAnimationFrame(() => { if (target.isConnected) target.focus(); });
    }
  };

  if (!asset) return null;

  const scheduleReset = (nextState, delay = 2200) => {
    if (resetTimeoutRef.current) window.clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = window.setTimeout(() => setCopyState('idle'), delay);
    setCopyState(nextState);
  };

  const copyViaTextarea = () => {
    const textarea = document.createElement('textarea');
    textarea.value = asset.content || '';
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    textarea.remove();
    return ok;
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard api unavailable');
      await navigator.clipboard.writeText(asset.content || '');
      scheduleReset('copied');
      return;
    } catch {
      // fall through to the textarea/execCommand fallback below
    }
    if (copyViaTextarea()) {
      scheduleReset('manual');
    } else {
      scheduleReset('error', 4000);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
      return;
    }
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const root = dialogRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copyLabel = copyState === 'copied' ? 'Скопировано'
    : copyState === 'manual' ? 'Скопировано (запасной способ)'
      : copyState === 'error' ? 'Не удалось скопировать'
        : 'Скопировать';

  return (
    <div
      className="lifemapV2InboxPromptOverlay"
      role="presentation"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className="lifemapV2InboxPromptDialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Промпт: ${asset.title || 'без названия'}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="lifemapV2InboxPromptHead">
          <div>
            <small>Промпт</small>
            <h3>{asset.title || 'Без названия'}</h3>
          </div>
          <button type="button" ref={closeRef} onClick={handleClose} aria-label="Закрыть промпт">✕</button>
        </div>
        <pre ref={bodyRef} className="lifemapV2InboxPromptBody">{asset.content}</pre>
        {copyState === 'error' ? (
          <div className="lifemapV2InboxPromptCopyError" role="alert">
            Не удалось скопировать автоматически. Выделите текст выше и нажмите ⌘/Ctrl+C.
          </div>
        ) : null}
        <div className="lifemapV2InboxPromptActions">
          <button className="lifemapV2InboxPrimaryBtn" type="button" onClick={copy}>{copyLabel}</button>
          {asset.url ? (
            <button type="button" onClick={() => window.open(asset.url, '_blank', 'noopener,noreferrer')}>Открыть ресурс</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
