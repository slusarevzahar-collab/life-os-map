import { motion } from 'framer-motion';
import { isDoneNode, isLeafNode } from '../lib/actionMapModel.js';
import { canPatchTask } from '../lib/lifeMapSelectors.js';
import { Ring } from './Ring.jsx';
import '../data-detail.css';

function rawMetadata(node = {}) {
  const raw = node.raw || {};
  const rows = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== '') rows.push(`${label}: ${value}`);
  };

  if (node.kind === 'task') {
    add('Плановая дата', raw.plannedDate);
    add('Последнее касание', raw.lastTouched);
    add('Начало', raw.startedAt);
    add('Завершение', raw.finishedAt);
    if (Number(raw.durationMin || 0) > 0) add('Длительность задачи', `${raw.durationMin} мин`);
    if (Number(raw.timeDebt || 0) > 0) add('Долг времени', raw.timeDebt);
    if (Number(raw.rescheduleCount || 0) > 0) add('Переносов', raw.rescheduleCount);
    if (Array.isArray(raw.tags) && raw.tags.length) add('Теги', raw.tags.join(', '));
  }

  if (node.kind === 'goal') {
    add('Прогресс в Notion', `${Math.round(Number(raw.progress || 0))}%`);
  }

  if (node.kind === 'project' || node.kind === 'lifeArea') {
    add('Обновлено', raw.updatedAt);
  }

  if (node.kind === 'dream') {
    add('Добавлено', raw.capturedAt);
  }

  if (node.kind === 'signal') {
    add('Решение', raw.decision);
    add('AI-категория', raw.aiCategory);
    add('Версия AI-разбора', raw.aiProcessingVersion);
    if (Array.isArray(raw.assets) && raw.assets.length) add('Извлечено объектов', raw.assets.length);
  }

  return rows;
}

function mergedDetails(node = {}) {
  const base = Array.isArray(node.details) ? node.details.filter(Boolean) : [];
  return [...new Set([...base, ...rawMetadata(node)])];
}

export function DetailCard({ node, onClose, onComplete, onRestore, onOpenMenu, busyTaskId }) {
  if (!node) return null;
  const patchable = canPatchTask(node);
  const done = isDoneNode(node);
  const showProgress = Number(node.progress || 0) > 0 || (!isLeafNode(node) && Number(node.totalTasks || 0) > 0);
  const details = mergedDetails(node);

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
