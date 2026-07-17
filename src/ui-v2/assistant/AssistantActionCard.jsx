// LifeMap UI V2 — AssistantActionCard (Stage 5B1).
// Proposed action card inside an assistant message: executable actions get a
// confirm button, plan-only actions get a badge. Executability comes from
// the SAME allow-list useAssistantChat.executeAction re-checks before
// firing a mutation — this file no longer keeps its own separate copy that
// could drift from the one that actually gates the request.
import { isExecutableAssistantAction, safeDisplayText } from '../adapters/assistantContextAdapter.js';

export function AssistantActionCard({ action, onExecute, busy, disabled, interactive }) {
  const executable = isExecutableAssistantAction(action);
  return (
    <article className={`lifemapV2AssistantAction${executable ? ' lifemapV2AssistantActionExec' : ''}`}>
      <div className="lifemapV2AssistantActionBody">
        <small>{executable ? 'Изменение LifeMap' : 'План'}</small>
        <b>{safeDisplayText(action.title, 'Действие LifeMap')}</b>
        {action.risk ? <p>{safeDisplayText(action.risk)}</p> : null}
      </div>
      {executable ? (
        <button
          type="button"
          disabled={busy || disabled}
          tabIndex={interactive ? 0 : -1}
          onClick={() => onExecute(action)}
        >
          {busy ? 'Выполняю…' : 'Подтвердить'}
        </button>
      ) : <span className="lifemapV2AssistantPlanBadge">Предложение</span>}
    </article>
  );
}
