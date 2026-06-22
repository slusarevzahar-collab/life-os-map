import { useState } from 'react';
import { ChevronDown } from './ChevronDown.jsx';

export function MissionPanel({ focus, focusQueueItems, snapshot, apiState, onDone }) {
  const [open, setOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const isMock = snapshot.meta?.source?.includes('mock');
  const isOffline = apiState === 'api offline' || snapshot.meta?.source === 'api-offline';
  const isLoading = apiState === 'loading' || snapshot.meta?.source === 'loading';
  const currentTitle = focus?.title || 'Фокус не выбран';
  const nextItem = focusQueueItems?.[1];
  const nextAction = nextItem?.title || focus?.nextAction || 'Следующий шаг не указан.';

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
    <section className="mission" onClick={(event) => event.stopPropagation()}>
      <button className="collapseMission" onClick={() => setOpen(false)}>Свернуть</button>
      <div className="missionTop">
        <div>
          <small><em /> {isOffline ? 'API OFFLINE · нет данных для карты' : isMock ? 'MOCK DATA · проверь backend/.env' : isLoading ? 'LOADING · жду backend' : 'MISSION CONTROL'}</small>
          <h1><span>FO</span>Текущий фокус</h1>
        </div>
      </div>
      {isOffline ? <div className="warningLine">Карта специально не показывает запасные данные: backend API недоступен. Запусти npm run api и обнови страницу.</div> : null}
      {isMock ? <div className="warningLine">Сейчас карта получает mock-данные. Нужно, чтобы backend видел NOTION_TOKEN и NOTION_TASKS_DB_ID.</div> : null}
      <div className="missionLine activeLine">Сейчас: {currentTitle}</div>
      <div className="missionLine nextLine">Далее: {nextAction}</div>
      <div className="focusControls">
        <button className="queueToggle" onClick={() => setQueueOpen((value) => !value)}>
          {queueOpen ? 'Скрыть очередь' : `Очередь ${Math.max((focusQueueItems?.length || 1) - 1, 0)}`} <ChevronDown open={queueOpen} />
        </button>
        <button className="doneArchiveButton" onClick={onDone}>Выполнено</button>
      </div>
      {queueOpen ? (
        <div className="focusQueueList">
          {focusQueueItems?.slice(0, 10).map((item, index) => (
            <div key={`${item.sourceId || item.id}-${index}`} className={index === 0 ? 'current' : ''}>
              <b>{index === 0 ? 'Сейчас' : index}</b><span>{item.title}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
