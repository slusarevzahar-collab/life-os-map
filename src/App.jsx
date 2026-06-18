import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

import { fallbackSnapshot } from './lib/lifeOsData.js';
import { buildActionMap, findNode, getChildMap, shortText } from './lib/actionMapModel.js';

function Stars() {
  const stars = useMemo(
    () => Array.from({ length: 82 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      top: `${(i * 61) % 100}%`,
      size: 1 + ((i * 13) % 3),
      delay: `${(i % 7) * 0.32}s`,
    })),
    [],
  );

  return <div className="stars">{stars.map((star, index) => <i key={index} style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }} />)}</div>;
}

function ProgressRing({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="ring" style={{ '--pct': `${pct * 3.6}deg` }}>
      <span>{pct}%</span>
    </div>
  );
}

function MissionPanel({ map, apiState, canBack, onBack, onCenter, onOpenPanel }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <section className="mission collapsedMission">
        <button className="missionMini" onClick={() => setOpen(true)}>
          <span>{map.icon}</span>
          <b>{map.title}</b>
          <small>{map.progress}%</small>
        </button>
      </section>
    );
  }

  return (
    <section className="mission">
      <div className="missionTop">
        <div>
          <small><em /> MISSION CONTROL · {apiState}</small>
          <h1><span>{map.icon}</span>{map.title}</h1>
        </div>
        <div className="missionActions">
          {canBack ? <button onClick={onBack}>Назад</button> : null}
          <button onClick={onCenter}>Центр</button>
          <button onClick={() => setOpen(false)}>Свернуть</button>
        </div>
      </div>

      <div className="missionLine activeLine">Сейчас: {map.session?.current || map.title}</div>
      <div className="missionLine nextLine">Следующий шаг: {map.session?.next || map.summary}</div>

      <div className="missionProgress">
        <span>Прогресс текущего фокуса</span>
        <b>{map.progress}%</b>
        <div><i style={{ width: `${Math.max(0, Math.min(100, map.progress || 0))}%` }} /></div>
      </div>

      <div className="missionButtons">
        <button onClick={() => onOpenPanel('focus')}>Сменить фокус</button>
        <button onClick={() => onOpenPanel('steps')}>Следующие шаги</button>
        <button onClick={() => onOpenPanel('stats')}>Статистика</button>
      </div>
    </section>
  );
}

function OrbitMap({ map, selectedId, onSelect, onOpenBranch }) {
  const children = map.children || [];

  return (
    <section className="mapStage">
      <div className="mapGlow" />
      <div className="orbit orbit1" />
      <div className="orbit orbit2" />
      <div className="orbit orbit3" />

      {children.map((node, index) => {
        const angle = -90 + (360 / Math.max(children.length, 1)) * index;
        const radius = children.length <= 4 ? 28 : 34;
        const x = 50 + Math.cos((angle * Math.PI) / 180) * radius;
        const y = 50 + Math.sin((angle * Math.PI) / 180) * radius;
        return <div key={`line-${node.id}`} className="nodeLine" style={{ '--x': `${x}%`, '--y': `${y}%` }} />;
      })}

      <button className="coreNode" onClick={() => onSelect(map)}>
        <span>{map.icon}</span>
        <b>{map.title}</b>
        <small>{map.subtitle || map.status}</small>
        <i style={{ width: `${Math.max(0, Math.min(100, map.progress || 0))}%` }} />
      </button>

      {children.map((node, index) => {
        const angle = -90 + (360 / Math.max(children.length, 1)) * index;
        const radius = children.length <= 4 ? 28 : 34;
        const x = 50 + Math.cos((angle * Math.PI) / 180) * radius;
        const y = 50 + Math.sin((angle * Math.PI) / 180) * radius;
        const hasChildren = Boolean(node.children?.length);

        return (
          <motion.button
            key={node.id}
            className={`mapNode state-${node.state} ${selectedId === node.id ? 'selected' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onSelect(node)}
            onDoubleClick={() => hasChildren && onOpenBranch(node.id)}
            whileTap={{ scale: 0.96 }}
            animate={{ y: [-2, 2, -2] }}
            transition={{ duration: 6 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span className="nodeOrb"><em>{node.icon}</em>{hasChildren ? <strong>{node.children.length}</strong> : null}</span>
            <span className="nodeLabel"><b>{shortText(node.title, 20)}</b><small>{node.status || node.tasks + ' задач'}</small></span>
          </motion.button>
        );
      })}

      <div className="mapHint">Тап по планете — выбрать · двойной тап — открыть ветку · Центр — вернуться домой</div>
    </section>
  );
}

function DetailCard({ node, isRoot, onClose, onOpenBranch }) {
  if (!node) return null;
  const canOpen = !isRoot && node.children?.length;

  return (
    <motion.aside className="detailCard" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }}>
      <button className="closeDetail" onClick={onClose}>×</button>
      <div className="detailHead">
        <span>{node.icon}</span>
        <div>
          <small>{node.status || node.subtitle}</small>
          <h2>{node.title}</h2>
        </div>
        <ProgressRing value={node.progress} />
      </div>
      <p>{node.summary || node.session?.recommendation || 'Описание пока не заполнено.'}</p>
      {node.details?.length ? (
        <div className="detailList">
          {node.details.slice(0, 4).map((item, index) => <div key={index}><b>{index + 1}.</b>{item}</div>)}
        </div>
      ) : null}
      <div className="detailActions">
        {canOpen ? <button onClick={() => onOpenBranch(node.id)}>Открыть ветку</button> : null}
        <button>Сделать следующим</button>
      </div>
    </motion.aside>
  );
}

function UtilityPanel({ type, map, onClose }) {
  if (!type) return null;
  const children = map.children || [];
  const title = type === 'focus' ? 'Смена фокуса' : type === 'steps' ? 'Следующие шаги' : 'Статистика';

  return (
    <motion.aside className="utilityPanel" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}>
      <button className="closeDetail" onClick={onClose}>×</button>
      <h2>{title}</h2>
      {type === 'focus' ? <p>Выбери ветку на карте. После выбора снизу появится карточка, а кнопка “Открыть ветку” покажет только её внутренние задачи.</p> : null}
      {type === 'steps' ? <div className="panelList">{children.slice(0, 6).map((node) => <div key={node.id}><b>{node.title}</b><span>{node.summary}</span></div>)}</div> : null}
      {type === 'stats' ? <div className="statGrid"><div><span>Веток</span><b>{children.length}</b></div><div><span>Задач</span><b>{map.tasks || 0}</b></div><div><span>Прогресс</span><b>{map.progress || 0}%</b></div></div> : null}
    </motion.aside>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(fallbackSnapshot);
  const [apiState, setApiState] = useState('loading');
  const [routeId, setRouteId] = useState('root');
  const [selectedId, setSelectedId] = useState(null);
  const [panel, setPanel] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/life-os/snapshot')
      .then((response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setSnapshot(data);
        setApiState('connected');
      })
      .catch(() => {
        if (!active) return;
        setApiState('fallback');
      });
    return () => { active = false; };
  }, []);

  const rootMap = useMemo(() => buildActionMap(snapshot), [snapshot]);
  const currentMap = useMemo(() => getChildMap(rootMap, routeId), [rootMap, routeId]);
  const selectedNode = useMemo(() => selectedId ? findNode(rootMap, selectedId) : null, [rootMap, selectedId]);
  const canBack = routeId !== 'root';

  const openBranch = (id) => {
    setRouteId(id);
    setSelectedId(null);
    setPanel(null);
  };

  const goCenter = () => {
    setRouteId('root');
    setSelectedId(null);
    setPanel(null);
  };

  return (
    <main className="app actionApp" onClick={() => setPanel(null)}>
      <Stars />
      <MissionPanel
        map={currentMap}
        apiState={apiState}
        canBack={canBack}
        onBack={goCenter}
        onCenter={goCenter}
        onOpenPanel={(type) => setPanel(type)}
      />
      <OrbitMap
        map={currentMap}
        selectedId={selectedId}
        onSelect={(node) => { setSelectedId(node.id); setPanel(null); }}
        onOpenBranch={openBranch}
      />
      <button className="aiOrb" onClick={(event) => { event.stopPropagation(); setPanel('steps'); }}>🤖</button>
      <AnimatePresence>
        {selectedNode ? <DetailCard key={selectedNode.id} node={selectedNode} isRoot={selectedNode.id === 'root'} onClose={() => setSelectedId(null)} onOpenBranch={openBranch} /> : null}
        {panel ? <UtilityPanel key={panel} type={panel} map={currentMap} onClose={() => setPanel(null)} /> : null}
      </AnimatePresence>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
