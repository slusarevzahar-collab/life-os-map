import { useEffect, useRef, useState } from 'react';
import { isDoneNode, isLeafNode } from '../lib/actionMapModel.js';
import { canPatchTask, listItems } from '../lib/lifeMapSelectors.js';
import { ChevronDown } from './ChevronDown.jsx';
import { AIInboxV2 } from './AIInboxV2.jsx';

function compactCode(value = 'LM') {
  const source = String(value || 'LM').toUpperCase().replace(/\s+/g, '');
  const explicit = source.match(/^([A-ZА-Я]{1,3})-?(\d{1,4})$/);
  if (explicit) return `${explicit[1]}${explicit[2]}`;
  const letters = (source.match(/[A-ZА-Я]{1,3}/)?.[0] || 'LM').slice(0, 3);
  const number = source.match(/\d+/)?.[0] || '1';
  return `${letters}${number}`;
}

function itemCode(item, fallback = 'LM') { return compactCode(item.code || item.raw?.code || item.icon || fallback); }
function progressValue(item) { return Math.max(0, Math.min(100, Math.round(Number(item.progress) || 0))); }
function nodeHighlighted(item, highlightedItemId) {
  if (!item || !highlightedItemId) return false;
  return item.id === highlightedItemId || item.sourceId === highlightedItemId || `task-${item.sourceId}` === highlightedItemId || `signal-${item.sourceId}` === highlightedItemId;
}
function highlightRowStyle(active) {
  return active ? { borderColor: 'rgba(125, 249, 255, 0.78)', background: 'rgba(103, 232, 249, 0.14)', boxShadow: '0 0 0 1px rgba(103, 232, 249, 0.2), 0 0 34px rgba(103, 232, 249, 0.22)', transform: 'translateY(-1px)' } : undefined;
}
function openAssistantFor(target, context = {}) { window.dispatchEvent(new CustomEvent('lifemap:assistant-target', { detail: { target, context } })); }
function itemNoun(kind = '') { if (kind === 'session') return 'сессий'; if (kind === 'dream') return 'мечтаний'; if (kind === 'signal') return 'сигналов'; return 'задач'; }
function branchNoun(items = []) {
  const kinds = [...new Set(items.map((item) => item.kind))];
  return kinds.length === 1 ? itemNoun(kinds[0]) : 'объектов';
}
function assistantMode(item = {}) { if (item.kind === 'session') return 'session'; if (item.kind === 'dream') return 'dream'; if (item.kind === 'signal') return 'signal'; return 'task'; }

function InlineTitleEditor({ value, onChange, onSubmit, onCancel }) {
  return (
    <input
      className="inlineTitleInput taskTitleInput"
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onSubmit}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit(event);
        if (event.key === 'Escape') onCancel(event);
      }}
    />
  );
}

function ReadOnlyDetails({ item }) {
  const details = Array.isArray(item.details) ? item.details.filter(Boolean) : [];
  return (
    <div className="inlineTaskDetails">
      <p>{item.summary || 'Подробности пока не заполнены.'}</p>
      {details.length ? <ul className="detailMetadata">{details.map((detail, index) => <li key={`${item.id}-side-detail-${index}`}>{detail}</li>)}</ul> : null}
      <div className="noteEditorActions">
        <button type="button" className="ghostInboxAction" onClick={() => openAssistantFor(item, { mode: assistantMode(item) })}>Обсудить с AI</button>
      </div>
    </div>
  );
}

export function SideList({
  map,
  snapshot,
  activeFocus,
  viewMode,
  setViewMode,
  onComplete,
  onRestore,
  onOpenMenu,
  onSaveNote,
  busyTaskId,
  highlightedItemId,
  inlineEditor,
  onInlineRenameChange,
  onSubmitInlineRename,
  onCancelInlineRename,
}) {
  const items = listItems(map).filter((item) => isLeafNode(item));
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});
  const listRef = useRef(null);
  const inboxMode = map?.id === 'sphere-inbox' || map?.kind === 'inbox' || ((map?.title === 'AI Inbox' || map?.title === 'LM Inbox') && items.some((item) => item.kind === 'signal'));
  const activeItems = items.filter((item) => !isDoneNode(item));
  const doneItems = items.filter((item) => isDoneNode(item));
  const visibleItems = viewMode === 'done' ? doneItems : activeItems;
  const mapProgress = progressValue(map);
  const noun = branchNoun(items);

  useEffect(() => {
    if (highlightedItemId && listRef.current) listRef.current.querySelector('.highlightedTask')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedItemId, visibleItems.length]);

  const sharedContext = typeof window !== 'undefined' ? window.__lifemapContext || {} : {};
  if (inboxMode) return <AIInboxV2 map={map} snapshot={snapshot || sharedContext.snapshot || {}} activeFocus={activeFocus || sharedContext.activeFocus || null} highlightedItemId={highlightedItemId} />;

  return (
    <aside className="sideList" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead">
        <div>
          <small>{viewMode === 'done' ? `Завершённые ${noun}` : `${noun[0]?.toUpperCase() || ''}${noun.slice(1)} ветки`}</small>
          <strong>{map.title}</strong>
        </div>
        <b className="miniProgressRing" title={`${mapProgress}%`} style={{ '--pct': `${mapProgress}%` }}>{mapProgress}%</b>
      </div>

      <div className="sideTabs">
        <button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Активные <span>{activeItems.length}</span></button>
        <button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Завершено <span>{doneItems.length}</span></button>
      </div>

      {visibleItems.length ? (
        <div className="sideItems" ref={listRef}>
          {visibleItems.map((item) => {
            const patchable = canPatchTask(item);
            const done = isDoneNode(item);
            const expanded = expandedId === item.id;
            const editing = inlineEditor?.nodeId === item.id;
            const noteValue = notesDraft[item.id] ?? item.raw?.sessionNotes ?? item.summary ?? '';
            const highlighted = nodeHighlighted(item, highlightedItemId);

            return (
              <div
                className={`sideItemRow ${done ? 'doneRow' : ''} ${expanded ? 'expandedRow' : ''} ${highlighted ? 'highlightedTask' : ''}`}
                style={highlightRowStyle(highlighted)}
                key={item.id}
                onContextMenu={(event) => onOpenMenu(item, event)}
              >
                <button className="sideItemMain" style={{ gridTemplateColumns: 'minmax(48px, auto) minmax(0, 1fr)' }} onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}>
                  <span className="taskCodeBadge" style={{ width: 'auto', minWidth: 48, padding: '0 8px', fontSize: 10 }}>{itemCode(item)}</span>
                  <div>
                    {editing
                      ? <InlineTitleEditor value={inlineEditor.value} onChange={onInlineRenameChange} onSubmit={(event) => onSubmitInlineRename(item, event)} onCancel={onCancelInlineRename} />
                      : <b>{item.title}</b>}
                  </div>
                </button>

                <div className="rowActions">
                  <button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((current) => current === item.id ? null : item.id); }}><ChevronDown open={expanded} /></button>
                  <button className="ghostInboxAction taskAiChat" type="button" onClick={(event) => { event.stopPropagation(); openAssistantFor(item, { mode: assistantMode(item), mapTitle: map.title }); }}>AI</button>
                  {patchable ? (
                    <button className={done ? 'restoreMini' : 'doneMini'} disabled={busyTaskId === item.sourceId} onClick={(event) => { event.stopPropagation(); done ? onRestore(item) : onComplete(item); }}>
                      {busyTaskId === item.sourceId ? '…' : done ? 'Вернуть' : 'Done'}
                    </button>
                  ) : null}
                </div>

                {expanded ? (
                  patchable ? (
                    <div className="inlineTaskDetails">
                      <label className="noteEditorLabel">Заметка к задаче</label>
                      <textarea className="noteEditor" value={noteValue} onChange={(event) => setNotesDraft((drafts) => ({ ...drafts, [item.id]: event.target.value }))} placeholder="Короткая заметка, уточнение или контекст по задаче" />
                      <div className="noteEditorActions">
                        <button type="button" className="ghostInboxAction" onClick={() => openAssistantFor(item, { mode: 'task', mapTitle: map.title })}>Чат с AI</button>
                        <button disabled={busyTaskId === item.sourceId} onClick={() => onSaveNote(item, noteValue)}>{busyTaskId === item.sourceId ? 'Сохраняю…' : 'Сохранить'}</button>
                      </div>
                    </div>
                  ) : <ReadOnlyDetails item={item} />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="emptySide">
          <b>{viewMode === 'done' ? 'Завершённых записей нет' : 'Список пуст'}</b>
          <p>{viewMode === 'done' ? 'Завершённые записи появятся здесь.' : 'У этой ветки пока нет объектов для списка.'}</p>
        </div>
      )}
    </aside>
  );
}
