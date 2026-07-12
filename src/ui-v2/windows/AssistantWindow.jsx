// LifeMap UI V2 — AssistantWindow (Stage 3)
// Visual mock shell only. role=dialog, Escape closes, focus moves in on open,
// lightweight focus wrap. The input does NOT submit a real request (form submit
// is prevented). NOT connected to AssistantPanel, real history, any provider,
// secret, API, or tool actions. Geometry (344,62,912,714,r22) applied by shell.
import { useEffect, useRef } from 'react';

export function AssistantWindow({ data, state, contentVisible, onClose }) {
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
      id="lifemap-v2-assistant-window"
      ref={rootRef}
      className="lifemapV2Window lifemapV2AssistantWindow"
      data-state={state}
      data-content-visible={contentVisible ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-label="LM Assistant"
      aria-hidden={interactive ? undefined : 'true'}
      onKeyDown={handleKeyDown}
    >
      <div className="lifemapV2WindowBody" style={{ opacity: contentVisible ? 1 : 0 }}>
        <aside className="lifemapV2AssistantSide">
          <div className="lifemapV2AssistantBrand">
            <div className="lifemapV2AssistantMark" aria-hidden="true">AI</div>
            <div className="lifemapV2AssistantBrandName">Assistant</div>
          </div>
          <div className="lifemapV2InboxResource">
            <div className="lifemapV2InboxResourceRow">
              <span>Ресурс AI</span><span className="lifemapV2InboxResourcePct">≈ 100%</span>
            </div>
            <div className="lifemapV2InboxResourceTrack"><div className="lifemapV2InboxResourceFill" /></div>
          </div>
          <div className="lifemapV2AssistantSectionHead">
            <span>ИСТОРИЯ</span><span className="lifemapV2AssistantNew">+ Новый</span>
          </div>
          <div className="lifemapV2AssistantHistory">
            {data.history.map((h, i) => (
              <div key={i} className={`lifemapV2AssistantHistItem${h.active ? ' lifemapV2AssistantHistActive' : ''}`}>
                <div className="lifemapV2AssistantHistTitle">{h.t}</div>
                <div className="lifemapV2AssistantHistMeta">{h.s}</div>
              </div>
            ))}
          </div>
          <div className="lifemapV2AssistantSectionHead lifemapV2AssistantSectionHead2">РЕШЕНИЯ</div>
          <div className="lifemapV2AssistantDecisions">
            {data.decisions.map((d, i) => (
              <div key={i} className="lifemapV2AssistantDecision">{d}<span aria-hidden="true">→</span></div>
            ))}
          </div>
        </aside>

        <div className="lifemapV2AssistantMain">
          <header className="lifemapV2WindowHead">
            <h2 className="lifemapV2WindowTitle">{data.title}</h2>
            <button
              type="button"
              ref={closeRef}
              className="lifemapV2WindowClose"
              onClick={onClose}
              aria-label="Закрыть Assistant"
              tabIndex={interactive ? 0 : -1}
            >
              ✕
            </button>
          </header>
          <div className="lifemapV2AssistantGreeting">
            <div className="lifemapV2AssistantGreetCard">
              <div className="lifemapV2AssistantGreetTitle">{data.greetingTitle}</div>
              <div className="lifemapV2AssistantGreetBody">{data.greetingBody}</div>
            </div>
          </div>
          <div className="lifemapV2AssistantSuggest">
            {data.suggestions.map((s, i) => (
              <button type="button" key={i} className="lifemapV2AssistantChip" tabIndex={interactive ? 0 : -1}>{s}</button>
            ))}
          </div>
          <form
            className="lifemapV2AssistantInputRow"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              className="lifemapV2AssistantInput"
              type="text"
              placeholder={data.placeholder}
              aria-label="Сообщение ассистенту (демо, не отправляется)"
              tabIndex={interactive ? 0 : -1}
            />
            <button type="submit" className="lifemapV2AssistantSend" tabIndex={interactive ? 0 : -1}>Отправить</button>
          </form>
        </div>
      </div>
    </div>
  );
}
