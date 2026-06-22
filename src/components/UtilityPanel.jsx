import { motion } from 'framer-motion';
import { isDoneNode } from '../lib/actionMapModel.js';
import { flattenNodes, uniqueBySource } from '../lib/lifeMapSelectors.js';

export function UtilityPanel({ type, rootMap, errors, onClose, onRestore, busyTaskId }) {
  if (!type) return null;
  const doneItems = uniqueBySource(flattenNodes(rootMap).filter((node) => node.kind === 'task' && isDoneNode(node)));

  return (
    <motion.aside className="utilityPanel" onClick={(event) => event.stopPropagation()} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}>
      <button className="closeDetail" onClick={onClose}>×</button>
      <h2>{type === 'errors' ? 'Ошибки LifeMap' : 'Выполненные задачи'}</h2>
      {type === 'errors' ? (
        <div className="panelList errorList">
          {errors.length ? errors.map((error, index) => <div key={index}><b>Ошибка {index + 1}</b><span>{error}</span></div>) : <div><b>Ошибок нет</b><span>Backend и frontend сейчас не сообщают о проблемах.</span></div>}
        </div>
      ) : (
        <div className="panelList donePanelList">
          {doneItems.length ? doneItems.map((node) => (
            <div className="donePanelRow" key={node.id}>
              <div><b>{node.title}</b><span>{node.raw?.project || 'Done'}</span></div>
              <button className="restoreMini" disabled={busyTaskId === node.sourceId} onClick={() => onRestore(node)}>{busyTaskId === node.sourceId ? '…' : 'Вернуть'}</button>
            </div>
          )) : <div><b>Выполненных задач нет</b><span>Когда задача будет закрыта, она появится здесь.</span></div>}
        </div>
      )}
    </motion.aside>
  );
}
