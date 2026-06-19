import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './action-map.css';
import './action-map-overrides.css';

import { buildActionMap, findNode, isDoneNode, isLeafNode, shortText } from './lib/actionMapModel.js';

const FOCUS_STORAGE_KEY = 'lifeMapFocusQueueV2';
const TITLE_ALIASES_KEY = 'lifeMapTitleAliasesV1';
const RENAMABLE_KINDS = new Set(['task', 'goal', 'project', 'lifeArea', 'signal', 'dream', 'sphere']);

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

function hasBranch(node) { return Boolean((node?.children || []).some((item) => !isLeafNode(item) && item.id !== 'sphere-done')); }
function topItems(node) { return (node.children || []).filter((item) => !isLeafNode(item) && item.id !== 'sphere-done'); }
function canPatchTask(node) { return node?.kind === 'task' && Boolean(node.sourceId); }
function canRenameNode(node) { return Boolean(node?.id && node.id !== 'root' && (node.sourceId || RENAMABLE_KINDS.has(node.kind) || node.id.startsWith('sphere-'))); }

function listItems(node) {
  const directLeaves = (node.children || []).filter((item) => isLeafNode(item));
  const taskList = node.taskList || [];
  const branchCards = topItems(node);
  const merged = [...taskList, ...directLeaves];
  const uniqLeaves = merged.filter((item, index, arr) => item?.id && arr.findIndex((next) => next.id === item.id) === index);
  if (uniqLeaves.length) return uniqLeaves;
  return branchCards;
}

function flattenNodes(node, seen = new Set()) {
  if (!node || seen.has(node.id)) return [];
  seen.add(node.id);
  return [node, ...(node.children || []).flatMap((child) => flattenNodes(child, seen)), ...(node.taskList || []).flatMap((child) => flattenNodes(child, seen))];
}

function uniqueBySource(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.sourceId || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyTitleAliases(node, aliases = {}) {
  if (!node) return node;
  const alias = aliases[node.id];
  const next = alias ? { ...node, title: alias } : { ...node };
  next.children = (node.children || []).map((child) => applyTitleAliases(child, aliases));
  next.taskList = (node.taskList || []).map((child) => applyTitleAliases(child, aliases));
  return next;
}

function focusCandidateFromNode(node) {
  if (!node) return null;
  if (isLeafNode(node)) return node;
  const leaves = listItems(node).filter((item) => isLeafNode(item) && !isDoneNode(item));
  return leaves[0] || listItems(node)[0] || node;
}

function toFocusItem(node) {
  if (!node) return null;
  return {
    id: node.id,
    sourceId: node.sourceId || null,
    title: node.title || 'Фокус',
    project: node.raw?.project || node.subtitle || node.status || '',
    status: node.status || '',
    progress: Number(node.progress) || 0,
    nextAction: node.summary || node.raw?.nextAction || 'Следующий шаг не указан.',
    kind: node.kind || 'node',
  };
}

function dedupeFocusItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.sourceId || item?.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveFocus(rootMap, snapshot, focusQueue = []) {
  const nodes = flattenNodes(rootMap);
  for (const queued of focusQueue) {
    const match = nodes.find((node) => !isDoneNode(node) && ((queued.sourceId && node.sourceId === queued.sourceId) || node.id === queued.id));
    if (match) return toFocusItem(match);
    if (queued?.title) return queued;
  }
  const workingLifeMapFocus = nodes.find((node) => {
    if (isDoneNode(node)) return false;
    const text = `${node.title} ${node.summary} ${node.raw?.project || ''} ${node.raw?.goalName || ''}`.toLowerCase();
    return text.includes('собрать рабочую life os map') || text.includes('life os map + ai inbox mvp') || text.includes('создать рабочую liveos map');
  });
  if (workingLifeMapFocus) return toFocusItem(workingLifeMapFocus);
  const lifeOsTask = nodes.find((node) => {
    if (node.kind !== 'task' || isDoneNode(node)) return false;
    const text = `${node.title} ${node.summary} ${node.raw?.project || ''} ${node.raw?.goalName || ''}`.toLowerCase();
    return text.includes('life os') || text.includes('live os') || text.includes('навигатор') || text.includes('life os map') || text.includes('notion data adapter');
  });
  if (lifeOsTask) return toFocusItem(lifeOsTask);
  return {
    id: snapshot.currentFocus?.id || 'snapshot-focus',
    sourceId: snapshot.currentFocus?.id || null,
    title: snapshot.currentFocus?.title || 'Фокус не выбран',
    project: snapshot.currentFocus?.project || '',
    status: snapshot.currentFocus?.status || '',
    progress: Number(snapshot.currentFocus?.progress) || 0,
    nextAction: snapshot.currentFocus?.nextAction || 'Следующий шаг не указан.',
    kind: 'snapshotFocus',
  };
}

function buildFocusSequence(rootMap, activeFocus, focusQueue = []) {
  const nodes = flattenNodes(rootMap);
  const queued = focusQueue.map((queuedItem) => {
    const match = nodes.find((node) => !isDoneNode(node) && ((queuedItem.sourceId && node.sourceId === queuedItem.sourceId) || node.id === queuedItem.id));
    return match ? toFocusItem(match) : queuedItem;
  });
  const focusText = `${activeFocus?.title || ''} ${activeFocus?.project || ''}`.toLowerCase();
  const projectNeedles = ['life os', 'live os', 'life os map', 'liveos map', 'навигатор', 'notion', 'canvas', 'map'];
  const relatedTasks = nodes
    .filter((node) => node.kind === 'task' && !isDoneNode(node))
    .filter((node) => {
      const text = `${node.title} ${node.summary} ${node.raw?.project || ''} ${node.raw?.goalName || ''}`.toLowerCase();
      if (activeFocus?.sourceId && node.sourceId === activeFocus.sourceId) return true;
      if (activeFocus?.id && node.id === activeFocus.id) return true;
      if (focusText.includes('sleda') || focusText.includes('след')) return text.includes('sleda') || text.includes('след');
      if (focusText.includes('inbox')) return text.includes('inbox') || text.includes('telegram') || text.includes('бот');
      return projectNeedles.some((needle) => text.includes(needle));
    })
    .map(toFocusItem);
  return dedupeFocusItems([activeFocus, ...queued, ...relatedTasks].filter(Boolean)).slice(0, 16);
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

async function patchItemTitle(node, title) {
  const errors = [];
  for (const url of apiCandidates(`/api/life-os/items/${node.sourceId}/title`)) {
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ kind: node.kind, title }),
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

function TopNav({ canBack, onBack, onCenter, apiState, errorCount, onErrors }) {
  return <header className="topNav" onClick={(event) => event.stopPropagation()}><button className="backButton" onClick={onBack} disabled={!canBack}>← Назад</button><div className="topTitle"><span className="brand"><b>Live</b><strong>Map</strong></span><em>· {apiState}</em></div><div className="topActions"><button className="centerButton" onClick={onCenter}>Главная</button>{errorCount ? <button className="errorButton hasErrors" onClick={onErrors}>Ошибки {errorCount}</button> : null}</div></header>;
}

function MissionPanel({ focus, focusQueueItems, snapshot, apiState, onDone }) {
  const [open, setOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const isMock = snapshot.meta?.source?.includes('mock');
  const isOffline = apiState === 'api offline' || snapshot.meta?.source === 'api-offline';
  const isLoading = apiState === 'loading' || snapshot.meta?.source === 'loading';
  const currentTitle = focus?.title || 'Фокус не выбран';
  const nextItem = focusQueueItems?.[1];
  const nextAction = nextItem?.title || focus?.nextAction || 'Следующий шаг не указан.';
  const progress = Number(focus?.progress || 0);
  if (!open) {
    const label = isOffline ? 'API OFFLINE' : isMock ? 'MOCK DATA' : isLoading ? 'LOADING' : 'ФОКУС СЕЙЧАС';
    return <section className="mission missionCollapsed" onClick={(event) => event.stopPropagation()}><button onClick={() => setOpen(true)}><span>FO</span><div><small>{label}</small><b>{currentTitle}</b></div><Ring value={progress} /></button></section>;
  }
  return <section className="mission" onClick={(event) => event.stopPropagation()}><button className="collapseMission" onClick={() => setOpen(false)}>Свернуть</button><div className="missionTop"><div><small><em /> {isOffline ? 'API OFFLINE · нет данных для карты' : isMock ? 'MOCK DATA · проверь backend/.env' : isLoading ? 'LOADING · жду backend' : 'MISSION CONTROL'}</small><h1><span>FO</span>Текущий фокус</h1></div><Ring value={progress} /></div>{isOffline ? <div className="warningLine">Карта специально не показывает запасные данные: backend API недоступен. Запусти npm run api и обнови страницу.</div> : null}{isMock ? <div className="warningLine">Сейчас карта получает mock-данные. Нужно, чтобы backend видел NOTION_TOKEN и NOTION_TASKS_DB_ID.</div> : null}<div className="missionLine activeLine">Сейчас: {currentTitle}</div><div className="missionLine nextLine">Далее: {nextAction}</div><div className="focusControls"><button className="queueToggle" onClick={() => setQueueOpen((value) => !value)}>{queueOpen ? 'Скрыть очередь' : `Очередь ${Math.max((focusQueueItems?.length || 1) - 1, 0)}`} <span>{queueOpen ? '↑' : '↓'}</span></button><button className="doneArchiveButton" onClick={onDone}>Выполнено</button></div>{queueOpen ? <div className="focusQueueList">{focusQueueItems?.slice(0, 10).map((item, index) => <div key={`${item.sourceId || item.id}-${index}`} className={index === 0 ? 'current' : ''}><b>{index === 0 ? 'Сейчас' : index}</b><span>{item.title}</span></div>)}</div> : null}</section>;
}

function planetSize(title = '') {
  const len = String(title).length;
  if (len > 44) return 184;
  if (len > 34) return 170;
  if (len > 24) return 150;
  if (len > 14) return 126;
  return 104;
}

function planetFontSize(title = '') {
  const len = String(title).length;
  if (len > 44) return 11;
  if (len > 32) return 12;
  if (len > 20) return 13;
  return 15;
}

function OrbitMap({ map, hasSide, onOpen, onSelect, onOpenMenu }) {
  const children = topItems(map);
  const isRoot = map.id === 'root';
  const pressTimer = useRef(null);
  const clearPress = () => { if (pressTimer.current) window.clearTimeout(pressTimer.current); pressTimer.current = null; };
  const startPress = (node, event) => {
    if (event.pointerType === 'mouse') return;
    const point = { clientX: event.clientX, clientY: event.clientY };
    pressTimer.current = window.setTimeout(() => onOpenMenu(node, point), 560);
  };
  const orbitShift = children.length <= 2 ? 'clamp(-215px, -20vw, -170px)' : 'clamp(-220px, -21vw, -190px)';
  return <motion.section key={map.id} className={`mapStage ${hasSide ? 'mapWithSide' : ''}`} variants={mapVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}><div className="mapGlow" /><div className="orbit orbit1" /><div className="orbit orbit2" /><div className="orbit orbit3" /><motion.button className={`coreNode ${isRoot ? 'rootCore' : ''}`} onClick={(event) => event.preventDefault()} initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ duration: 0.26, ease: 'easeOut' }}>{isRoot ? <b>Life Map</b> : <><span>{map.icon}</span><b>{map.title}</b><small>{map.subtitle || map.status}</small></>}</motion.button>{children.map((node, index) => { const angle = (360 / Math.max(children.length, 1)) * index; const nested = Boolean((node.children || []).length || (node.taskList || []).length); const count = node.tasks || node.children?.length || node.taskList?.length || 0; const size = planetSize(node.title); const fontSize = planetFontSize(node.title); return <button key={node.id} className={`mapNode orbitNode state-${node.state}`} style={{ '--angle': `${angle}deg`, '--angle-back': `${-angle}deg`, '--orbit-shift': orbitShift, '--node-size': `${size}px`, '--node-font': `${fontSize}px` }} title={node.title} onContextMenu={(event) => onOpenMenu(node, event)} onPointerDown={(event) => startPress(node, event)} onPointerUp={clearPress} onPointerLeave={clearPress} onClick={() => nested ? onOpen(node.id) : onSelect(node)}><span className="nodeOrb"><em>{node.title}</em>{nested ? <strong>{count}</strong> : null}</span></button>; })}</motion.section>;
}

function SideList({ map, snapshot, viewMode, setViewMode, onOpen, onComplete, onRestore, onReorderList, onOpenMenu, busyTaskId }) {
  const items = listItems(map);
  const hasPlanetChildren = hasBranch(map);
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  if (hasPlanetChildren || !items.length) return null;
  const activeItems = items.filter((item) => !isDoneNode(item));
  const doneItems = items.filter((item) => isDoneNode(item));
  const visibleItems = viewMode === 'done' ? doneItems : activeItems;
  const reorderableItems = visibleItems.filter((item) => canPatchTask(item) && !isDoneNode(item));
  const updateDropTarget = (event, item) => {
    if (!dragId || !canPatchTask(item) || isDoneNode(item) || item.id === dragId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ id: item.id, position });
  };
  const dropTask = (targetItem) => {
    if (!dragId || !targetItem?.id || dragId === targetItem.id || !dropTarget) { setDragId(null); setDropTarget(null); return; }
    const from = reorderableItems.findIndex((item) => item.id === dragId);
    if (from < 0) { setDragId(null); setDropTarget(null); return; }
    const reordered = [...reorderableItems];
    const [moved] = reordered.splice(from, 1);
    let insertAt = reordered.findIndex((item) => item.id === targetItem.id);
    if (insertAt < 0) insertAt = reordered.length;
    if (dropTarget.position === 'after') insertAt += 1;
    reordered.splice(insertAt, 0, moved);
    setDragId(null); setDropTarget(null);
    onReorderList(reordered);
  };
  return <aside className="sideList" onClick={(event) => event.stopPropagation()}><div className="sideListHead"><div><small>{viewMode === 'done' ? 'Выполненные задачи' : 'Задачи ветки'}</small><strong>{map.title}</strong></div><b>{visibleItems.length}</b></div><div className="sideTabs"><button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Активные <span>{activeItems.length}</span></button><button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Сделано <span>{doneItems.length}</span></button></div>{visibleItems.length ? <div className="sideItems">{visibleItems.map((item) => { const nested = Boolean((item.children || []).length || (item.taskList || []).length); const patchable = canPatchTask(item); const done = isDoneNode(item); const dropClass = dropTarget?.id === item.id ? `drop-${dropTarget.position}` : ''; const expanded = expandedId === item.id; return <div className={`sideItemRow ${done ? 'doneRow' : ''} ${expanded ? 'expandedRow' : ''} ${dropClass}`} key={item.id} onDragOver={(event) => updateDropTarget(event, item)} onDrop={(event) => { event.preventDefault(); dropTask(item); }} onContextMenu={(event) => onOpenMenu(item, event)}><button className="sideItemMain" onClick={() => nested && !isLeafNode(item) ? onOpen(item.id) : setExpandedId((current) => current === item.id ? null : item.id)}><span>{item.icon}</span><div><b>{item.title}</b><small>{isLeafNode(item) ? item.status || item.summary : `${item.tasks || 0} задач · открыть ветку`}</small></div></button><div className="rowActions">{isLeafNode(item) ? <button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((current) => current === item.id ? null : item.id); }}>{expanded ? '⌃' : '⌄'}</button> : null}{patchable && !done ? <button className="dragHandle" title="Перетащить задачу" draggable disabled={busyTaskId === item.sourceId} onDragStart={(event) => { setDragId(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }} onDragEnd={() => { setDragId(null); setDropTarget(null); }}>⋮⋮</button> : null}{patchable ? <button className={done ? 'restoreMini' : 'doneMini'} disabled={busyTaskId === item.sourceId} onClick={(event) => { event.stopPropagation(); done ? onRestore(item) : onComplete(item); }}>{busyTaskId === item.sourceId ? '…' : done ? 'Вернуть' : 'Done'}</button> : null}</div>{expanded ? <div className="inlineTaskDetails"><p>{item.summary || 'Заметок по задаче пока нет.'}</p>{item.details?.length ? <div>{item.details.slice(0, 4).map((detail, index) => <span key={index}>{detail}</span>)}</div> : null}</div> : null}</div>; })}</div> : <div className="emptySide"><b>{viewMode === 'done' ? 'Выполненных задач нет' : 'Список пуст'}</b><p>{viewMode === 'done' ? 'Когда задачи будут помечены Done, они появятся здесь и их можно будет вернуть обратно.' : 'Backend подключён, но у этой ветки нет активных задач или они не совпали по Project/Goal.'}</p></div>}</aside>;
}

function DetailCard({ node, onClose, onComplete, onRestore, onOpenMenu, busyTaskId }) {
  if (!node) return null;
  const patchable = canPatchTask(node);
  const done = isDoneNode(node);
  return <motion.aside className="detailCard compactDetail" onContextMenu={(event) => onOpenMenu(node, event)} onClick={(event) => event.stopPropagation()} initial={{ y: 18, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 18, opacity: 0, scale: .98 }}><button className="closeDetail" onClick={onClose}>×</button><div className="detailHead"><span>{node.icon}</span><div><small>{node.status || node.subtitle}</small><h2>{node.title}</h2></div><Ring value={node.progress} /></div><p>{node.summary || 'Описание пока не заполнено.'}</p>{patchable ? <div className="detailActions"><button className={done ? 'restoreButton' : 'doneButton'} disabled={busyTaskId === node.sourceId} onClick={() => done ? onRestore(node) : onComplete(node)}>{busyTaskId === node.sourceId ? 'Сохраняю…' : done ? 'Вернуть в работу' : 'Пометить выполненной'}</button></div> : null}{node.details?.length ? <div className="detailList compactDetailList">{node.details.slice(0, 4).map((item, index) => <div key={index}><b>{index + 1}.</b>{item}</div>)}</div> : null}</motion.aside>;
}

function UtilityPanel({ type, rootMap, errors, onClose, onRestore, busyTaskId }) {
  if (!type) return null;
  const doneItems = uniqueBySource(flattenNodes(rootMap).filter((node) => node.kind === 'task' && isDoneNode(node)));
  return <motion.aside className="utilityPanel" onClick={(event) => event.stopPropagation()} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}><button className="closeDetail" onClick={onClose}>×</button><h2>{type === 'errors' ? 'Ошибки навигатора' : 'Выполненные задачи'}</h2>{type === 'errors' ? <div className="panelList errorList">{errors.length ? errors.map((error, index) => <div key={index}><b>Ошибка {index + 1}</b><span>{error}</span></div>) : <div><b>Ошибок нет</b><span>Backend и frontend сейчас не сообщают о проблемах.</span></div>}</div> : <div className="panelList donePanelList">{doneItems.length ? doneItems.map((node) => <div className="donePanelRow" key={node.id}><div><b>{node.title}</b><span>{node.raw?.project || node.status || 'Done'}</span></div><button className="restoreMini" disabled={busyTaskId === node.sourceId} onClick={() => onRestore(node)}>{busyTaskId === node.sourceId ? '…' : 'Вернуть'}</button></div>) : <div><b>Выполненных задач нет</b><span>Когда задача будет закрыта, она появится здесь.</span></div>}</div>}</motion.aside>;
}

function ContextMenu({ menu, onClose, onFocusNow, onFocusNext, onRename }) {
  if (!menu) return null;
  const renamable = canRenameNode(menu.node);
  return <div className="contextMenu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}><b>{shortText(menu.node.title, 44)}</b>{renamable ? <button onClick={() => onRename(menu.node)}>Переименовать</button> : null}<button onClick={() => onFocusNow(menu.node)}>Сделать текущим фокусом</button><button onClick={() => onFocusNext(menu.node)}>Поставить следующим</button><button onClick={onClose}>Закрыть</button></div>;
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
  const [contextMenu, setContextMenu] = useState(null);
  const [focusQueue, setFocusQueue] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(FOCUS_STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [titleAliases, setTitleAliases] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(TITLE_ALIASES_KEY) || '{}'); } catch { return {}; }
  });

  const loadSnapshot = useCallback(() => {
    setApiState((state) => state === 'api offline' ? 'loading' : state);
    return fetchSnapshot().then((data) => { setSnapshot(data); setApiState(data.meta?.source?.includes('mock') ? 'mock data' : 'connected'); return data; }).catch((error) => { setSnapshot(emptySnapshot('api-offline', error.message)); setApiState('api offline'); setErrorLog((items) => [`Snapshot: ${error.message}`, ...items].slice(0, 8)); throw error; });
  }, []);

  useEffect(() => { loadSnapshot().catch(() => {}); }, [loadSnapshot]);
  useEffect(() => { try { window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusQueue.slice(0, 12))); } catch {} }, [focusQueue]);
  useEffect(() => { try { window.localStorage.setItem(TITLE_ALIASES_KEY, JSON.stringify(titleAliases)); } catch {} }, [titleAliases]);

  const baseRootMap = useMemo(() => buildActionMap(snapshot), [snapshot]);
  const rootMap = useMemo(() => applyTitleAliases(baseRootMap, titleAliases), [baseRootMap, titleAliases]);
  const activeFocus = useMemo(() => resolveFocus(rootMap, snapshot, focusQueue), [rootMap, snapshot, focusQueue]);
  const focusQueueItems = useMemo(() => buildFocusSequence(rootMap, activeFocus, focusQueue), [rootMap, activeFocus, focusQueue]);
  const currentId = route[route.length - 1];
  const currentMap = useMemo(() => findNode(rootMap, currentId), [rootMap, currentId]);
  const itemsOnSide = listItems(currentMap);
  const canBack = route.length > 1;
  const currentHasBranch = hasBranch(currentMap);
  const showSideList = canBack && !currentHasBranch && itemsOnSide.length > 0;
  const errors = useMemo(() => [...(snapshot.meta?.warnings || []), ...errorLog].filter(Boolean), [snapshot.meta?.warnings, errorLog]);

  useEffect(() => { setViewMode(currentId === 'sphere-done' ? 'done' : 'active'); }, [currentId]);

  const openNode = (id) => { setRoute((prev) => [...prev, id]); setSelected(null); setPanel(null); setContextMenu(null); };
  const goBack = () => { setRoute((prev) => prev.length > 1 ? prev.slice(0, -1) : prev); setSelected(null); setPanel(null); setContextMenu(null); };
  const goCenter = () => { setRoute(['root']); setSelected(null); setPanel(null); setContextMenu(null); };
  const openMenu = (node, eventOrPoint) => {
    eventOrPoint?.preventDefault?.(); eventOrPoint?.stopPropagation?.();
    const x = Math.min(eventOrPoint?.clientX ?? window.innerWidth / 2, window.innerWidth - 230);
    const y = Math.min(eventOrPoint?.clientY ?? window.innerHeight / 2, window.innerHeight - 180);
    setContextMenu({ node, x: Math.max(12, x), y: Math.max(12, y) });
  };

  const updateTask = async (node, payload, successText) => {
    if (!canPatchTask(node)) return;
    setBusyTaskId(node.sourceId);
    setToast('Сохраняю изменение в Notion…');
    try {
      await patchTask(node.sourceId, payload);
      setFocusQueue((queue) => queue.map((item) => item.sourceId === node.sourceId ? { ...item, status: payload.status || item.status, progress: payload.progress ?? item.progress, nextAction: payload.nextAction || item.nextAction, title: payload.title || item.title } : item));
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

  const renameNode = async (node) => {
    if (!canRenameNode(node)) return;
    const nextTitle = window.prompt('Новое название', node.title || '');
    const title = String(nextTitle || '').trim();
    if (!title || title === node.title) { setContextMenu(null); return; }
    setContextMenu(null);
    if (!node.sourceId) {
      setTitleAliases((aliases) => ({ ...aliases, [node.id]: title }));
      setToast('Название раздела обновлено локально.');
      setTimeout(() => setToast(''), 2400);
      return;
    }
    setBusyTaskId(node.sourceId);
    setToast('Переименовываю в Notion…');
    try {
      await patchItemTitle(node, title);
      setFocusQueue((queue) => queue.map((item) => item.sourceId === node.sourceId ? { ...item, title } : item));
      await loadSnapshot();
      setSelected(null);
      setToast('Название обновлено в Notion.');
      setTimeout(() => setToast(''), 2400);
    } catch (error) {
      const message = `Rename: ${error.message}`;
      setToast(`Не переименовалось: ${error.message}`);
      setErrorLog((items) => [message, ...items].slice(0, 8));
      setPanel('errors');
    } finally {
      setBusyTaskId(null);
    }
  };

  const completeTask = (node) => updateTask(node, { status: 'Done', progress: 100, nextAction: 'Done: выполнено через Life OS Map.' }, 'Готово: задача помечена Done в Notion.');
  const restoreTask = (node) => updateTask(node, { status: 'Next', progress: 0, nextAction: 'Returned from Done via Life OS Map.' }, 'Готово: задача возвращена в активный список.');

  const reorderList = async (orderedItems) => {
    const patchableItems = orderedItems.filter((item) => canPatchTask(item) && !isDoneNode(item));
    if (!patchableItems.length) return;
    setBusyTaskId(patchableItems[0].sourceId);
    setToast('Сохраняю новый порядок задач в Notion…');
    try {
      await Promise.all(patchableItems.map((item, orderIndex) => patchTask(item.sourceId, { priority: (orderIndex + 1) * 10 })));
      await loadSnapshot();
      setToast('Порядок задач обновлён.');
      setTimeout(() => setToast(''), 2200);
    } catch (error) {
      const message = `Task reorder: ${error.message}`;
      setToast(`Порядок не сохранился: ${error.message}`);
      setErrorLog((items) => [message, ...items].slice(0, 8));
      setPanel('errors');
    } finally {
      setBusyTaskId(null);
    }
  };

  const setFocusNow = (node) => {
    const target = focusCandidateFromNode(node);
    const item = toFocusItem(target);
    if (!item) return;
    setFocusQueue((queue) => [item, ...queue.filter((next) => (item.sourceId && next.sourceId !== item.sourceId) || (!item.sourceId && next.id !== item.id))].slice(0, 12));
    setContextMenu(null);
    if (canPatchTask(target)) updateTask(target, { status: 'Now', nextAction: target.summary || target.raw?.nextAction || '' }, 'Текущий фокус обновлён.');
    else { setToast('Текущий фокус обновлён локально.'); setTimeout(() => setToast(''), 2000); }
  };

  const setFocusNext = (node) => {
    const target = focusCandidateFromNode(node);
    const item = toFocusItem(target);
    if (!item) return;
    setFocusQueue((queue) => {
      const clean = queue.filter((next) => (item.sourceId && next.sourceId !== item.sourceId) || (!item.sourceId && next.id !== item.id));
      return clean.length ? [clean[0], item, ...clean.slice(1)].slice(0, 12) : [item];
    });
    setContextMenu(null);
    if (canPatchTask(target)) updateTask(target, { status: 'Next', nextAction: target.summary || target.raw?.nextAction || '' }, 'Задача поставлена следующей.');
    else { setToast('Задача поставлена следующей локально.'); setTimeout(() => setToast(''), 2000); }
  };

  return <main className={`app actionApp ${showSideList ? 'hasSideList branchView' : ''}`} onClick={() => { setPanel(null); setContextMenu(null); }}><Stars /><TopNav canBack={canBack} onBack={goBack} onCenter={goCenter} apiState={dataState(snapshot, apiState)} errorCount={errors.length} onErrors={() => setPanel('errors')} /><MissionPanel focus={activeFocus} focusQueueItems={focusQueueItems} snapshot={snapshot} apiState={apiState} onDone={() => setPanel('done')} /><AnimatePresence mode="wait"><OrbitMap key={currentMap.id} map={currentMap} hasSide={showSideList} onOpen={openNode} onSelect={(node) => { setSelected(node); setPanel(null); setContextMenu(null); }} onOpenMenu={openMenu} /></AnimatePresence>{showSideList ? <SideList map={currentMap} snapshot={snapshot} viewMode={viewMode} setViewMode={setViewMode} onOpen={openNode} onComplete={completeTask} onRestore={restoreTask} onReorderList={reorderList} onOpenMenu={openMenu} busyTaskId={busyTaskId} /> : null}<AnimatePresence>{selected ? <DetailCard key={selected.id} node={selected} onClose={() => setSelected(null)} onComplete={completeTask} onRestore={restoreTask} onOpenMenu={openMenu} busyTaskId={busyTaskId} /> : null}{panel ? <UtilityPanel key={panel} type={panel} rootMap={rootMap} errors={errors} onClose={() => setPanel(null)} onRestore={restoreTask} busyTaskId={busyTaskId} /> : null}</AnimatePresence><ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onFocusNow={setFocusNow} onFocusNext={setFocusNext} onRename={renameNode} />{toast ? <div className="toast">{toast}</div> : null}</main>;
}

createRoot(document.getElementById('root')).render(<App />);
