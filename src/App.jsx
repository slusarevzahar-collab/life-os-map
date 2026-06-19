import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './action-map.css';

import { buildActionMap, findNode, isDoneNode, isLeafNode, shortText } from './lib/actionMapModel.js';

const mapVariants = {
  initial: { opacity: 0, scale: 0.88, filter: 'blur(8px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 1.08, filter: 'blur(8px)' },
};

function emptySnapshot(source = 'loading', warning = '') {
  const isOffline = source === 'api-offline';
  return {
    meta: {
      source,
      version: 'empty-ui-state',
      updatedAt: new Date().toISOString(),
      warnings: warning ? [warning] : [],
      connected: { tasks: false, goals: false, sessions: false, projectAreas: false, dreams: false, signals: false },
    },
    currentFocus: {
      id: isOffline ? 'api-offline' : 'loading',
      title: isOffline ? 'API недоступен' : 'Загрузка данных',
      project: 'Life OS Map',
      status: isOffline ? 'offline' : 'loading',
      progress: 0,
      nextAction: isOffline ? 'Запусти backend: npm run api, затем обнови карту.' : 'Жду ответ backend API.',
    },
    goals: [], tasks: [], sessions: [], projectAreas: [], dreams: [], signals: [],
    planning: { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 },
  };
}

function Stars() {
  const stars = useMemo(() => Array.from({ length: 88 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, size: 1 + ((i * 13) % 3), delay: `${(i % 7) * 0.32}s` })), []);
  return <div className="stars">{stars.map((star, index) => <i key={index} style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }} />)}</div>;
}

function Ring({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className="ring" style={{ '--pct': `${pct * 3.6}deg` }}><span>{pct}%</span></div>;
}

function hasBranch(node) { return Boolean((node?.children || []).some((item) => !isLeafNode(item))); }
function topItems(node) { return (node.children || []).filter((item) => !isLeafNode(item)); }
function canPatchTask(node) { return node?.kind === 'task' && Boolean(node.sourceId); }

function listItems(node) {
  const directLeaves = (node.children || []).filter((item) => isLeafNode(item));
  const taskList = node.taskList || [];
  const branchCards = topItems(node);
  const merged = [...taskList, ...directLeaves];
  const uniqLeaves = merged.filter((item, index, arr) => item?.id && arr.findIndex((next) => next.id === item.id) === index);
  if (uniqLeaves.length) return uniqLeaves;
  return branchCards;
}

function apiCandidates(path) {
  if (typeof window === 'undefined') return [path];
  const origin = window.location.origin;
  const candidates = [path];
  const codespaceApiOrigin = origin.replace(/-\d+\.app\.github\.dev$/i, '-3001.app.github.dev');
  if (codespaceApiOrigin !== origin) candidates.push(`${codespaceApiOrigin}${path}`);
  return [...new Set(candidates)];
}

async function fetchSnapshot() {
  const errors = [];
  for (const url of apiCandidates('/api/life-os/snapshot')) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      return { ...data, meta: { ...(data.meta || {}), apiUrl: url } };
    } catch (error) { errors.push(`${url}: ${error.message}`); }
  }
  throw new Error(errors.join(' | '));
}

async function patchTask(taskId, payload) {
  const errors = [];
  for (const url of apiCandidates(`/api/life-os/tasks/${taskId}`)) {
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `API ${response.status}`);
      return data;
    } catch (error) { errors.push(`${url}: ${error.message}`); }
  }
  throw new Error(errors.join(' | '));
}

function dataState(snapshot, apiState) {
  if (apiState === 'api offline' || snapshot.meta?.source === 'api-offline') return 'api offline';
  if (apiState === 'loading') return 'loading';
  if (snapshot.meta?.source?.includes('mock')) return 'mock data';
  return apiState;
}

function TopNav({ map, canBack, onBack, onCenter, apiState, errorCount, onErrors }) {
  return <header className="topNav" onClick={(event) => event.stopPropagation()}><button className="backButton" onClick={onBack} disabled={!canBack}>← Назад</button><div className="topTitle"><span className="brand"><b>Live</b><strong>Map</strong></span><em>· {apiState}</em><i>{map.title}</i></div><div className="topActions"><button className="centerButton" onClick={onCenter}>Главная</button>{errorCount ? <button className="errorButton hasErrors" onClick={onErrors}>Ошибки {errorCount}</button> : null}</div></header>;
}

function MissionPanel({ map, snapshot, apiState, onSteps, onStats }) {
  const [open, setOpen] = useState(false);
  const isMock = snapshot.meta?.source?.includes('mock');
  const isOffline = apiState === 'api offline' || snapshot.meta?.source === 'api-offline';
  const isLoading = apiState === 'loading' || snapshot.meta?.source === 'loading';
  if (!open) {
    const label = isOffline ? 'API OFFLINE' : isMock ? 'MOCK DATA' : isLoading ? 'LOADING' : 'MISSION CONTROL';
    return <section className="mission missionCollapsed" onClick={(event) => event.stopPropagation()}><button onClick={() => setOpen(true)}><span>{map.icon}</span><div><small>{label}</small><b>{map.title}</b></div><Ring value={map.progress} /></button></section>;
  }
  return <section className="mission" onClick={(event) => event.stopPropagation()}><button className="collapseMission" onClick={() => setOpen(false)}>Свернуть</button><div className="missionTop"><div><small><em /> {isOffline ? 'API OFFLINE · нет данных для карты' : isMock ? 'MOCK DATA · проверь backend/.env' : isLoading ? 'LOADING · жду backend' : 'MISSION CONTROL'}</small><h1><span>{map.icon}</span>{map.title}</h1></div><Ring value={map.progress} /></div>{isOffline ? <div className="warningLine">Карта специально не показывает запасные данные: backend API недоступен. Запусти npm run api и обнови страницу.</div> : null}{isMock ? <div className="warningLine">Сейчас карта получает mock-данные. Нужно, чтобы backend видел NOTION_TOKEN и NOTION_TASKS_DB_ID.</div> : null}<div className="missionLine activeLine">Сейчас: {map.session?.current || map.summary}</div><div className="missionLine nextLine">Следующий шаг: {map.session?.next || 'Выбери планету, чтобы открыть следующий уровень.'}</div><div className="missionButtons"><button onClick={onSteps}>Следующие шаги</button><button onClick={onStats}>Статистика</button></div></section>;
}

function OrbitMap({ map, hasSide, onOpen, onSelect }) {
  const children = topItems(map);
  return <motion.section key={map.id} className={`mapStage ${hasSide ? 'mapWithSide' : ''}`} variants={mapVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}><div className="mapGlow" /><div className="orbit orbit1" /><div className="orbit orbit2" /><div className="orbit orbit3" /><motion.button className="coreNode" onClick={() => onSelect(map)} initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ duration: 0.26, ease: 'easeOut' }}><span>{map.icon}</span><b>{map.title}</b><small>{map.subtitle || map.status}</small><i style={{ width: `${Math.max(0, Math.min(100, map.progress || 0))}%` }} /></motion.button>{children.map((node, index) => { const angle = -90 + (360 / Math.max(children.length, 1)) * index; const radius = children.length <= 4 ? 28 : 34; const x = 50 + Math.cos((angle * Math.PI) / 180) * radius; const y = 58 + Math.sin((angle * Math.PI) / 180) * radius; const nested = Boolean(node.children?.length || node.taskList?.length); const count = node.tasks || node.children?.length || node.taskList?.length || 0; return <motion.button key={node.id} className={`mapNode state-${node.state}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => nested ? onOpen(node.id) : onSelect(node)} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, scale: 0.78 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.24, delay: 0.08 + index * 0.045, ease: 'easeOut' }}><span className="nodeOrb"><em>{node.icon}</em>{nested ? <strong>{count}</strong> : null}</span><span className="nodeLabel"><b>{shortText(node.title, 20)}</b><small>{nested ? 'открыть ветку' : node.status}</small></span></motion.button>; })}</motion.section>;
}

function SideList({ map, routeDepth, snapshot, viewMode, setViewMode, onOpen, onSelect, onComplete, onRestore, busyTaskId }) {
  const items = listItems(map);
  const isBranch = routeDepth > 1;
  if (!isBranch && !items.length) return null;
  const hasPlanetChildren = hasBranch(map);
  const connected = snapshot.meta?.connected || {};
  const sourceLabel = snapshot.meta?.source?.includes('mock') ? 'mock' : snapshot.meta?.source === 'api-offline' ? 'api offline' : 'notion';
  const activeItems = items.filter((item) => !isDoneNode(item));
  const doneItems = items.filter((item) => isDoneNode(item));
  const visibleItems = viewMode === 'done' ? doneItems : activeItems;
  return <aside className="sideList" onClick={(event) => event.stopPropagation()}><div className="sideListHead"><div><small>{hasPlanetChildren ? 'Содержимое ветки' : viewMode === 'done' ? 'Выполненные задачи' : 'Задачи ветки'}</small><strong>{map.title}</strong></div><b>{visibleItems.length}</b></div><div className="sideTabs"><button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Активные <span>{activeItems.length}</span></button><button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Сделано <span>{doneItems.length}</span></button></div>{visibleItems.length ? <div className="sideItems">{visibleItems.map((item) => { const nested = Boolean(item.children?.length || item.taskList?.length); const patchable = canPatchTask(item); const done = isDoneNode(item); return <div className={`sideItemRow ${done ? 'doneRow' : ''}`} key={item.id}><button className="sideItemMain" onClick={() => nested && !isLeafNode(item) ? onOpen(item.id) : onSelect(item)}><span>{item.icon}</span><div><b>{item.title}</b><small>{isLeafNode(item) ? item.status || item.summary : `${item.tasks || 0} задач · открыть ветку`}</small></div></button>{patchable ? <button className={done ? 'restoreMini' : 'doneMini'} disabled={busyTaskId === item.sourceId} onClick={(event) => { event.stopPropagation(); done ? onRestore(item) : onComplete(item); }}>{busyTaskId === item.sourceId ? '…' : done ? 'Вернуть' : 'Done'}</button> : null}</div>; })}</div> : <div className="emptySide"><b>{viewMode === 'done' ? 'Выполненных задач нет' : 'Список пуст'}</b><p>{viewMode === 'done' ? 'Когда задачи будут помечены Done, они появятся здесь и их можно будет вернуть обратно.' : 'Backend подключён, но у этой ветки нет активных задач или они не совпали по Project/Goal.'}</p></div>}<div className="sideMeta"><span>source: {sourceLabel}</span><span>tasks: {connected.tasks ? 'live' : 'no'}</span><span>goals: {connected.goals ? 'live' : 'no'}</span></div></aside>;
}

function DetailCard({ node, onClose, onComplete, onRestore, busyTaskId }) {
  if (!node) return null;
  const patchable = canPatchTask(node);
  const done = isDoneNode(node);
  return <motion.aside className="detailCard" onClick={(event) => event.stopPropagation()} initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }}><button className="closeDetail" onClick={onClose}>×</button><div className="detailHead"><span>{node.icon}</span><div><small>{node.status || node.subtitle}</small><h2>{node.title}</h2></div><Ring value={node.progress} /></div><p>{node.summary || 'Описание пока не заполнено.'}</p>{patchable ? <div className="detailActions"><button className={done ? 'restoreButton' : 'doneButton'} disabled={busyTaskId === node.sourceId} onClick={() => done ? onRestore(node) : onComplete(node)}>{busyTaskId === node.sourceId ? 'Сохраняю…' : done ? 'Вернуть в работу' : 'Пометить выполненной'}</button></div> : null}{node.details?.length ? <div className="detailList">{node.details.slice(0, 4).map((item, index) => <div key={index}><b>{index + 1}.</b>{item}</div>)}</div> : null}</motion.aside>;
}

function UtilityPanel({ type, map, snapshot, errors, onClose }) {
  if (!type) return null;
  const items = [...topItems(map), ...listItems(map)];
  const connected = snapshot.meta?.connected || {};
  return <motion.aside className="utilityPanel" onClick={(event) => event.stopPropagation()} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}><button className="closeDetail" onClick={onClose}>×</button><h2>{type === 'steps' ? 'Следующие шаги' : type === 'errors' ? 'Ошибки навигатора' : 'Статистика'}</h2>{type === 'errors' ? <div className="panelList errorList">{errors.length ? errors.map((error, index) => <div key={index}><b>Ошибка {index + 1}</b><span>{error}</span></div>) : <div><b>Ошибок нет</b><span>Backend и frontend сейчас не сообщают о проблемах.</span></div>}</div> : type === 'steps' ? <div className="panelList">{items.slice(0, 7).map((node) => <div key={node.id}><b>{node.title}</b><span>{node.summary}</span></div>)}</div> : <div className="statGrid"><div><span>Планеты</span><b>{topItems(map).length}</b></div><div><span>Список</span><b>{listItems(map).length}</b></div><div><span>Notion</span><b>{connected.tasks ? 'live' : 'no data'}</b></div></div>}</motion.aside>;
}

function App() {
  const [snapshot, setSnapshot] = useState(() => emptySnapshot('loading'));
  const [apiState, setApiState] = useState('loading');
  const [route, setRoute] = useState(['root']);
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [toast, setToast] = useState('');
  const [errorLog, setErrorLog] = useState([]);
  const [viewMode, setViewMode] = useState('active');

  const loadSnapshot = useCallback(() => {
    setApiState((state) => state === 'api offline' ? 'loading' : state);
    return fetchSnapshot().then((data) => { setSnapshot(data); setApiState(data.meta?.source?.includes('mock') ? 'mock data' : 'connected'); return data; }).catch((error) => { setSnapshot(emptySnapshot('api-offline', error.message)); setApiState('api offline'); setErrorLog((items) => [`Snapshot: ${error.message}`, ...items].slice(0, 8)); throw error; });
  }, []);

  useEffect(() => { loadSnapshot().catch(() => {}); }, [loadSnapshot]);

  const rootMap = useMemo(() => buildActionMap(snapshot), [snapshot]);
  const currentId = route[route.length - 1];
  const currentMap = useMemo(() => findNode(rootMap, currentId), [rootMap, currentId]);
  const itemsOnSide = listItems(currentMap);
  const canBack = route.length > 1;
  const errors = useMemo(() => [...(snapshot.meta?.warnings || []), ...errorLog].filter(Boolean), [snapshot.meta?.warnings, errorLog]);

  useEffect(() => { setViewMode(currentId === 'sphere-done' ? 'done' : 'active'); }, [currentId]);

  const openNode = (id) => { setRoute((prev) => [...prev, id]); setSelected(null); setPanel(null); };
  const goBack = () => { setRoute((prev) => prev.length > 1 ? prev.slice(0, -1) : prev); setSelected(null); setPanel(null); };
  const goCenter = () => { setRoute(['root']); setSelected(null); setPanel(null); };

  const updateTask = async (node, payload, successText) => {
    if (!canPatchTask(node)) return;
    setBusyTaskId(node.sourceId);
    setToast('Сохраняю изменение в Notion…');
    try {
      await patchTask(node.sourceId, payload);
      await loadSnapshot();
      setSelected(null);
      setToast(successText);
      setTimeout(() => setToast(''), 2400);
    } catch (error) {
      const message = `Task update: ${error.message}`;
      setToast(`Не сохранилось: ${error.message}`);
      setErrorLog((items) => [message, ...items].slice(0, 8));
      setPanel('errors');
    } finally {
      setBusyTaskId(null);
    }
  };

  const completeTask = (node) => updateTask(node, { status: 'Done', progress: 100, nextAction: 'Done: выполнено через Life OS Map.' }, 'Готово: задача помечена Done в Notion.');
  const restoreTask = (node) => updateTask(node, { status: 'Next', progress: 0, nextAction: 'Returned from Done via Life OS Map.' }, 'Готово: задача возвращена в активный список.');

  return <main className={`app actionApp ${(canBack || itemsOnSide.length) ? 'hasSideList' : ''} ${canBack ? 'branchView' : ''}`} onClick={() => setPanel(null)}><Stars /><TopNav map={currentMap} canBack={canBack} onBack={goBack} onCenter={goCenter} apiState={dataState(snapshot, apiState)} errorCount={errors.length} onErrors={() => setPanel('errors')} /><MissionPanel map={currentMap} snapshot={snapshot} apiState={apiState} onSteps={() => setPanel('steps')} onStats={() => setPanel('stats')} /><AnimatePresence mode="wait"><OrbitMap key={currentMap.id} map={currentMap} hasSide={canBack || itemsOnSide.length > 0} onOpen={openNode} onSelect={(node) => { setSelected(node); setPanel(null); }} /></AnimatePresence><SideList map={currentMap} routeDepth={route.length} snapshot={snapshot} viewMode={viewMode} setViewMode={setViewMode} onOpen={openNode} onSelect={(node) => { setSelected(node); setPanel(null); }} onComplete={completeTask} onRestore={restoreTask} busyTaskId={busyTaskId} /><AnimatePresence>{selected ? <DetailCard key={selected.id} node={selected} onClose={() => setSelected(null)} onComplete={completeTask} onRestore={restoreTask} busyTaskId={busyTaskId} /> : null}{panel ? <UtilityPanel key={panel} type={panel} map={currentMap} snapshot={snapshot} errors={errors} onClose={() => setPanel(null)} /> : null}</AnimatePresence>{toast ? <div className="toast">{toast}</div> : null}</main>;
}

createRoot(document.getElementById('root')).render(<App />);
