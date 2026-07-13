// LifeMap UI V2 — one task/list row (Stage 5B1).
// Stage 5A behaviour unchanged; the AI button is now live when the shell
// passes onDiscussAi (Stage 5B1), otherwise it stays disabled.
import { useEffect, useRef, useState } from 'react';
import { isDoneNode } from '../../lib/actionMapModel.js';

export function TaskRow({
  item,
  expanded,
  patchable,
  busy,
  networkDisabled,
  reorderDisabled,
  isFirst,
  isLast,
  onToggleExpand,
  onSaveNote,
  onDone,
  onRestore,
  onOpenMenu,
  onOpenDetails,
  onMoveUp,
  onMoveDown,
  onDiscussAi,
  dragHandleProps,
}) {
  const serverNote = String(item.raw?.sessionNotes ?? '');
  const [noteDraft, setNoteDraft] = useState(serverNote);
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteError, setNoteError] = useState('');
  const itemIdRef = useRef(item.id);
  const pendingSavedRef = useRef(null);
  const done = isDoneNode(item);

  useEffect(() => {
    if (itemIdRef.current !== item.id) {
      itemIdRef.current = item.id;
      pendingSavedRef.current = null;
      setNoteDraft(serverNote);
      setNoteDirty(false);
      setNoteError('');
      return;
    }
    if (pendingSavedRef.current != null) {
      if (serverNote === pendingSavedRef.current) pendingSavedRef.current = null;
      setNoteDraft(pendingSavedRef.current ?? serverNote);
      return;
    }
    if (!noteDirty) setNoteDraft(serverNote);
  }, [item.id, noteDirty, serverNote]);

  const handleSave = async () => {
    setNoteError('');
    const result = await onSaveNote(item, noteDraft);
    if (result?.ok) {
      pendingSavedRef.current = noteDraft;
      setNoteDirty(false);
      return;
    }
    if (result && result.ok === false) setNoteError(result.error || 'Не удалось сохранить заметку.');
  };

  const handleMenuButton = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(item, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom + 4,
      returnFocus: event.currentTarget,
    });
  };

  return (
    <div
      className={`lifemapV2TaskRow${expanded ? ' lifemapV2TaskRowExpanded' : ''}${done ? ' lifemapV2TaskRowDone' : ''}`}
      data-network-disabled={networkDisabled ? 'true' : 'false'}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(item, {
          clientX: event.clientX,
          clientY: event.clientY,
          returnFocus: event.currentTarget.querySelector('.lifemapV2TaskMenuBtn'),
        });
      }}
    >
      <div className="lifemapV2TaskRowMain">
        <span className="lifemapV2TaskCode">{item.code || item.icon || 'LM'}</span>
        <button
          type="button"
          className="lifemapV2TaskTitleBtn"
          onClick={() => onToggleExpand(item.id)}
          aria-expanded={expanded}
        >
          {item.title}
        </button>

        <div className="lifemapV2TaskRowActions">
          <div className="lifemapV2TaskReorder">
            <button
              type="button"
              className="lifemapV2TaskReorderBtn"
              disabled={reorderDisabled || isFirst}
              onClick={() => onMoveUp(item)}
              aria-label="Переместить выше"
              title="Выше"
            >
              ▲
            </button>
            <button
              type="button"
              className="lifemapV2TaskReorderBtn"
              disabled={reorderDisabled || isLast}
              onClick={() => onMoveDown(item)}
              aria-label="Переместить ниже"
              title="Ниже"
            >
              ▼
            </button>
          </div>
          <div
            className="lifemapV2TaskDragHandle"
            {...(!reorderDisabled ? dragHandleProps || {} : {})}
            data-disabled={reorderDisabled ? 'true' : 'false'}
            aria-hidden="true"
            title={reorderDisabled ? 'Изменение порядка недоступно' : 'Перетащить'}
          >
            ⋮⋮
          </div>
          {onDiscussAi ? (
            <button
              type="button"
              className="lifemapV2TaskAiBtn"
              aria-label={`Обсудить с AI: ${item.title}`}
              title="Обсудить с AI"
              onClick={() => onDiscussAi(item)}
            >
              AI
            </button>
          ) : (
            <button
              type="button"
              className="lifemapV2TaskAiBtn"
              disabled
              aria-label="Обсудить с AI — недоступно"
              title="Обсудить с AI — недоступно"
            >
              AI
            </button>
          )}
          {patchable ? (
            <button
              type="button"
              className={done ? 'lifemapV2TaskRestoreBtn' : 'lifemapV2TaskDoneBtn'}
              disabled={busy || networkDisabled}
              title={networkDisabled ? 'API недоступен' : undefined}
              onClick={() => (done ? onRestore(item) : onDone(item))}
            >
              {busy ? '…' : done ? 'Восстановить' : 'Done'}
            </button>
          ) : null}
          <button
            type="button"
            className="lifemapV2TaskMenuBtn"
            onClick={handleMenuButton}
            aria-label={`Действия для «${item.title}»`}
            aria-haspopup="menu"
          >
            ⋯
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="lifemapV2TaskRowDetails">
          <p className="lifemapV2TaskSummary">{item.summary || 'Подробности пока не заполнены.'}</p>
          {Array.isArray(item.details) && item.details.length ? (
            <ul className="lifemapV2TaskDetailList">
              {item.details.filter(Boolean).map((detail, index) => (
                <li key={`${item.id}-detail-${index}`}>{detail}</li>
              ))}
            </ul>
          ) : null}
          {patchable ? (
            <div className="lifemapV2TaskNote">
              <label className="lifemapV2TaskNoteLabel" htmlFor={`note-${item.id}`}>
                Заметка к задаче
              </label>
              <textarea
                id={`note-${item.id}`}
                className="lifemapV2TaskNoteInput"
                value={noteDraft}
                onChange={(event) => {
                  pendingSavedRef.current = null;
                  setNoteDraft(event.target.value);
                  setNoteDirty(true);
                  setNoteError('');
                }}
                placeholder="Короткая заметка, уточнение или контекст по задаче"
              />
              {noteError ? <div className="lifemapV2TaskNoteError">{noteError}</div> : null}
              <div className="lifemapV2TaskNoteActions">
                <button type="button" className="lifemapV2TaskNoteOpenDetails" onClick={() => onOpenDetails(item)}>
                  Подробности
                </button>
                <button
                  type="button"
                  className="lifemapV2TaskNoteSave"
                  disabled={busy || networkDisabled}
                  title={networkDisabled ? 'API недоступен' : undefined}
                  onClick={handleSave}
                >
                  {busy ? 'Сохраняю…' : 'Сохранить'}
                </button>
              </div>
            </div>
          ) : (
            <div className="lifemapV2TaskNoteActions">
              <button type="button" className="lifemapV2TaskNoteOpenDetails" onClick={() => onOpenDetails(item)}>
                Подробности
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
