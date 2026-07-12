// LifeMap UI V2 — InboxWindow (Stage 3)
// Visual mock shell only. role=dialog, Escape closes, focus moves in on open and
// a lightweight focus wrap keeps Tab inside while open. NOT connected to
// AIInboxV2, real mail, Notion, reprocess, cloud quota, any API, or the legacy
// Inbox components. Geometry (556,60,692,708,r22) is applied by the shell; this
// component fills its container. Content fades in via `contentVisible` so it
// appears only after the morph frame has expanded.
import { useEffect, useRef } from 'react';

const KIND_CLASS = { idea: 'lifemapV2InboxTagIdea', task: 'lifemapV2InboxTagTask', note: 'lifemapV2InboxTagNote' };

export function InboxWindow({ data, state, contentVisible, onClose }) {
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const interactive = state === 'open';

  useEffect(() => {
    if (state === 'open') {
      closeRef.current?.focus();
    }
  }, [state]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = rootRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
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

  return (
    <div
      id="lifemap-v2-inbox-window"
      ref={rootRef}
      className="lifemapV2Window lifemapV2InboxWindow"
      data-state={state}
      data-content-visible={contentVisible ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-label="LM Inbox"
      aria-hidden={interactive ? undefined : 'true'}
      onKeyDown={handleKeyDown}
    >
      <div className="lifemapV2WindowBody" style={{ opacity: contentVisible ? 1 : 0 }}>
        <header className="lifemapV2WindowHead">
          <div>
            <div className="lifemapV2WindowEyebrow">{data.eyebrow}</div>
            <h2 className="lifemapV2WindowTitle">{data.title}</h2>
          </div>
          <div className="lifemapV2WindowHeadActions">
            <span className="lifemapV2InboxAction">{data.action}</span>
            <button
              type="button"
              ref={closeRef}
              className="lifemapV2WindowClose"
              onClick={onClose}
              aria-label="Закрыть Inbox"
              tabIndex={interactive ? 0 : -1}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="lifemapV2InboxResource">
          <div className="lifemapV2InboxResourceRow">
            <span>Ресурс AI</span><span className="lifemapV2InboxResourcePct">≈ 100%</span>
          </div>
          <div className="lifemapV2InboxResourceTrack"><div className="lifemapV2InboxResourceFill" /></div>
        </div>

        <div className="lifemapV2InboxChips">
          {data.chips.map((chip) => (
            <div
              key={chip.n}
              className={`lifemapV2InboxChip${chip.active ? ' lifemapV2InboxChipActive' : ''}`}
            >
              <span>{chip.n}</span><span className="lifemapV2InboxChipVal">{chip.v}</span>
            </div>
          ))}
        </div>

        <div className="lifemapV2InboxRows">
          {data.rows.map((row, i) => (
            <div key={i} className="lifemapV2InboxRow">
              <div className={`lifemapV2InboxTag ${KIND_CLASS[row.kind] || ''}`}>{row.src}</div>
              <div className="lifemapV2InboxRowMain">
                <div className="lifemapV2InboxRowTitle">{row.title}</div>
                <div className="lifemapV2InboxRowMeta">{row.meta}</div>
              </div>
              <div className="lifemapV2InboxScore">{row.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
