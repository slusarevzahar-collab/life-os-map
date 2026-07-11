import { useEffect, useState } from 'react';
import { ChevronDown } from './ChevronDown.jsx';

export function MissionPanel({ focus, focusQueueItems, snapshot, apiState, onDone, onOpenFocus }) {
  const [expanded, setExpanded] = useState(false);
  const isMock = snapshot.meta?.source?.includes('mock');
  const isOffline = apiState === 'api offline' || snapshot.meta?.source === 'api-offline';
  const isLoading = apiState === 'loading' || snapshot.meta?.source === 'loading';
  const currentTitle = focus?.title || 'Фокус не выбран';
  const nextItem = focusQueueItems?.[1];
  const nextAction = nextItem?.title || focus?.nextAction || 'Следующий шаг не указан.';
  const queueItems = (focusQueueItems || []).slice(2, 12);
  const label = isOffline
    ? 'API OFFLINE · НЕТ ДАННЫХ ДЛЯ КАРТЫ'
    : isMock
      ? 'MOCK DATA · ПРОВЕРЬ BACKEND'
      : isLoading
        ? 'LOADING · ЖДУ BACKEND'
        : 'MISSION CONTROL';

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('lifemap:focus-zoom', { detail: { open: expanded } }));
    return () => {
      window.dispatchEvent(new CustomEvent('lifemap:focus-zoom', { detail: { open: false } }));
    };
  }, [expanded]);

  const openFocusItem = (item) => {
    if (!item || !onOpenFocus) return;
    onOpenFocus(item);
  };

  return (
    <section className={`mission ${expanded ? 'queueExpanded' : ''}`} onClick={(event) => event.stopPropagation()}>
      <button className="collapseMission" type="button" onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Свернуть' : 'Развернуть'}
      </button>

      <div className="missionTop">
        <div><small><em /> {label}</small></div>
      </div>

      {isOffline ? <div className="warningLine">Backend API недоступен. Обнови страницу после восстановления LifeMap.</div> : null}
      {isMock ? <div className="warningLine">Сейчас отображаются mock-данные. Проверь подключение Notion.</div> : null}

      <button className="missionLine activeLine missionJumpLine" type="button" onClick={() => openFocusItem(focus)}>
        <span>Сейчас · </span>{currentTitle}
      </button>
      <button className="missionLine nextLine missionJumpLine" type="button" onClick={() => openFocusItem(nextItem || focus)}>
        <span>Далее · </span>{nextAction}
      </button>

      <div className="focusControls">
        <button className="queueToggle" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Скрыть очередь' : `Показать очередь · ${queueItems.length}`} <ChevronDown open={expanded} />
        </button>
        <button className="doneArchiveButton" type="button" onClick={onDone}>Выполнено</button>
      </div>

      <div className="focusQueueList">
        {queueItems.length ? queueItems.map((item, index) => (
          <button key={`${item.sourceId || item.id}-${index}`} className="focusQueueItem" type="button" onClick={() => openFocusItem(item)}>
            <b>{String(index + 1).padStart(2, '0')}</b><span>{item.title}</span>
          </button>
        )) : <div className="emptyQueue"><b>—</b><span>Дополнительной очереди пока нет.</span></div>}
      </div>
    </section>
  );
}
