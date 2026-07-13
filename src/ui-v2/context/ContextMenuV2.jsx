// LifeMap UI V2 — accessible context menu (Stage 5A).
import { useEffect, useMemo, useRef } from 'react';

const MENU_W = 220;
const MENU_MAX_H = 300;
const DESIGN_W = 1280;
const DESIGN_H = 800;

export function clientPointToDesignBox(clientX, clientY, frameEl) {
  if (!frameEl) return { x: DESIGN_W / 2, y: DESIGN_H / 2 };
  const rect = frameEl.getBoundingClientRect();
  const scale = rect.width > 0 ? rect.width / DESIGN_W : 1;
  const x = (Number(clientX) - rect.left) / scale;
  const y = (Number(clientY) - rect.top) / scale;
  return {
    x: Math.max(8, Math.min(DESIGN_W - MENU_W - 8, Number.isFinite(x) ? x : DESIGN_W / 2)),
    y: Math.max(8, Math.min(DESIGN_H - MENU_MAX_H - 8, Number.isFinite(y) ? y : DESIGN_H / 2)),
  };
}

export function ContextMenuV2({ menu, onClose, actions }) {
  const rootRef = useRef(null);

  const items = useMemo(() => {
    if (!menu) return [];
    const { node, capabilities } = menu;
    return [
      capabilities.canFocus && { key: 'focus-now', label: 'Фокус сейчас', onClick: () => actions.onFocusNow(node) },
      capabilities.canFocus && { key: 'focus-next', label: 'Следующий', onClick: () => actions.onFocusNext(node) },
      capabilities.canRename && {
        key: 'rename',
        label: 'Переименовать',
        disabled: capabilities.renameDisabled,
        onClick: () => actions.onRename(node),
      },
      { key: 'details', label: 'Открыть подробности', onClick: () => actions.onOpenDetails(node) },
      capabilities.canPatch && !capabilities.done && {
        key: 'done',
        label: 'Done',
        disabled: capabilities.networkDisabled,
        onClick: () => actions.onDone(node),
      },
      capabilities.canPatch && capabilities.done && {
        key: 'restore',
        label: 'Восстановить',
        disabled: capabilities.networkDisabled,
        onClick: () => actions.onRestore(node),
      },
      capabilities.canCreateInside && { key: 'create', label: 'Создать объект внутри', onClick: () => actions.onCreateInside(node) },
      capabilities.canDelete && { key: 'delete', label: 'Удалить', danger: true, onClick: () => actions.onDelete(node) },
    ].filter(Boolean);
  }, [actions, menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = Array.from(rootRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
      if (!buttons.length) return;
      event.preventDefault();
      const currentIndex = buttons.indexOf(document.activeElement);
      let nextIndex = 0;
      if (event.key === 'End') nextIndex = buttons.length - 1;
      else if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length;
      else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? buttons.length - 1 : (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    const frameId = window.requestAnimationFrame(() => {
      rootRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.cancelAnimationFrame(frameId);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const { node, x, y } = menu;

  return (
    <div
      ref={rootRef}
      className="lifemapV2ContextMenu"
      role="menu"
      aria-label={`Действия: ${node.title}`}
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="lifemapV2ContextMenuTitle">{node.title}</div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.disabled ? 'API недоступен' : undefined}
          className={`lifemapV2ContextMenuItem${item.danger ? ' lifemapV2ContextMenuItemDanger' : ''}`}
          onClick={() => {
            if (!item.disabled) item.onClick();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
