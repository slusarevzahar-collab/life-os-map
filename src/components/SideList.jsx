import { useCallback, useEffect, useRef, useState } from 'react';
import { isDoneNode, isLeafNode } from '../lib/actionMapModel.js';
import { canPatchTask, hasBranch, listItems } from '../lib/lifeMapSelectors.js';
import { DRAG_THRESHOLD } from '../constants/lifeMap.js';
import { ChevronDown } from './ChevronDown.jsx';

function progressLabel(item) {
  const progress = Math.max(0, Math.min(100, Math.round(Number(item.progress) || 0)));
  const done = Number(item.completedTasks) || 0;
  const total = Number(item.totalTasks) || 0;
  return total > 0 ? `${progress}% · ${done}/${total}` : `${progress}%`;
}

export function SideList({ map, viewMode, setViewMode, onOpen, onComplete, onRestore, onReorderList, onOpenMenu, onSaveNote, busyTaskId }) {
  const items = listItems(map);
  const hasPlanetChildren = hasBranch(map);
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});
  const sideItemsRef = useRef(null);
  const pointerDragRef = useRef(null);

  const activeItems = items.filter((item) => !isDoneNode(item));
  const doneItems = items.filter((item) => isDoneNode(item));
  const visibleItems = viewMode === 'done' ? doneItems : activeItems;
  const reorderableItems = visibleItems.filter((item) => canPatchTask(item) && !isDoneNode(item));

  const makeReorderedList = useCallback((fromId, target) => {
    if (!fromId || !target?.id || fromId === target.id) return null;
    const from = reorderableItems.findIndex((item) => item.id === fromId);
    if (from < 0) return null;
    const reordered = [...reorderableItems];
    const [moved] = reordered.splice(from, 1);
    let insertAt = reordered.findIndex((item) => item.id === target.id);
    if (insertAt < 0) insertAt = reordered.length;
    if (target.position === 'after') insertAt += 1;
    reordered.splice(insertAt, 0, moved);
    const before = reorderableItems.map((item) => item.id).join('|');
    const after = reordered.map((item) => item.id).join('|');
    return before === after ? null : reordered;
  }, [reorderableItems]);

  const updateDropTarget = useCallback((clientY) => {
    const dragState = pointerDragRef.current;
    if (!dragState?.active || !sideItemsRef.current) return;
    const rows = Array.from(sideItemsRef.current.querySelectorAll('[data-reorder-id]'));
    let best = null;
    rows.forEach((row) => {
      const id = row.getAttribute('data-reorder-id');
      if (!id || id === dragState.id) return;
      const rect = row.getBoundingClientRect();
      const distance = clientY >= rect.top && clientY <= rect.bottom ? 0 : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
      if (!best || distance < best.distance) best = { id, rect, distance };
    });
    if (!best) return;
    const position = clientY < best.rect.top + best.rect.height / 2 ? 'before' : 'after';
    const nextTarget = { id: best.id, position };
    pointerDragRef.current = { ...dragState, dropTarget: nextTarget };
    setDropTarget(nextTarget);
  }, []);

  const movePointerDrag = useCallback((event) => {
    const dragState = pointerDragRef.current;
    if (!dragState) return;
    event.preventDefault?.();
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const distance = Math.hypot(dx, dy);
    if (!dragState.active && distance < DRAG_THRESHOLD) return;
    const nextState = { ...dragState, x: event.clientX, y: event.clientY, active: true };
    pointerDragRef.current = nextState;
    if (!dragState.active) setDragId(dragState.id);
    setDragPreview({ id: dragState.id, icon: dragState.item.icon, title: dragState.item.title, x: event.clientX, y: event.clientY });
    updateDropTarget(event.clientY);
  }, [updateDropTarget]);

  const endPointerDrag = useCallback((event) => {
    const dragState = pointerDragRef.current;
    if (!dragState) return;
    event?.preventDefault?.();
    const reordered = dragState.active ? makeReorderedList(dragState.id, dragState.dropTarget) : null;
    pointerDragRef.current = null;
    setDragId(null);
    setDropTarget(null);
    setDragPreview(null);
    if (reordered) onReorderList(reordered);
  }, [makeReorderedList, onReorderList]);

  useEffect(() => {
    const move = (event) => movePointerDrag(event);
    const up = (event) => endPointerDrag(event);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [movePointerDrag, endPointerDrag]);

  const startPointerDrag = (event, item) => {
    if (!canPatchTask(item) || isDoneNode(item) || busyTaskId === item.sourceId) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointerDragRef.current = { id: item.id, item, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, dropTarget: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  if (hasPlanetChildren) return null;

  return (
    <aside className="sideList" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead"><div><small>{viewMode === 'done' ? 'Выполненные задачи' : 'Задачи ветки'}</small><strong>{map.title}</strong></div><b>{progressLabel(map)}</b></div>
      <div className="sideTabs">
        <button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Активные <span>{activeItems.length}</span></button>
        <button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Сделано <span>{doneItems.length}</span></button>
      </div>
      {visibleItems.length ? (
        <div className="sideItems" ref={sideItemsRef}>
          {visibleItems.map((item) => {
            const nested = Boolean((item.children || []).length || (item.taskList || []).length);
            const patchable = canPatchTask(item);
            const done = isDoneNode(item);
            const dropClass = dropTarget?.id === item.id ? `drop-${dropTarget.position}` : '';
            const expanded = expandedId === item.id;
            const noteValue = notesDraft[item.id] ?? item.raw?.sessionNotes ?? item.summary ?? '';
            return (
              <div className={`sideItemRow ${done ? 'doneRow' : ''} ${expanded ? 'expandedRow' : ''} ${dragId === item.id ? 'draggingRow' : ''} ${dropClass}`} key={item.id} data-reorder-id={patchable && !done ? item.id : undefined} onContextMenu={(event) => onOpenMenu(item, event)}>
                <button className="sideItemMain" onClick={() => nested && !isLeafNode(item) ? onOpen(item.id) : setExpandedId((current) => current === item.id ? null : item.id)}>
                  <span>{item.icon}</span><div><b>{item.title}</b><small className="sideItemProgress">{progressLabel(item)}</small>{nested ? <small>{`${item.tasks || 0} задач · открыть ветку`}</small> : null}</div>
                </button>
                <div className="rowActions">
                  {isLeafNode(item) ? <button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((current) => current === item.id ? null : item.id); }}><ChevronDown open={expanded} /></button> : null}
                  {patchable && !done ? <button className="dragHandle" title="Перетащить задачу" disabled={busyTaskId === item.sourceId} onPointerDown={(event) => startPointerDrag(event, item)}>⋮⋮</button> : null}
                  {patchable ? <button className={done ? 'restoreMini' : 'doneMini'} disabled={busyTaskId === item.sourceId} onClick={(event) => { event.stopPropagation(); done ? onRestore(item) : onComplete(item); }}>{busyTaskId === item.sourceId ? '…' : done ? 'Вернуть' : 'Done'}</button> : null}
                </div>
                {expanded ? (
                  <div className="inlineTaskDetails">
                    <label className="noteEditorLabel">Заметка к задаче</label>
                    <textarea className="noteEditor" value={noteValue} onChange={(event) => setNotesDraft((drafts) => ({ ...drafts, [item.id]: event.target.value }))} placeholder="Короткая заметка, уточнение или контекст по задаче" />
                    <div className="noteEditorActions">
                      <span>Сохраняется в Notion в заметки задачи.</span>
                      <button disabled={!patchable || busyTaskId === item.sourceId} onClick={() => onSaveNote(item, noteValue)}>{busyTaskId === item.sourceId ? 'Сохраняю…' : 'Сохранить'}</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="emptySide"><b>{viewMode === 'done' ? 'Выполненных задач нет' : 'Список пуст'}</b><p>{viewMode === 'done' ? 'Когда задачи будут помечены Done, они появятся здесь и их можно будет вернуть обратно.' : 'Backend подключён, но у этой ветки пока нет элементов для списка.'}</p></div>
      )}
      {dragPreview ? (
        <div className="lifeDragGhost" style={{ left: dragPreview.x, top: dragPreview.y }}>
          <button className="sideItemMain"><span>{dragPreview.icon}</span><div><b>{dragPreview.title}</b></div></button>
        </div>
      ) : null}
    </aside>
  );
}
