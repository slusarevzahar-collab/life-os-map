import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './action-map.css';

import { fallbackSnapshot } from './lib/lifeOsData.js';
import { buildActionMap, findNode, isLeafNode, shortText } from './lib/actionMapModel.js';

function Stars() {
  const stars = useMemo(() => Array.from({ length: 88 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, size: 1 + ((i * 13) % 3), delay: `${(i % 7) * 0.32}s` })), []);
  return <div className="stars">{stars.map((star, index) => <i key={index} style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }} />)}</div>;
}

function Ring({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className="ring" style={{ '--pct': `${pct * 3.6}deg` }}><span>{pct}%</span></div>;
}

function hasBranch(node) {
  return Boolean((node?.children || []).some((item) => !isLeafNode(item)));
}

function topItems(node) {
  return (node.children || []).filter((item) => !isLeafNode(item));
}

function listItems(node) {
  const directLeaves = (node.children || []).filter((item) => isLeafNode(item));
  const taskList = node.taskList || [];
  const branchCards = topItems(node);
  const merged = [...taskList, ...directLeaves];
  const uniqLeaves = merged.filter((item, index, arr) => item?.id && arr.findIndex((next) => next.id === item.id) === index);
  if (uniqLeaves.length) return uniqLeaves;
  return branchCards;
}

function dataState(snapshot, apiState) {
  if (apiState === 'fallback') return 'frontend fallback';
  if (snapshot.meta?.source?.includes('mock')) return 'mock data';
  return apiState;
}

function TopNav({ map, canBack, onBack, onCenter, apiState }) {
  return <header className="topNav"><button className="backButton" onClick={onBack} disabled={!canBack}>← Назад</button><div className="topTitle"><span>Life OS Map · {apiState}</span><b>{map.title}</b></div><button className="centerButton" onClick={onCenter}>Центр</button></header>;
}

function MissionPanel({ map, snapshot, onSteps, onStats }) {
  const [open, setOpen] = useState(false);
  const isMock = snapshot.meta?.source?.includes('mock');
  const warnings = snapshot.meta?.warnings || [];

  if (!open) {
    return <section className="mission missionCollapsed"><button onClick={() => setOpen(true)}><span>{map.icon}</span><div><small>{isMock ? 'MOCK DATA' : 'MISSION CONTROL'}</small><b>{map.title}</b></div><Ring value={map.progress} /></button></section>;
  }

  return <section className="mission"><button className="collapseMission" onClick={() => setOpen(false)}>Свернуть</button><div className="missionTop"><div><small><em /> {isMock ? 'MOCK DATA · проверь backend/.env' : 'MISSION CONTROL'}</small><h1><span>{map.icon}</span>{map.title}</h1></div><Ring value={map.progress} /></div>{isMock ? <div className="warningLine">Сейчас карта получает mock-данные, поэтому выглядит пустой. Нужно, чтобы backend увидел NOTION_TOKEN и NOTION_TASKS_DB_ID.</div> : null}<div className="missionLine activeLine">Сейчас: {map.session?.current || map.summary}</div><div className="missionLine nextLine">Следующий шаг: {map.session?.next || 'Выбери планету, чтобы открыть следующий уровень.'}</div>{warnings.length ? <div className="warningLine">{warnings[0]}</div> : null}<div className="missionButtons"><button onClick={onSteps}>Следующие шаги</button><button onClick={onStats}>Статистика</button></div></section>;
}

function OrbitMap({ map, hasSide, onOpen, onSelect }) {
  const children = topItems(map);
  return <section className={`mapStage ${hasSide ? 'mapWithSide' : ''}`}><div className="mapGlow" /><div className="orbit orbit1" /><div className="orbit orbit2" /><div className="orbit orbit3" /><button className="coreNode" onClick={() => onSelect(map)}><span>{map.icon}</span><b>{map.title}</b><small>{map.subtitle || map.status}</small><i style={{ width: `${Math.max(0, Math.min(100, map.progress || 0))}%` }} /></button>{children.map((node, index) => { const angle = -90 + (360 / Math.max(children.length, 1)) * index; const radius = children.length <= 4 ? 28 : 34; const x = 50 + Math.cos((angle * Math.PI) / 180) * radius; const y = 58 + Math.sin((angle * Math.PI) / 180) * radius; const nested = Boolean(node.children?.length || node.taskList?.length); return <motion.button key={node.id} className={`mapNode state-${node.state}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => nested ? onOpen(node.id) : onSelect(node)} whileTap={{ scale: 0.97 }} animate={{ y: [-2, 2, -2] }} transition={{ duration: 6 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }}><span className="nodeOrb"><em>{node.icon}</em>{nested ? <strong>{node.tasks || node.children?.length || node.taskList?.length || 0}</strong> : null}</span><span className="nodeLabel"><b>{shortText(node.title, 20)}</b><small>{nested ? 'открыть ветку' : node.status}</small></span></motion.button>; })}<div className="mapHint">Клик по планете — открыть ветку · список выбранной ветки справа</div></section>;
}

function SideList({ map, routeDepth, snapshot, onOpen, onSelect }) {
  const items = listItems(map);
  const isBranch = routeDepth > 1;
  if (!isBranch && !items.length) return null;
  const hasPlanetChildren = hasBranch(map);
  const connected = snapshot.meta?.connected || {};
  const sourceLabel = snapshot.meta?.source?.includes('mock') ? 'mock' : 'notion';

  return <aside className="sideList"><div className="sideListHead"><div><small>{hasPlanetChildren ? 'Содержимое ветки' : 'Задачи ветки'}</small><strong>{map.title}</strong></div><b>{items.length}</b></div>{items.length ? <div className="sideItems">{items.map((item) => { const nested = Boolean(item.children?.length || item.taskList?.length); return <button key={item.id} onClick={() => nested && !isLeafNode(item) ? onOpen(item.id) : onSelect(item)}><span>{item.icon}</span><div><b>{shortText(item.title, 46)}</b><small>{isLeafNode(item) ? item.status || item.summary : `${item.tasks || 0} задач · открыть ветку`}</small></div></button>; })}</div> : <div className="emptySide"><b>Список пуст</b><p>Backend подключён, но у этой ветки нет связанных задач или они не совпали по Project/Goal. Проверь названия проекта в Notion.</p></div>}<div className="sideMeta"><span>source: {sourceLabel}</span><span>tasks: {connected.tasks ? 'live' : 'no'}</span><span>goals: {connected.goals ? 'live' : 'no'}</span></div></aside>;
}

function DetailCard({ node, onClose }) {
  if (!node) return null;
  return <motion.aside className="detailCard" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }}><button className="closeDetail" onClick={onClose}>×</button><div className="detailHead"><span>{node.icon}</span><div><small>{node.status || node.subtitle}</small><h2>{node.title}</h2></div><Ring value={node.progress} /></div><p>{node.summary || 'Описание пока не заполнено.'}</p>{node.details?.length ? <div className="detailList">{node.details.slice(0, 4).map((item, index) => <div key={index}><b>{index + 1}.</b>{item}</div>)}</div> : null}</motion.aside>;
}

function UtilityPanel({ type, map, snapshot, onClose }) {
  if (!type) return null;
  const items = [...topItems(map), ...listItems(map)];
  const connected = snapshot.meta?.connected || {};
  return <motion.aside className="utilityPanel" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}><button className="closeDetail" onClick={onClose}>×</button><h2>{type === 'steps' ? 'Следующие шаги' : 'Статистика'}</h2>{type === 'steps' ? <div className="panelList">{items.slice(0, 7).map((node) => <div key={node.id}><b>{node.title}</b><span>{node.summary}</span></div>)}</div> : <div className="statGrid"><div><span>Планеты</span><b>{topItems(map).length}</b></div><div><span>Список</span><b>{listItems(map).length}</b></div><div><span>Notion</span><b>{connected.tasks ? 'live' : 'mock'}</b></div></div>}</motion.aside>;
}

function App() {
  const [snapshot, setSnapshot] = useState(fallbackSnapshot);
  const [apiState, setApiState] = useState('loading');
  const [route, setRoute] = useState(['root']);
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null);

  useEffect(() => { let active = true; fetch('/api/life-os/snapshot').then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }).then((data) => { if (!active) return; setSnapshot(data); setApiState(data.meta?.source?.includes('mock') ? 'mock data' : 'connected'); }).catch(() => { if (!active) return; setApiState('fallback'); }); return () => { active = false; }; }, []);

  const rootMap = useMemo(() => buildActionMap(snapshot), [snapshot]);
  const currentId = route[route.length - 1];
  const currentMap = useMemo(() => findNode(rootMap, currentId), [rootMap, currentId]);
  const itemsOnSide = listItems(currentMap);
  const canBack = route.length > 1;
  const openNode = (id) => { setRoute((prev) => [...prev, id]); setSelected(null); setPanel(null); };
  const goBack = () => { setRoute((prev) => prev.length > 1 ? prev.slice(0, -1) : prev); setSelected(null); setPanel(null); };
  const goCenter = () => { setRoute(['root']); setSelected(null); setPanel(null); };

  return <main className={`app actionApp ${(canBack || itemsOnSide.length) ? 'hasSideList' : ''}`} onClick={() => setPanel(null)}><Stars /><TopNav map={currentMap} canBack={canBack} onBack={goBack} onCenter={goCenter} apiState={dataState(snapshot, apiState)} /><MissionPanel map={currentMap} snapshot={snapshot} onSteps={() => setPanel('steps')} onStats={() => setPanel('stats')} /><OrbitMap map={currentMap} hasSide={canBack || itemsOnSide.length > 0} onOpen={openNode} onSelect={(node) => { setSelected(node); setPanel(null); }} /><SideList map={currentMap} routeDepth={route.length} snapshot={snapshot} onOpen={openNode} onSelect={(node) => { setSelected(node); setPanel(null); }} /><AnimatePresence>{selected ? <DetailCard key={selected.id} node={selected} onClose={() => setSelected(null)} /> : null}{panel ? <UtilityPanel key={panel} type={panel} map={currentMap} snapshot={snapshot} onClose={() => setPanel(null)} /> : null}</AnimatePresence></main>;
}

createRoot(document.getElementById('root')).render(<App />);
