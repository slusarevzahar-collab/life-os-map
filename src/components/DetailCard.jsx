import { motion } from 'framer-motion';
import { isDoneNode, isLeafNode } from '../lib/actionMapModel.js';
import { canPatchTask } from '../lib/lifeMapSelectors.js';
import { Ring } from './Ring.jsx';
import '../data-detail.css';

export function DetailCard({ node, onClose, onComplete, onRestore, onOpenMenu, busyTaskId }) {
  if (!node) return null;
  const patchable = canPatchTask(node);
  const done = isDoneNode(node);
  const showProgress = Number(node.progress || 0) > 0 || (!isLeafNode(node) && Number(node.totalTasks || 0) > 0);
  const details = Array.isArray(node.details) ? node.details.filter(Boolean) : [];

  return (
    <motion.aside
      className="detailCard compactDetail"
      onContextMenu={(event) => onOpenMenu(node, event)}
      onClick={(event) => event.stopPropagation()}
      initial={{ y: 18, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 18, opacity: 0, scale: 0.98 }}
    >
      <button className="closeDetail" onClick={onClose}>×</button>
      <div className="detailHead">
        <span>{node.icon}</span>
        <div><small>{node.subtitle || 'Объект'}</small><h2>{node.title}</h2></div>
        {showProgress ? <Ring value={node.progress} /> : null}
      </div>
      <p>{node.summary || 'Описание пока не заполнено.'}</p>
      {showProgress ? <div className="detailProgressText">Прогресс: {Math.round(Number(node.progress || 0))}%</div> : null}
      {details.length ? (
        <ul className="detailMetadata">
          {details.map((detail, index) => <li key={`${node.id}-detail-${index}`}>{detail}</li>)}
        </ul>
      ) : null}
      {patchable ? (
        <div className="detailActions">
          <button className={done ? 'restoreButton' : 'doneButton'} disabled={busyTaskId === node.sourceId} onClick={() => done ? onRestore(node) : onComplete(node)}>
            {busyTaskId === node.sourceId ? 'Сохраняю…' : done ? 'Вернуть в работу' : 'Пометить выполненной'}
          </button>
        </div>
      ) : null}
    </motion.aside>
  );
}
