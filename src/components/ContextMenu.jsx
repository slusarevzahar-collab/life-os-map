import { isLeafNode, shortText } from '../lib/actionMapModel.js';
import { canRenameNode } from '../lib/lifeMapSelectors.js';

export function ContextMenu({ menu, onClose, onFocusNow, onFocusNext, onRename, onCreateObject, onDeleteObject }) {
  if (!menu) return null;
  const renamable = canRenameNode(menu.node);
  const canCreateObject = !isLeafNode(menu.node);
  const canDeleteObject = Boolean(menu.node.raw?.local);
  const canFocus = menu.node.id !== 'root';

  return (
    <div className="contextMenu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
      <b>{shortText(menu.node.title, 44)}</b>
      {canCreateObject ? <button onClick={() => onCreateObject(menu.node)}>Создать объект</button> : null}
      {renamable ? <button onClick={() => onRename(menu.node)}>Переименовать</button> : null}
      {canDeleteObject ? <button className="dangerAction" onClick={() => onDeleteObject(menu.node)}>Удалить объект</button> : null}
      {canFocus ? <button onClick={() => onFocusNow(menu.node)}>Сделать текущим фокусом</button> : null}
      {canFocus ? <button onClick={() => onFocusNext(menu.node)}>Поставить следующим</button> : null}
      <button onClick={onClose}>Закрыть</button>
    </div>
  );
}
