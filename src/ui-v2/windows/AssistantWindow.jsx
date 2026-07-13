// LifeMap UI V2 — AssistantWindow (Stage 5B1).
// LIVE window: real sessions (assistantChatHistory.js), real chat
// (postAssistantChat), action execution, AI resource meter, quick prompts.
// Keeps the Stage 3 morph shell contract exactly: role=dialog, aria-modal,
// Escape closes, focus wrap, data-state / data-content-visible, geometry
// applied by the shell mount.
import { useEffect, useRef } from 'react';
import { useAssistantChat } from '../data/useAssistantChat.js';
import { aggregateAiResource } from '../adapters/inboxUiAdapter.js';
import { itemCode, itemKindLabel } from '../adapters/assistantContextAdapter.js';
import { AssistantHistory } from '../assistant/AssistantHistory.jsx';
import { AssistantMessages } from '../assistant/AssistantMessages.jsx';
import { AssistantComposer } from '../assistant/AssistantComposer.jsx';

const PERCENT_VISIBLE_STATES = new Set(['ready', 'quota-exhausted', 'rate-limited']);

export function AssistantWindow({
  state,
  contentVisible,
  onClose,
  bootTarget = null,
  currentMap = null,
  activeFocus = null,
  snapshot = {},
  networkWritable = true,
  onRefreshSnapshot,
  onInboxDataStale,
}) {
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const scrollRef = useRef(null);
  const interactive = state === 'open';

  const chat = useAssistantChat({ active: true, bootTarget, currentMap, activeFocus, snapshot, networkWritable, onRefreshSnapshot, apiOffline: !networkWritable, onInboxDataStale });

  useEffect(() => {
    if (state === 'open') closeRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!contentVisible) return;
    const timer = window.setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [contentVisible, chat.messages.length]);

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

  const resource = aggregateAiResource(chat.status);
  const resourceLabel = resource.known ? `${resource.percent}%` : `≈ ${resource.percent}%`;
  const statusView = chat.statusView;
  const showPercent = PERCENT_VISIBLE_STATES.has(statusView.state);
  const target = chat.target;
  const mainEyebrow = target ? `${itemKindLabel(target)} · ${itemCode(target)}` : '';
  const mainTitle = target ? String(target.title || '').trim() : '';

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
          <div className="lifemapV2AssistantStatus" data-state={statusView.state}>
            <div className="lifemapV2AssistantStatusRow">
              <span className="lifemapV2AssistantStatusDot" aria-hidden="true" />
              <span className="lifemapV2AssistantStatusLabel">{statusView.label}</span>
              {showPercent ? <span className="lifemapV2AssistantStatusPct">{resourceLabel}</span> : null}
            </div>
            <p className="lifemapV2AssistantStatusDesc">{statusView.description}</p>
          </div>

          <AssistantHistory
            sessions={chat.sessions}
            activeSessionId={chat.activeSessionId}
            busy={chat.busy}
            interactive={interactive}
            onSelect={chat.activateSession}
            onNew={chat.startNewChat}
            onClear={chat.clearSession}
          />

          <div className="lifemapV2AssistantSectionHead lifemapV2AssistantSectionHead2">
            {target ? 'РАБОТА С ОБЪЕКТОМ' : 'РЕШЕНИЯ'}
          </div>
          <div className="lifemapV2AssistantDecisions">
            {chat.quickPrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                className="lifemapV2AssistantDecision"
                disabled={chat.busy || statusView.blocksSend}
                tabIndex={interactive ? 0 : -1}
                onClick={() => chat.send(item.prompt)}
              >
                {item.label}<span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="lifemapV2AssistantMain">
          <header className="lifemapV2WindowHead">
            {mainTitle ? (
              <div className="lifemapV2AssistantTargetHead">
                <div className="lifemapV2WindowEyebrow">{mainEyebrow}</div>
                <h2 className="lifemapV2WindowTitle lifemapV2AssistantTargetTitle">{mainTitle}</h2>
              </div>
            ) : (
              <h2 className="lifemapV2WindowTitle">LifeMap Assistant</h2>
            )}
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

          <AssistantMessages
            messages={chat.messages}
            busy={chat.busy}
            scrollRef={scrollRef}
            onExecute={chat.executeAction}
            actionBusy={chat.actionBusy}
            actionsDisabled={!chat.status?.canExecuteActions || statusView.blocksSend}
            interactive={interactive}
          />

          {chat.error ? <div className="lifemapV2AssistantErrorLine" role="alert">{chat.error}</div> : null}

          <AssistantComposer
            busy={chat.busy}
            interactive={interactive}
            disabled={statusView.blocksSend}
            disabledReason={statusView.blocksSend ? statusView.description : ''}
            placeholder={target ? 'Что нужно решить по этому объекту?' : 'Опиши решение, которое нужно принять, или проблему в работе…'}
            onSend={chat.send}
          />
        </div>
      </div>
    </div>
  );
}
