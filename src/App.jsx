import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const fallbackSnapshot = {
  meta: { source: 'local-fallback', version: '0.1.0', updatedAt: null, warnings: [] },
  currentFocus: { title: 'Life OS Map', status: 'in_progress', progress: 55, nextAction: 'Подключить карту к данным через backend snapshot.' },
  goals: [],
  sessions: [],
  tasks: [
    { id: 'task_life_os_map', title: 'Life OS Map', project: 'Life OS', status: 'in_progress', progress: 55, summary: 'Центр системы.' },
    { id: 'task_mobile_ux', title: 'Mobile UX', project: 'Life OS', status: 'next', progress: 0, summary: 'Сделать мобильный режим dashboard + mini-map.' },
    { id: 'task_ai_inbox', title: 'AI Inbox', project: 'AI Inbox', status: 'next', progress: 35, summary: 'Telegram → Make → Notion.' },
  ],
  planning: { onTrack: 1, next: 2, waiting: 1, overdue: 0, done: 0 },
};

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'now', label: 'Сейчас' },
  { id: 'next', label: 'Следующее' },
  { id: 'progress', label: 'В работе' },
  { id: 'paused', label: 'Пауза' },
];

const STATUS_WEIGHT = { now: 0, progress: 1, next: 2, overdue: 3, waiting: 4, paused: 5, neutral: 6, done: 7 };

function normalizeStatus(status = '') {
  const value = String(status).toLowerCase();
  if (value.includes('now') || value.includes('сейчас')) return 'now';
  if (value.includes('in progress') || value.includes('progress') || value.includes('в работе')) return 'progress';
  if (value.includes('next') || value.includes('след')) return 'next';
  if (value.includes('done') || value.includes('готово') || value.includes('finished')) return 'done';
  if (value.includes('paused') || value.includes('пауза')) return 'paused';
  if (value.includes('waiting') || value.includes('ожид')) return 'waiting';
  if (value.includes('overdue') || value.includes('просроч')) return 'overdue';
  return 'neutral';
}

function statusLabel(status = '') {
  const key = normalizeStatus(status);
  const labels = {
    now: 'Сейчас', progress: 'В работе', next: 'Следующее', done: 'Готово',
    paused: 'Пауза', waiting: 'Ожидает', overdue: 'Просрочено', neutral: status || 'Без статуса',
  };
  return labels[key] || status || 'Без статуса';
}

function compactTitle(title = '', fallback = 'Задача') {
  const clean = String(title || fallback).replace(/^(Milestone:\s*)/i, '').trim();
  if (clean.length <= 22) return clean;
  const words = clean.split(/\s+/).filter(Boolean);
  return `${words.slice(0, 3).join(' ').slice(0, 22)}…`;
}

function formatDate(date) {
  if (!date) return 'без срока';
  try { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(date)); }
  catch { return date; }
}

function taskIcon(project = '') {
  const key = String(project).toLowerCase();
  if (key.includes('inbox')) return 'IN';
  if (key.includes('content')) return 'AI';
  if (key.includes('sleda')) return 'SD';
  if (key.includes('agent')) return 'AG';
  if (key.includes('github')) return 'GH';
  if (key.includes('yandex')) return 'YA';
  return 'OS';
}

function minutesLabel(minutes = 0) {
  const value = Number(minutes) || 0;
  if (value <= 0) return '0 мин';
  if (value < 60) return `${value} мин`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function sortTasksForMap(tasks) {
  return [...tasks].sort((a, b) => {
    const statusDiff = (STATUS_WEIGHT[normalizeStatus(a.status)] ?? 99) - (STATUS_WEIGHT[normalizeStatus(b.status)] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    const priorityDiff = (Number(a.priority) || 999) - (Number(b.priority) || 999);
    if (priorityDiff !== 0) return priorityDiff;
    return (Number(b.progress) || 0) - (Number(a.progress) || 0);
  });
}

function radialPosition(index, total, statusKey) {
  const safeTotal = Math.max(total, 1);
  const angleOffset = statusKey === 'now' ? -90 : -100;
  const angle = ((360 / safeTotal) * index + angleOffset) * (Math.PI / 180);
  const ringByStatus = {
    now: 22,
    progress: 30,
    next: 39,
    overdue: 44,
    waiting: 45,
    paused: 47,
    neutral: 42,
  };
  const ring = ringByStatus[statusKey] || 42;
  const jitter = index % 2 === 0 ? -2 : 2;
  return {
    x: 50 + Math.cos(angle) * (ring + jitter),
    y: 50 + Math.sin(angle) * (ring + jitter),
  };
}

function buildMapFromSnapshot(snapshot, filter = 'all') {
  const tasks = snapshot.tasks || [];
  const goals = snapshot.goals || [];
  const sessions = snapshot.sessions || [];
  const activeTasks = tasks.filter((task) => normalizeStatus(task.status) !== 'done');
  const filteredTasks = sortTasksForMap(activeTasks).filter((task) => filter === 'all' || normalizeStatus(task.status) === filter);
  const visibleTasks = filteredTasks.slice(0, 10);
  const nodes = visibleTasks.map((task, index) => {
    const statusKey = normalizeStatus(task.status);
    const slot = radialPosition(index, visibleTasks.length, statusKey);
    return {
      id: task.id,
      title: task.title || 'Без названия',
      shortTitle: compactTitle(task.title),
      monogram: taskIcon(task.project),
      progress: task.progress ?? 0,
      status: task.status || 'unknown',
      statusKey,
      project: task.project || 'Life OS',
      dueDate: task.dueDate || null,
      priority: task.priority ?? 0,
      x: Math.max(9, Math.min(91, slot.x)),
      y: Math.max(9, Math.min(91, slot.y)),
      summary: task.nextAction || task.summary || 'Следующий шаг пока не указан.',
    };
  });
  const nowTask = activeTasks.find((task) => normalizeStatus(task.status) === 'now') || activeTasks.find((task) => normalizeStatus(task.status) === 'progress') || activeTasks[0];
  const nextTask = activeTasks.find((task) => normalizeStatus(task.status) === 'next') || activeTasks.find((task) => task.id !== nowTask?.id);
  const waitingTasks = activeTasks.filter((task) => ['waiting', 'paused', 'overdue'].includes(normalizeStatus(task.status)));
  const totalSessionMinutes = sessions.reduce((sum, session) => sum + (Number(session.durationMin) || 0), 0);

  return {
    id: 'root', title: 'AI-first Life OS', icon: 'OS',
    progress: snapshot.currentFocus?.progress ?? nowTask?.progress ?? 0,
    status: snapshot.meta?.source || 'snapshot',
    current: snapshot.currentFocus?.title || nowTask?.title || 'Life OS Map',
    next: snapshot.currentFocus?.nextAction || nowTask?.nextAction || 'Следующий шаг не указан.',
    nodes, planning: snapshot.planning || {}, rawTasks: tasks, activeTasks, filteredTasks,
    nowTask, nextTask, waitingTasks, goals, sessions, totalSessionMinutes,
  };
}

function Progress({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className="progress"><span style={{ width: `${safe}%` }} /></div>;
}

function StatusPill({ status, statusKey }) {
  return <span className={`statusPill status-${statusKey || normalizeStatus(status)}`}>{statusLabel(status)}</span>;
}

function MiniMetric({ label, value, tone = 'neutral' }) {
  return <div className={`miniMetric tone-${tone}`}><span>{label}</span><b>{value}</b></div>;
}

function Planet({ node, onSelect, selected }) {
  return (
    <motion.button
      className={`planet ${selected ? 'selectedPlanet' : ''} status-${node.statusKey}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      onClick={(event) => { event.stopPropagation(); onSelect(node); }}
      whileTap={{ scale: 0.96 }}
      animate={{ y: [-3, 3, -3] }}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      title={node.title}
    >
      <div className="planetBall"><span>{node.monogram}</span></div>
      <div className="planetLabel"><strong>{node.shortTitle}</strong><small>{statusLabel(node.status)} · {node.progress}%</small></div>
    </motion.button>
  );
}

function TaskRow({ task, active, onClick }) {
  const statusKey = normalizeStatus(task.status);
  return (
    <button className={`taskRow ${active ? 'activeTaskRow' : ''}`} onClick={onClick}>
      <span className={`taskDot status-${statusKey}`} />
      <span className="taskRowMain"><b>{task.title}</b><small>{task.project || 'Life OS'} · {statusLabel(task.status)} · {task.progress || 0}%</small></span>
      <span className="taskRowDate">{formatDate(task.dueDate)}</span>
    </button>
  );
}

function GoalRow({ goal }) {
  return <div className="compactRow"><span className="compactDot" /><div><b>{goal.title}</b><small>{goal.status || 'status'} · {goal.progress || 0}% · {formatDate(goal.targetDate)}</small></div></div>;
}

function SessionRow({ session }) {
  return <div className="compactRow"><span className="compactDot sessionDot" /><div><b>{session.title}</b><small>{session.project || 'Life OS'} · {session.status || 'status'} · {minutesLabel(session.durationMin)}</small></div></div>;
}

function App() {
  const [snapshot, setSnapshot] = useState(fallbackSnapshot);
  const [apiState, setApiState] = useState('loading');
  const [panel, setPanel] = useState(null);
  const [selected, setSelected] = useState(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [mapFilter, setMapFilter] = useState('all');
  const map = useMemo(() => buildMapFromSnapshot(snapshot, mapFilter), [snapshot, mapFilter]);
  const activeNode = selected || map.nodes.find((node) => node.id === map.nowTask?.id) || map.nodes[0] || map;
  const stars = useMemo(() => Array.from({ length: 80 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, size: 1 + ((i * 13) % 3) })), []);

  const closePanel = () => setPanel(null);
  const openPanel = (nextPanel) => setPanel((current) => (current === nextPanel ? null : nextPanel));

  useEffect(() => {
    let active = true;
    fetch('/api/life-os/snapshot')
      .then((res) => { if (!res.ok) throw new Error(`API returned ${res.status}`); return res.json(); })
      .then((data) => { if (!active) return; setSnapshot(data); setApiState('connected'); })
      .catch(() => { if (!active) return; setApiState('fallback'); });
    return () => { active = false; };
  }, []);

  const selectTask = (task) => {
    const nextNode = map.nodes.find((node) => node.id === task.id) || {
      id: task.id, title: task.title, shortTitle: compactTitle(task.title), monogram: taskIcon(task.project),
      status: task.status, statusKey: normalizeStatus(task.status), project: task.project,
      progress: task.progress, dueDate: task.dueDate, priority: task.priority,
      summary: task.nextAction || 'Следующий шаг пока не указан.',
    };
    setSelected(nextNode);
    setPanel('mission');
  };

  return (
    <main className={`app ${workspaceVisible ? '' : 'mapOnly'}`} onClick={closePanel}>
      <div className="stars">{stars.map((s, i) => <i key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size }} />)}</div>

      <button className="workspaceToggle" onClick={(e) => { e.stopPropagation(); setWorkspaceVisible((v) => !v); }}>
        {workspaceVisible ? 'Скрыть панели' : 'Показать панели'}
      </button>

      <div className="mapFilters" onClick={(e) => e.stopPropagation()}>
        {FILTERS.map((filter) => (
          <button key={filter.id} className={mapFilter === filter.id ? 'activeFilter' : ''} onClick={() => { setMapFilter(filter.id); setSelected(null); }}>
            {filter.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {workspaceVisible && (
          <motion.section className="commandDeck sidePanel leftPanel" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="deckHeader"><div><small>MISSION CONTROL · {apiState}</small><h1>{map.title}</h1></div><strong>{map.progress}%</strong></div>
            <Progress value={map.progress} />
            <div className="deckFocusGrid">
              <div className="focusBlock currentFocusBlock"><span>Сейчас</span><b>{map.current}</b><small>{map.next}</small></div>
              <div className="focusBlock"><span>Следующее</span><b>{map.nextTask?.title || 'Не выбрано'}</b><small>{map.nextTask?.nextAction || 'Нет следующего шага'}</small></div>
            </div>
            <div className="metricsStrip">
              <MiniMetric label="Задачи" value={map.activeTasks.length} tone="green" />
              <MiniMetric label="Цели" value={map.goals.length} tone="blue" />
              <MiniMetric label="Сессии" value={map.sessions.length} tone="amber" />
            </div>
            <div className="connectionStrip">
              <span className={snapshot.meta?.connected?.tasks ? 'ok' : ''}>Tasks</span>
              <span className={snapshot.meta?.connected?.goals ? 'ok' : ''}>Goals</span>
              <span className={snapshot.meta?.connected?.sessions ? 'ok' : ''}>Sessions</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {workspaceVisible && (
          <motion.section className="taskRail sidePanel rightPanel" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="railHeader"><small>ACTIVE QUEUE · {mapFilter}</small><b>{map.filteredTasks.length}</b></div>
            <div className="taskList">{map.filteredTasks.slice(0, 14).map((task) => <TaskRow key={task.id} task={task} active={activeNode?.id === task.id} onClick={() => selectTask(task)} />)}</div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="map" aria-label="Life OS map" onClick={closePanel}>
        <div className="orbit orbit1" /><div className="orbit orbit2" /><div className="orbit orbit3" /><div className="orbit orbit4" />
        <button className="center" onClick={(event) => { event.stopPropagation(); setSelected(map); setPanel('mission'); }}>
          <span>{map.icon}</span><strong>{map.title}</strong><small>{map.status}</small>
        </button>
        {map.nodes.map((node) => <Planet key={node.id} node={node} selected={activeNode?.id === node.id} onSelect={(nextNode) => { setSelected(nextNode); setPanel('mission'); }} />)}
      </section>

      <nav className="bottomNav" onClick={(e) => e.stopPropagation()}>
        <button className={panel === 'mission' ? 'activeNav' : ''} onClick={() => openPanel('mission')}>Фокус</button>
        <button className={panel === 'data' ? 'activeNav' : ''} onClick={() => openPanel('data')}>Данные</button>
        <button className={panel === 'plan' ? 'activeNav' : ''} onClick={() => openPanel('plan')}>План</button>
      </nav>

      <button className="orbi" onClick={(e) => { e.stopPropagation(); openPanel('copilot'); }}>AI</button>

      <AnimatePresence mode="wait">
        {panel && (
          <motion.aside key={panel + activeNode?.id + apiState} className="sheet" initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 32, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
            <button className="sheetClose" onClick={closePanel} aria-label="Закрыть">×</button>
            {panel === 'mission' && activeNode && <><div className="sheetTitle"><span>{activeNode.monogram || activeNode.icon || 'OS'}</span><div><div className="metaRow"><StatusPill status={activeNode.status} statusKey={activeNode.statusKey} /><em>{activeNode.project}</em></div><h2>{activeNode.title}</h2></div></div><p>{activeNode.summary || map.current}</p><div className="detailGrid"><div><small>Прогресс</small><b>{activeNode.progress || 0}%</b></div><div><small>Срок</small><b>{formatDate(activeNode.dueDate)}</b></div><div><small>Приоритет</small><b>{activeNode.priority || '—'}</b></div></div><Progress value={activeNode.progress || map.progress} /></>}
            {panel === 'data' && <><h2>Workspace snapshot</h2><p><b>API:</b> {apiState}</p><p><b>Источник:</b> {snapshot.meta?.source || 'unknown'}</p><p><b>Endpoint:</b> <code>/api/life-os/snapshot</code></p><div className="detailGrid"><div><small>Tasks</small><b>{snapshot.tasks?.length || 0}</b></div><div><small>Goals</small><b>{snapshot.goals?.length || 0}</b></div><div><small>Sessions</small><b>{snapshot.sessions?.length || 0}</b></div></div><p><b>Время сессий:</b> {minutesLabel(map.totalSessionMinutes)}</p>{snapshot.meta?.warnings?.length ? <p className="warningText">Warnings: {snapshot.meta.warnings.join(' · ')}</p> : null}</>}
            {panel === 'plan' && <><h2>Goals & Sessions</h2><div className="splitPanel"><div><h3>Цели</h3>{map.goals.slice(0, 4).map((goal) => <GoalRow key={goal.id} goal={goal} />)}{!map.goals.length && <p>Goals DB пока не отдала записи.</p>}</div><div><h3>Сессии</h3>{map.sessions.slice(0, 4).map((session) => <SessionRow key={session.id} session={session} />)}{!map.sessions.length && <p>Work Sessions DB пока не отдала записи.</p>}</div></div></>}
            {panel === 'copilot' && <><h2>Life OS Copilot</h2><p>Карта теперь фильтруется по состояниям задач. Следующий слой — группировка планет по целям, запись событий обратно в Notion и автоматические рекомендации следующего шага.</p></>}
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
