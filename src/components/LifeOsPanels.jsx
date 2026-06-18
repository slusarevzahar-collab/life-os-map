import React from 'react';
import { motion } from 'framer-motion';
import {
  FILTERS,
  compactTitle,
  formatDate,
  minutesLabel,
  normalizeStatus,
  statusLabel,
  taskIcon,
} from '../lib/lifeOsData.js';
import {
  GoalRow,
  MiniMetric,
  Progress,
  SessionRow,
  StatusPill,
  TaskRow,
} from './Ui.jsx';

export function MapFilters({ value, onChange }) {
  return (
    <div className="mapFilters" onClick={(event) => event.stopPropagation()}>
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          className={value === filter.id ? 'activeFilter' : ''}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function MissionControl({ map, snapshot, apiState }) {
  return (
    <motion.section
      className="commandDeck sidePanel leftPanel"
      initial={{ x: -18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -18, opacity: 0 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="deckHeader">
        <div>
          <small>MISSION CONTROL · {apiState}</small>
          <h1>{map.title}</h1>
        </div>
        <strong>{map.progress}%</strong>
      </div>

      <Progress value={map.progress} />

      <div className="deckFocusGrid">
        <div className="focusBlock currentFocusBlock">
          <span>Сейчас</span>
          <b>{map.current}</b>
          <small>{map.next}</small>
        </div>
        <div className="focusBlock">
          <span>Следующее</span>
          <b>{map.nextTask?.title || 'Не выбрано'}</b>
          <small>{map.nextTask?.nextAction || 'Нет следующего шага'}</small>
        </div>
      </div>

      <div className="metricsStrip">
        <MiniMetric label="Задачи" value={map.activeTasks.length} tone="green" />
        <MiniMetric label="Цели" value={map.goals.length} tone="blue" />
        <MiniMetric label="Связано" value={`${map.linkedTasksCount}/${map.activeTasks.length}`} tone="amber" />
      </div>

      <div className="connectionStrip">
        <span className={snapshot.meta?.connected?.tasks ? 'ok' : ''}>Tasks</span>
        <span className={snapshot.meta?.connected?.goals ? 'ok' : ''}>Goals</span>
        <span className={snapshot.meta?.connected?.sessions ? 'ok' : ''}>Sessions</span>
      </div>
    </motion.section>
  );
}

export function ActiveQueue({ map, mapFilter, activeNode, onSelectTask }) {
  return (
    <motion.section
      className="taskRail sidePanel rightPanel"
      initial={{ x: 18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 18, opacity: 0 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="railHeader">
        <small>ACTIVE QUEUE · {mapFilter}</small>
        <b>{map.filteredTasks.length}</b>
      </div>
      <div className="taskList">
        {map.filteredTasks.slice(0, 18).map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            active={activeNode?.id === task.id}
            onClick={() => onSelectTask(task)}
          />
        ))}
      </div>
    </motion.section>
  );
}

export function BottomNav({ panel, onOpen }) {
  return (
    <nav className="bottomNav" onClick={(event) => event.stopPropagation()}>
      <button className={panel === 'guide' ? 'activeNav' : ''} onClick={() => onOpen('guide')}>Обзор</button>
      <button className={panel === 'mission' ? 'activeNav' : ''} onClick={() => onOpen('mission')}>Фокус</button>
      <button className={panel === 'queue' ? 'activeNav' : ''} onClick={() => onOpen('queue')}>Очередь</button>
      <button className={panel === 'data' ? 'activeNav' : ''} onClick={() => onOpen('data')}>Данные</button>
      <button className={panel === 'plan' ? 'activeNav' : ''} onClick={() => onOpen('plan')}>План</button>
    </nav>
  );
}

function GuidePanel({ map, onOpen }) {
  return (
    <>
      <div className="guideHeader">
        <span>Стартовая навигация</span>
        <h2>С чего начать в Life OS</h2>
        <p>Этот экран не должен быть складом всего подряд. Он показывает, что сейчас главное, где лежит очередь задач и как перейти к деталям.</p>
      </div>

      <div className="guideGrid">
        <button className="guideCard" onClick={() => onOpen('mission')}>
          <strong>1. Фокус</strong>
          <span>Слева показано, что делать сейчас и какой следующий шаг.</span>
        </button>
        <button className="guideCard" onClick={() => onOpen('queue')}>
          <strong>2. Очередь</strong>
          <span>Справа лежат все задачи. Карта показывает только главные узлы, чтобы не было каши.</span>
        </button>
        <button className="guideCard" onClick={() => onOpen('plan')}>
          <strong>3. План</strong>
          <span>Здесь цели и рабочие сессии: куда движемся и что уже делали.</span>
        </button>
        <button className="guideCard" onClick={() => onOpen('data')}>
          <strong>4. Данные</strong>
          <span>Проверка, откуда карта взяла информацию: Notion, задачи, цели, сессии.</span>
        </button>
      </div>

      <div className="guideNext">
        <span>Сейчас главное</span>
        <b>{map.current}</b>
        <small>{map.next}</small>
      </div>
    </>
  );
}

function QueuePanel({ map, activeNode, onSelectTask }) {
  return (
    <>
      <h2>Active Queue</h2>
      <p>Полный список остаётся здесь, а карта показывает только главные узлы, чтобы не превращаться в хаос.</p>
      <div className="sheetTaskList">
        {map.filteredTasks.slice(0, 20).map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            active={activeNode?.id === task.id}
            onClick={() => onSelectTask(task)}
          />
        ))}
      </div>
    </>
  );
}

function MissionPanel({ activeNode, map }) {
  return (
    <>
      <div className="sheetTitle">
        <span>{activeNode.monogram || activeNode.icon || 'OS'}</span>
        <div>
          <div className="metaRow">
            <StatusPill status={activeNode.status} statusKey={activeNode.statusKey} />
            <em>{activeNode.type === 'goal' ? 'Goal' : activeNode.project}</em>
          </div>
          <h2>{activeNode.title}</h2>
        </div>
      </div>
      <p>{activeNode.summary || map.current}</p>
      <div className="detailGrid">
        <div>
          <small>Прогресс</small>
          <b>{activeNode.progress || 0}%</b>
        </div>
        <div>
          <small>Срок</small>
          <b>{formatDate(activeNode.dueDate)}</b>
        </div>
        <div>
          <small>{activeNode.type === 'goal' ? 'Задачи' : 'Приоритет'}</small>
          <b>{activeNode.type === 'goal' ? activeNode.taskCount || 0 : activeNode.priority || '—'}</b>
        </div>
      </div>
      <Progress value={activeNode.progress || map.progress} />
    </>
  );
}

function DataPanel({ snapshot, map, apiState }) {
  return (
    <>
      <h2>Workspace snapshot</h2>
      <p><b>API:</b> {apiState}</p>
      <p><b>Источник:</b> {snapshot.meta?.source || 'unknown'}</p>
      <p><b>Endpoint:</b> <code>/api/life-os/snapshot</code></p>
      <div className="detailGrid">
        <div><small>Tasks</small><b>{snapshot.tasks?.length || 0}</b></div>
        <div><small>Goals</small><b>{snapshot.goals?.length || 0}</b></div>
        <div><small>Sessions</small><b>{snapshot.sessions?.length || 0}</b></div>
      </div>
      <p><b>Связано с целями:</b> {map.linkedTasksCount} из {map.activeTasks.length} активных задач.</p>
      <p><b>Время сессий:</b> {minutesLabel(map.totalSessionMinutes)}</p>
      {snapshot.meta?.warnings?.length ? <p className="warningText">Warnings: {snapshot.meta.warnings.join(' · ')}</p> : null}
    </>
  );
}

function PlanPanel({ map }) {
  return (
    <>
      <h2>Goals & Sessions</h2>
      <div className="splitPanel">
        <div>
          <h3>Цели</h3>
          {map.goals.slice(0, 4).map((goal) => <GoalRow key={goal.id} goal={goal} />)}
          {!map.goals.length && <p>Goals DB пока не отдала записи.</p>}
        </div>
        <div>
          <h3>Сессии</h3>
          {map.sessions.slice(0, 4).map((session) => <SessionRow key={session.id} session={session} />)}
          {!map.sessions.length && <p>Work Sessions DB пока не отдала записи.</p>}
        </div>
      </div>
    </>
  );
}

function CopilotPanel({ map }) {
  const nextTask = map.nextTask || map.nowTask;

  return (
    <>
      <h2>Life OS Copilot</h2>
      <p>
        Сейчас важнее не drag/zoom, а чистая логика отображения: карта показывает цели и только главные задачи,
        а полный поток лежит в очереди. Следующий практичный шаг — {nextTask?.nextAction || 'уточнить следующий шаг в Notion'}.
      </p>
      {nextTask ? (
        <div className="copilotCard">
          <span>{taskIcon(nextTask.project)}</span>
          <div>
            <b>{compactTitle(nextTask.title, 'Следующая задача', 60)}</b>
            <small>{nextTask.project || 'Life OS'} · {statusLabel(nextTask.status)} · {nextTask.progress || 0}%</small>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function DetailSheet({
  panel,
  activeNode,
  map,
  snapshot,
  apiState,
  onClose,
  onSelectTask,
  onOpen,
}) {
  if (!panel) return null;

  return (
    <motion.aside
      key={panel + activeNode?.id + apiState}
      className={`sheet sheet-${panel}`}
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 28, opacity: 0 }}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="sheetClose" onClick={onClose} aria-label="Закрыть">×</button>

      {panel === 'guide' ? <GuidePanel map={map} onOpen={onOpen} /> : null}
      {panel === 'mission' && activeNode ? <MissionPanel activeNode={activeNode} map={map} /> : null}
      {panel === 'queue' ? <QueuePanel map={map} activeNode={activeNode} onSelectTask={onSelectTask} /> : null}
      {panel === 'data' ? <DataPanel snapshot={snapshot} map={map} apiState={apiState} /> : null}
      {panel === 'plan' ? <PlanPanel map={map} /> : null}
      {panel === 'copilot' ? <CopilotPanel map={map} /> : null}
    </motion.aside>
  );
}
