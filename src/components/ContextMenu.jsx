import { shortText } from '../lib/actionMapModel.js';
import { canRenameNode } from '../lib/lifeMapSelectors.js';

export function ContextMenu({ menu, onClose, onFocusNow, onFocusNext, onRename }) {
  if (!menu) return null;
  const renamable = canRenameNode(menu.node);

  return (
    <div className="contextMenu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
      <b>{shortText(menu.node.title, 44)}</b>
      {renamable ? <button onClick={() => onRename(menu.node)}>Переименовать</button> : null}
      <button onClick={() => onFocusNow(menu.node)}>Сделать текущим фокусом</button>
      <button onClick={() => onFocusNext(menu.node)}>Поставить следующим</button>
      <button onClick={onClose}>Закрыть</button>
    </div>
  );
}
