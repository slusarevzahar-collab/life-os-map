// LifeMap UI V2 — AssistantMessages (Stage 5B1).
// Chat thread: greeting when empty, message bubbles, warnings, next step,
// proposed action cards, "typing" indicator.
import { AssistantActionCard } from './AssistantActionCard.jsx';
import { safeDisplayText } from '../adapters/assistantContextAdapter.js';

function MessageBubble({ message, onExecute, actionBusy, actionsDisabled, interactive }) {
  const metaBits = [message.provider, message.model, message.status, message.capacity].filter(Boolean).map((value) => safeDisplayText(value)).filter(Boolean);
  return (
    <div className={`lifemapV2AssistantMsg lifemapV2AssistantMsg--${message.role}${message.error ? ' lifemapV2AssistantMsgError' : ''}`}>
      <small>{message.role === 'user' ? 'Ты' : message.role === 'system' ? 'LifeMap' : 'AI'}</small>
      <p>{safeDisplayText(message.text)}</p>
      {metaBits.length ? <div className="lifemapV2AssistantMsgMeta">{metaBits.join(' · ')}</div> : null}
      {message.summary ? <details><summary>Сводка</summary><pre>{safeDisplayText(message.summary)}</pre></details> : null}
      {message.warnings?.length ? (
        <div className="lifemapV2AssistantWarnings">
          {message.warnings.map((warning, index) => <span key={index}>{warning}</span>)}
        </div>
      ) : null}
      {message.nextStep ? <div className="lifemapV2AssistantNextStep"><b>Далее:</b> {safeDisplayText(message.nextStep)}</div> : null}
      {message.proposedActions?.length ? (
        <div className="lifemapV2AssistantActionList">
          {message.proposedActions.map((action, index) => (
            <AssistantActionCard
              key={`${action.type}-${action.title}-${index}`}
              action={action}
              onExecute={onExecute}
              busy={actionBusy === `${action.type}-${action.title}`}
              disabled={actionsDisabled}
              interactive={interactive}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantMessages({ messages, busy, scrollRef, onExecute, actionBusy, actionsDisabled, interactive }) {
  return (
    <div className="lifemapV2AssistantThread" ref={scrollRef}>
      {!messages.length ? (
        <div className="lifemapV2AssistantGreeting">
          <div className="lifemapV2AssistantGreetCard">
            <div className="lifemapV2AssistantGreetTitle">Что нужно решить?</div>
            <div className="lifemapV2AssistantGreetBody">
              Опиши проблему или решение, которое нужно принять. История чатов сохранится на этом устройстве.
            </div>
          </div>
        </div>
      ) : null}
      {messages.map((message, index) => (
        <MessageBubble
          key={`${message.createdAt}-${index}`}
          message={message}
          onExecute={onExecute}
          actionBusy={actionBusy}
          actionsDisabled={actionsDisabled}
          interactive={interactive}
        />
      ))}
      {busy ? <div className="lifemapV2AssistantMsg lifemapV2AssistantMsg--assistant lifemapV2AssistantMsgTyping"><p>печатаю…</p></div> : null}
    </div>
  );
}
