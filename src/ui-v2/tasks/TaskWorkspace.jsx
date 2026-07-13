// LifeMap UI V2 — branch task workspace (Stage 5B1).
// Stage 5A logic unchanged: owns only list UI state and a
// one-commit-per-gesture reorder preview. Stage 5B1 passes onDiscussAi
// through to TaskRow.
import { useEffect, useMemo, useRef, useState } from 'react';
import { isDoneNode } from '../../lib/actionMapModel.js';
import { canPatchTask } from '../../lib/lifeMapSelectors.js';
import { TaskRow } from './TaskRow.jsx';

const DRAG_THRESHOLD = 6;

function orderByIds(items, ids) {
  if (!Array.isArray(ids)) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  items.forEach((item) => {
    if (!ids.includes(item.id)) ordered.push(item);
  });
  return ordered;
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function TaskWorkspace({
  node,
  items,
  hidden,
  expandedId,
  onToggleExpand,
  busyById,
  networkDisabled,
  reorderBusy,
  onSaveNote,
  onDone,
  onRestore,
  onOpenMenu,
  onOpenNodeMenu,
  onOpenDetails,
  onReorder,
  onDiscussAi,
}) {
  const [tab, setTab] = useState('active');
  const [dragOrderIds, setDragOrderIds] = useState(null);
  const dragRef = useRef(null);
  const rootRef = useRef(null);

  const activeItems = useMemo(() => items.filter((item) => !isDoneNode(item)), [items]);
  const doneItems = useMemo(() => items.filter((item) => isDoneNode(item)), [items]);
  const baseVisibleItems = tab === 'done' ? doneItems : activeItems;
  const visibleItems = useMemo(
    () => orderByIds(baseVisibleItems, dragOrderIds),
    [baseVisibleItems, dragOrderIds]
  );
  const progress = Math.max(0, Math.min(100, Math.round(Number(node?.progress) || 0)));

  useEffect(() => {
    if (!dragRef.current) setDragOrderIds(null);
  }, [tab, items]);

  const combinedOrder = (nextVisibleOrder) =>
    tab === 'done' ? [...activeItems, ...nextVisibleOrder] : [...nextVisibleOrder, ...doneItems];

  const commitReorder = async (nextVisibleOrder) => {
    if (networkDisabled || reorderBusy) return { ok: false, offline: networkDisabled };
    const result = await onReorder(combinedOrder(nextVisibleOrder));
    setDragOrderIds(null);
    return result;
  };

  const moveBy = async (item, delta) => {
    if (!canPatchTask(item) || networkDisabled || reorderBusy) return;
    const index = visibleItems.findIndex((entry) => entry.id === item.id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= visibleItems.length) return;
    const next = visibleItems.slice();
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setDragOrderIds(next.map((entry) => entry.id));
    await commitReorder(next);
  };

  const handlePointerDown = (item) => (event) => {
    if (!canPatchTask(item) || networkDisabled || reorderBusy) return;
    event.preventDefault();
    const ids = visibleItems.map((entry) => entry.id);
    dragRef.current = {
      id: item.id,
      startY: event.clientY,
      pointerId: event.pointerId,
      target: event.currentTarget,
      initialIds: ids,
      currentIds: ids,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best-effort pointer capture; document layout still remains stable.
    }
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    event.preventDefault();

    const rows = Array.from(rootRef.current?.querySelectorAll('[data-task-row-id]') || []);
    const overRow = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const overId = overRow?.getAttribute('data-task-row-id');
    if (!overId || overId === drag.id) return;

    const current = drag.currentIds.slice();
    const fromIndex = current.indexOf(drag.id);
    const toIndex = current.indexOf(overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    drag.currentIds = current;
    setDragOrderIds(current);
  };

  const finishPointerDrag = async (event, commit) => {
    const drag = dragRef.current;
    if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return;
    dragRef.current = null;
    try {
      drag.target?.releasePointerCapture?.(drag.pointerId);
    } catch {
      // Pointer may already be released by the browser.
    }

    if (!commit || !drag.moved || sameIds(drag.initialIds, drag.currentIds)) {
      setDragOrderIds(null);
      return;
    }
    const nextItems = orderByIds(baseVisibleItems, drag.currentIds);
    await commitReorder(nextItems);
  };

  if (hidden || !node || !items.length) return null;

  return (
    <section
      className="lifemapV2TaskWorkspace"
      ref={rootRef}
      aria-label={`Задачи ветки: ${node.title}`}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointerDrag(event, true)}
      onPointerCancel={(event) => finishPointerDrag(event, false)}
    >
      <header className="lifemapV2TaskWorkspaceHead">
        <div>
          <small className="lifemapV2TaskWorkspaceEyebrow">ЗАДАЧИ ВЕТКИ</small>
          <h2 className="lifemapV2TaskWorkspaceTitle">{node.title}</h2>
        </div>
        <div className="lifemapV2TaskWorkspaceHeadActions">
          {progress > 0 ? (
            <div className="lifemapV2TaskWorkspaceRing" style={{ '--pct': `${progress}%` }}>
              <span>{progress}%</span>
            </div>
          ) : null}
          <button
            type="button"
            className="lifemapV2TaskWorkspaceMenuBtn"
            aria-label={`Действия для ветки «${node.title}»`}
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenNodeMenu(node, {
                clientX: rect.left + rect.width / 2,
                clientY: rect.bottom + 4,
                returnFocus: event.currentTarget,
              });
            }}
          >
            ⋯
          </button>
        </div>
      </header>

      <div className="lifemapV2TaskTabs" role="tablist" aria-label="Активные и завершённые задачи">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={tab === 'active' ? 'lifemapV2TaskTabActive' : 'lifemapV2TaskTab'}
          onClick={() => setTab('active')}
        >
          Активные <span>{activeItems.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'done'}
          className={tab === 'done' ? 'lifemapV2TaskTabActive' : 'lifemapV2TaskTab'}
          onClick={() => setTab('done')}
        >
          Завершено <span>{doneItems.length}</span>
        </button>
      </div>

      {visibleItems.length ? (
        <div className="lifemapV2TaskRows" aria-busy={reorderBusy ? 'true' : undefined}>
          {visibleItems.map((item, index) => {
            const patchable = canPatchTask(item);
            const itemBusy = Boolean(busyById[item.sourceId || item.id]);
            const reorderDisabled = !patchable || networkDisabled || reorderBusy;
            return (
              <div key={item.id} data-task-row-id={item.id}>
                <TaskRow
                  item={item}
                  expanded={expandedId === item.id}
                  patchable={patchable}
                  busy={itemBusy}
                  networkDisabled={networkDisabled}
                  reorderDisabled={reorderDisabled}
                  isFirst={index === 0}
                  isLast={index === visibleItems.length - 1}
                  onToggleExpand={onToggleExpand}
                  onSaveNote={onSaveNote}
                  onDone={onDone}
                  onRestore={onRestore}
                  onOpenMenu={onOpenMenu}
                  onOpenDetails={onOpenDetails}
                  onMoveUp={(row) => moveBy(row, -1)}
                  onMoveDown={(row) => moveBy(row, 1)}
                  onDiscussAi={onDiscussAi}
                  dragHandleProps={{ onPointerDown: handlePointerDown(item) }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="lifemapV2TaskEmpty">
          <b>{tab === 'done' ? 'Завершённых записей нет' : 'Список пуст'}</b>
          <p>{tab === 'done' ? 'Завершённые записи появятся здесь.' : 'У этой ветки пока нет объектов для списка.'}</p>
        </div>
      )}
    </section>
  );
}
