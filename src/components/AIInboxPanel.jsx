import { useMemo, useState } from 'react';
import { listItems } from '../lib/lifeMapSelectors.js';

function isProcessed(status = '') {
  return /reviewed|processed|archived|done|обработ|разобран|архив|готов/i.test(String(status || ''));
}

function signalCode(item) {
  const source = String(item.code || item.raw?.code || 'IN1').toUpperCase();
  const letters = (source.match(/[A-ZА-Я]{1,2}/)?.[0] || 'IN').slice(0, 2);
  const rawNumber = Number(source.match(/\d+/)?.[0] || 1);
  const number = ((Math.max(rawNumber, 1) - 1) % 100) + 1;
  return `${letters}${number}`;
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function chipText(value) {
  return String(value || '').trim();
}

export function AIInboxPanel({ map, viewMode, setViewMode, onOpenMenu }) {
  const [expandedId, setExpandedId] = useState(null);
  const [localState, setLocalState] = useState({});
  const [notice, setNotice] = useState('');

  const signals = useMemo(() => listItems(map).filter((item) => item.kind === 'signal'), [map]);
  const activeSignals = signals.filter((item) => !isProcessed(localState[item.sourceId || item.id] || item.status));
  const processedSignals = signals.filter((item) => isProcessed(localState[item.sourceId || item.id] || item.status));
  const visibleSignals = viewMode === 'done' ? processedSignals : activeSignals;

  const updateLocalStatus = (item, status) => {
    setLocalState((state) => ({ ...state, [item.sourceId || item.id]: status }));
    setNotice('Статус изменён локально. Запись статуса в Notion подключим следующим шагом.');
    setTimeout(() => setNotice(''), 2600);
  };

  return (
    <aside className="sideList inboxPanel" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead inboxHead">
        <div>
          <small>AI Inbox · входящие сигналы</small>
          <strong>{map.title}</strong>
          <p>Сюда падают Telegram-посты, ссылки, идеи и инструменты. Это ещё не задачи — сначала их нужно разобрать.</p>
        </div>
        <b className="miniProgressRing" title={`${activeSignals.length} новых`}>{activeSignals.length}</b>
      </div>

      <div className="sideTabs">
        <button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Новые <span>{activeSignals.length}</span></button>
        <button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Разобрано <span>{processedSignals.length}</span></button>
      </div>

      {notice ? <div className="inboxNotice">{notice}</div> : null}

      {visibleSignals.length ? (
        <div className="sideItems inboxItems">
          {visibleSignals.map((item) => {
            const raw = item.raw || {};
            const expanded = expandedId === item.id;
            const projects = raw.relatedProjects || [];
            const currentStatus = localState[item.sourceId || item.id] || item.status || 'New';
            const processed = isProcessed(currentStatus);
            return (
              <div className={`sideItemRow inboxSignal ${expanded ? 'expandedRow' : ''}`} key={item.id} onContextMenu={(event) => onOpenMenu(item, event)}>
                <button className="sideItemMain inboxSignalMain" onClick={() => setExpandedId((id) => id === item.id ? null : item.id)}>
                  <span className="taskCodeBadge inboxCode">{signalCode(item)}</span>
                  <div>
                    <b>{item.title}</b>
                    <small>{[raw.type || item.status || 'Telegram', formatDate(raw.capturedAt), raw.priority].filter(Boolean).join(' · ')}</small>
                  </div>
                </button>
                <div className="rowActions inboxActions">
                  {processed ? (
                    <button className="restoreMini" onClick={(event) => { event.stopPropagation(); updateLocalStatus(item, 'New'); }}>Вернуть</button>
                  ) : (
                    <>
                      <button className="doneMini" onClick={(event) => { event.stopPropagation(); updateLocalStatus(item, 'Reviewed'); }}>Разобрано</button>
                      <button className="archiveMini" onClick={(event) => { event.stopPropagation(); updateLocalStatus(item, 'Archived'); }}>Архив</button>
                    </>
                  )}
                </div>

                {expanded ? (
                  <div className="inlineTaskDetails inboxDetails">
                    {raw.summary ? <p>{raw.summary}</p> : null}
                    {raw.possibleUse ? <div><small>Как применить</small><p>{raw.possibleUse}</p></div> : null}
                    {raw.nextAction ? <div><small>Далее</small><p>{raw.nextAction}</p></div> : null}
                    {projects.length ? <div className="inboxChips">{projects.map((project) => <span key={project}>{chipText(project)}</span>)}</div> : null}
                    {raw.sourceUrl ? <a className="inboxLink" href={raw.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="emptySide"><b>{viewMode === 'done' ? 'Разобранных сигналов пока нет' : 'Новых сигналов нет'}</b><p>Когда ты отправишь пост или ссылку Telegram-боту, они появятся здесь как входящие сигналы.</p></div>
      )}
    </aside>
  );
}
