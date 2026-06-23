import { useState } from 'react';
import { ChevronDown } from './ChevronDown.jsx';

const jumpLineStyle = {
  width: '100%',
  display: 'block',
  textAlign: 'left',
  cursor: 'pointer',
};

const queueItemStyle = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '30px minmax(0, 1fr)',
  alignItems: 'center',
  gap: 10,
  border: 0,
  color: 'inherit',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
};

export function MissionPanel({ focus, focusQueueItems, snapshot, apiState, onDone, onOpenFocus }) {
  const [open, setOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const isMock = snapshot.meta?.source?.includes('mock');
  const isOffline = apiState === 'api offline' || snapshot.meta?.source === 'api-offline';
  const isLoading = apiState === 'loading' || snapshot.meta?.source === 'loading';
  const currentTitle = focus?.title || 'Фокус не выбран';
  const nextItem = focusQueueItems?.[1];
  const nextAction = nextItem?.title || focus?.nextAction || 'Следующий шаг не указан.';
  const queueItems = (focusQueueItems || []).slice(2, 12);

  const openFocusItem = (item) => {
    if (!item || !onOpenFocus) return;
    onOpenFocus(item);
  };

  if (!open) {
    const label = isOffline ? 'API OFFLINE' : isMock ? 'MOCK DATA' : isLoading ? 'LOADING' : 'ФОКУС СЕЙЧАС';
    return (
      <section className="mission missionCollapsed" onClick={(event) => event.stopPropagation()}>
        <button onClick={() => setOpen(true)}>
          <span>FO</span>
          <div><small>{label}</small><b>{currentTitle}</b></div>
        </button>
      </section>
    );
  }

  return (
    <section className={`mission ${queueOpen ? 'queueExpanded' : ''}`} onClick={(event) => event.stopPropagation()}>
      <button className="collapseMission" onClick={() => setOpen(false)}>Свернуть</button>
      <div className="missionTop">
        <div>
          <small><em /> {isOffline ? 'API OFFLINE · нет данных для карты' : isMock ? 'MOCK DATA · проверь backend/.env' : isLoading ? 'LOADING · жду backend' : 'MISSION CONTROL'}</small>
          <h1><span>FO</span>Текущий фокус</h1>
        </div>
      </div>
      {isOffline ? <div className="warningLine">Карта специально не показывает запасные данные: backend API недоступен. Запусти npm run api и обнови страницу.</div> : null}
      {isMock ? <div className="warningLine">Сейчас карта получает mock-данные. Нужно, чтобы backend видел NOTION_TOKEN и NOTION_TASKS_DB_ID.</div> : null}
      <button className="missionLine activeLine missionJumpLine" style={jumpLineStyle} onClick={() => openFocusItem(focus)}>Сейчас: {currentTitle}</button>
      <button className="missionLine nextLine missionJumpLine" style={jumpLineStyle} onClick={() => openFocusItem(nextItem || focus)}>Далее: {nextAction}</button>
      <div className="focusControls">
        <button className="queueToggle" onClick={() => setQueueOpen((value) => !value)}>
          {queueOpen ? 'Скрыть очередь' : `Очередь ${queueItems.length}`} <ChevronDown open={queueOpen} />
        </button>
        <button className="doneArchiveButton" onClick={onDone}>Выполнено</button>
      </div>
      {queueOpen ? (
        <div className="focusQueueList">
          {queueItems.length ? queueItems.map((item, index) => (
            <button key={`${item.sourceId || item.id}-${index}`} className="focusQueueItem" style={queueItemStyle} onClick={() => openFocusItem(item)}>
              <b>{index + 1}</b><span>{item.title}</span>
            </button>
          )) : <div className="emptyQueue"><b>—</b><span>Дополнительной очереди пока нет.</span></div>}
        </div>
      ) : null}
    </section>
  );
}
