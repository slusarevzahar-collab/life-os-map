// LifeMap UI V2 — AssistantComposer (Stage 5B1, fix pass 2).
// Message input: Enter sends, Shift+Enter — newline (IME-safe), disabled
// while a request is in flight OR while `disabled` (offline/quota/rate/
// provider-unavailable — see assistantContextAdapter.assistantStatusView)
// says a request can't go through right now; `disabledReason` renders next
// to the input so it's clear WHY, not just a greyed-out button. History
// and old messages stay readable regardless — this only gates sending.
// The draft is cleared optimistically on submit (the message shows as sent
// right away, like the legacy panel), but if `onSend` reports the send
// failed, the text is restored into the input instead of being silently
// lost.
import { useState } from 'react';

export function AssistantComposer({ busy, interactive, disabled = false, disabledReason = '', placeholder, onSend }) {
  const [draft, setDraft] = useState('');
  const blocked = busy || disabled;

  const submit = async (event) => {
    event?.preventDefault?.();
    const text = draft.trim();
    if (!text || blocked) return;
    setDraft('');
    const result = await onSend(text);
    if (result && result.ok === false) setDraft((current) => current || text);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    submit(event);
  };

  return (
    <div className="lifemapV2AssistantComposerBlock">
      {disabled && disabledReason ? (
        <div className="lifemapV2AssistantComposerDisabledLine" role="status">{disabledReason}</div>
      ) : null}
      <form className="lifemapV2AssistantInputRow" onSubmit={submit}>
        <textarea
          className="lifemapV2AssistantInput lifemapV2AssistantTextarea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Отправка сообщений временно недоступна' : placeholder}
          aria-label="Сообщение для LM Assistant"
          aria-disabled={disabled ? 'true' : undefined}
          disabled={disabled}
          rows={1}
          tabIndex={interactive ? 0 : -1}
        />
        <button
          type="submit"
          className="lifemapV2AssistantSend"
          disabled={blocked || !draft.trim()}
          tabIndex={interactive ? 0 : -1}
          aria-label="Отправить"
        >
          {busy ? '…' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}
