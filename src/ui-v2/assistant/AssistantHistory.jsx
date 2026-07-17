// LifeMap UI V2 — AssistantHistory (Stage 5B1).
// Session list for the morph Assistant window sidebar.
import { useState } from 'react';
import { formatHistoryTime, sessionKindLabel } from '../adapters/assistantContextAdapter.js';

export function AssistantHistory({ sessions, activeSessionId, busy, interactive, onSelect, onNew, onClear }) {
  const [openMenuId, setOpenMenuId] = useState('');

  return (
    <div className="lifemapV2AssistantHistoryLive">
      <div className="lifemapV2AssistantSectionHead">
        <span>ИСТОРИЯ</span>
        <button
          type="button"
          className="lifemapV2AssistantNewBtn"
          onClick={onNew}
          disabled={busy}
          tabIndex={interactive ? 0 : -1}
        >
          + Новый
        </button>
      </div>
      <div className="lifemapV2AssistantHistory">
        {sessions.length ? sessions.slice(0, 16).map((session) => (
          <div className="lifemapV2AssistantHistRow" key={session.id}>
            <button
              type="button"
              className={`lifemapV2AssistantHistItem${session.id === activeSessionId ? ' lifemapV2AssistantHistActive' : ''}`}
              onClick={() => onSelect(session)}
              disabled={busy}
              tabIndex={interactive ? 0 : -1}
            >
              <span className="lifemapV2AssistantHistTitle">{session.title || 'Новый чат'}</span>
              <span className="lifemapV2AssistantHistMeta">
                {sessionKindLabel(session)}{session.updatedAt ? ` · ${formatHistoryTime(session.updatedAt)}` : ''}
              </span>
            </button>
            <button
              type="button"
              className="lifemapV2AssistantHistMenuBtn"
              aria-label={`Меню чата ${session.title || 'Новый чат'}`}
              tabIndex={interactive ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                setOpenMenuId((current) => current === session.id ? '' : session.id);
              }}
            >
              ⋯
            </button>
            {openMenuId === session.id ? (
              <div className="lifemapV2AssistantHistMenu">
                <button type="button" onClick={() => { setOpenMenuId(''); onClear(session); }}>Очистить чат</button>
              </div>
            ) : null}
          </div>
        )) : <p className="lifemapV2AssistantHistEmpty">История появится после первого сообщения.</p>}
      </div>
    </div>
  );
}
