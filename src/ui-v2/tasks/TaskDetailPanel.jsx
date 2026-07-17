// LifeMap UI V2 — TaskDetailPanel (Stage 5B1)
// Stage 5A behaviour unchanged. The "Обсудить с AI" button is live when the
// shell passes onDiscussAi; otherwise it stays disabled.
import { useEffect, useRef } from 'react';

export function TaskDetailPanel({ node, patchable, busy, networkDisabled, onClose, onDone, onRestore, onDiscussAi }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (node) closeRef.current?.focus();
  }, [node?.id]);

  useEffect(() => {
    if (!node) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [node, onClose]);

  if (!node) return null;
  const done = node.state === 'done';
  const showProgress = Number(node.progress || 0) > 0 || Number(node.totalTasks || 0) > 0;
  const details = Array.isArray(node.details) ? node.details.filter(Boolean) : [];

  return (
    <div className="lifemapV2TaskDetail" role="dialog" aria-label={`Подробности: ${node.title}`}>
      <button type="button" ref={closeRef} className="lifemapV2TaskDetailClose" onClick={onClose} aria-label="Закрыть подробности">
        ✕
      </button>
      <div className="lifemapV2TaskDetailHead">
        <span className="lifemapV2TaskDetailIcon">{node.icon || 'LM'}</span>
        <div>
          <small className="lifemapV2TaskDetailSubtitle">{node.subtitle || node.status || 'Объект'}</small>
          <h2 className="lifemapV2TaskDetailTitle">{node.title}</h2>
        </div>
        {showProgress ? (
          <div className="lifemapV2TaskDetailRing" style={{ '--pct': `${Math.max(0, Math.min(100, Math.round(Number(node.progress) || 0)))}%` }}>
            <span>{Math.max(0, Math.min(100, Math.round(Number(node.progress) || 0)))}%</span>
          </div>
        ) : null}
      </div>

      <p className="lifemapV2TaskDetailSummary">{node.summary || 'Описание пока не заполнено.'}</p>

      <dl className="lifemapV2TaskDetailMeta">
        {node.status ? (
          <div>
            <dt>Статус</dt>
            <dd>{node.status}</dd>
          </div>
        ) : null}
        {node.raw?.project ? (
          <div>
            <dt>Проект</dt>
            <dd>{node.raw.project}</dd>
          </div>
        ) : null}
        {node.raw?.goalName ? (
          <div>
            <dt>Цель</dt>
            <dd>{node.raw.goalName}</dd>
          </div>
        ) : null}
        {node.raw?.nextAction ? (
          <div>
            <dt>Следующий шаг</dt>
            <dd>{node.raw.nextAction}</dd>
          </div>
        ) : null}
        {node.raw?.sessionNotes ? (
          <div>
            <dt>Заметка</dt>
            <dd>{node.raw.sessionNotes}</dd>
          </div>
        ) : null}
        {node.code ? (
          <div>
            <dt>Код</dt>
            <dd>{node.code}</dd>
          </div>
        ) : null}
      </dl>

      {details.length ? (
        <ul className="lifemapV2TaskDetailList">
          {details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      ) : null}

      <div className="lifemapV2TaskDetailActions">
        {onDiscussAi ? (
          <button
            type="button"
            className="lifemapV2TaskDetailAi lifemapV2TaskDetailAiLive"
            aria-label={`Обсудить с AI: ${node.title}`}
            onClick={() => onDiscussAi(node)}
          >
            Обсудить с AI
          </button>
        ) : (
          <button
            type="button"
            className="lifemapV2TaskDetailAi"
            disabled
            aria-label="Обсудить с AI — недоступно"
            title="Обсудить с AI — недоступно"
          >
            Обсудить с AI
          </button>
        )}
        {patchable ? (
          <button
            type="button"
            className={done ? 'lifemapV2TaskRestoreBtn' : 'lifemapV2TaskDoneBtn'}
            disabled={busy || networkDisabled}
            title={networkDisabled ? 'API недоступен' : undefined}
            onClick={() => (done ? onRestore(node) : onDone(node))}
          >
            {busy ? 'Сохраняю…' : done ? 'Восстановить' : 'Done'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
