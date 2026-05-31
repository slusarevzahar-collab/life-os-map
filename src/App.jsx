import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const fallbackSnapshot = {
  meta: {
    source: 'local-fallback',
    version: '0.1.0',
    updatedAt: null,
  },
  currentFocus: {
    title: 'Life OS Map',
    status: 'in_progress',
    progress: 55,
    nextAction: 'Подключить карту к данным через backend snapshot.',
  },
  tasks: [
    { id: 'task_life_os_map', title: 'Life OS Map', icon: '☀️', project: 'Life OS', status: 'in_progress', progress: 55, x: 50, y: 50, summary: 'Центр системы.' },
    { id: 'task_mobile_ux', title: 'Mobile UX', icon: '📱', project: 'Life OS', status: 'next', progress: 0, x: 50, y: 26, summary: 'Сделать мобильный режим dashboard + mini-map.' },
    { id: 'task_ai_inbox', title: 'AI Inbox', icon: '📥', project: 'AI Inbox', status: 'next', progress: 35, x: 27, y: 45, summary: 'Telegram → Make → Notion.' },
  ],
  planning: { onTrack: 1, next: 2, waiting: 1, overdue: 0 },
};

const visualNodes = {
  task_life_os_map: { icon: '☀️', x: 50, y: 50 },
  task_mobile_ux: { icon: '📱', x: 50, y: 26 },
  task_ai_inbox: { icon: '📥', x: 27, y: 45 },
  task_backend_api: { icon: '🔌', x: 34, y: 67 },
  default_0: { icon: '✅', x: 50, y: 26 },
  default_1: { icon: '🎯', x: 73, y: 45 },
  default_2: { icon: '⏱️', x: 66, y: 67 },
  default_3: { icon: '🎬', x: 64, y: 30 },
};

function buildMapFromSnapshot(snapshot) {
  const tasks = snapshot.tasks || [];
  const nodes = tasks.slice(0, 6).map((task, index) => {
    const visual = visualNodes[task.id] || visualNodes[`default_${index}`] || { icon: '🛰️', x: 50, y: 50 };
    return {
      id: task.id,
      title: task.title,
      icon: visual.icon,
      progress: task.progress ?? 0,
      status: task.status || 'status unknown',
      x: visual.x,
      y: visual.y,
      summary: task.nextAction || task.summary || task.project || 'Нет описания.',
    };
  });

  return {
    id: 'root',
    title: 'AI-first Life OS',
    icon: '☀️',
    progress: snapshot.currentFocus?.progress ?? 0,
    status: snapshot.meta?.source || 'snapshot',
    current: snapshot.currentFocus?.title || 'Life OS Map',
    next: snapshot.currentFocus?.nextAction || 'Следующий шаг не указан.',
    nodes,
  };
}

function Progress({ value }) {
  return <div className="progress"><span style={{ width: `${value}%` }} /></div>;
}

function Planet({ node, onSelect }) {
  return (
    <motion.button
      className="planet"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      onClick={() => onSelect(node)}
      whileTap={{ scale: 0.96 }}
      animate={{ y: [-3, 3, -3] }}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="planetBall"><span>{node.icon}</span></div>
      <div className="planetLabel">
        <strong>{node.title}</strong>
        <small>{node.status} · {node.progress}%</small>
      </div>
    </motion.button>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(fallbackSnapshot);
  const [apiState, setApiState] = useState('loading');
  const map = useMemo(() => buildMapFromSnapshot(snapshot), [snapshot]);
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState('mission');
  const activeNode = selected || map.nodes[0] || map;
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, size: 1 + ((i * 13) % 3) })), []);

  useEffect(() => {
    let active = true;
    fetch('/api/life-os/snapshot')
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json();
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

  return (
    <main className="app">
      <div className="stars">{stars.map((s, i) => <i key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size }} />)}</div>

      <section className="mission">
        <div className="missionHeader">
          <span className="sun">{map.icon}</span>
          <div>
            <small>MISSION CONTROL · {apiState}</small>
            <h1>{map.title}</h1>
          </div>
          <strong>{map.progress}%</strong>
        </div>
        <Progress value={map.progress} />
        <p><b>Сейчас:</b> {map.current}</p>
        <p><b>Следующий шаг:</b> {map.next}</p>
      </section>

      <section className="map" aria-label="Life OS map">
        <div className="orbit orbit1" />
        <div className="orbit orbit2" />
        <div className="orbit orbit3" />
        <button className="center" onClick={() => setSelected(map)}>
          <span>{map.icon}</span>
          <strong>{map.title}</strong>
          <small>{map.status}</small>
        </button>
        {map.nodes.map((node) => <Planet key={node.id} node={node} onSelect={setSelected} />)}
      </section>

      <nav className="bottomNav">
        <button onClick={() => setPanel('mission')}>Фокус</button>
        <button onClick={() => setPanel('data')}>Данные</button>
        <button onClick={() => setPanel('plan')}>План</button>
      </nav>

      <button className="orbi" onClick={() => setPanel('copilot')}>🤖</button>

      <AnimatePresence mode="wait">
        <motion.aside key={panel + activeNode?.id + apiState} className="sheet" initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 32, opacity: 0 }}>
          {panel === 'mission' && activeNode && (
            <>
              <div className="sheetTitle"><span>{activeNode.icon}</span><div><small>{activeNode.status}</small><h2>{activeNode.title}</h2></div></div>
              <p>{activeNode.summary || map.current}</p>
              <Progress value={activeNode.progress || map.progress} />
            </>
          )}
          {panel === 'data' && (
            <>
              <h2>Backend snapshot</h2>
              <p><b>API status:</b> {apiState}</p>
              <p><b>Источник:</b> {snapshot.meta?.source || 'unknown'}</p>
              <p><b>Endpoint:</b> <code>/api/life-os/snapshot</code></p>
              <p><b>Задач в snapshot:</b> {snapshot.tasks?.length || 0}</p>
            </>
          )}
          {panel === 'plan' && (
            <>
              <h2>Следующий технический план</h2>
              <ol>
                <li>Проверить, что frontend читает API.</li>
                <li>Заменить mock backend на чтение Notion DB.</li>
                <li>Сделать mobile dashboard + mini-map.</li>
              </ol>
            </>
          )}
          {panel === 'copilot' && (
            <>
              <h2>Орби · Copilot</h2>
              <p>Я должен помогать выбирать следующий шаг, видеть просрочки, переносы, цели и рабочие сессии. Сейчас я уже получаю основу данных через snapshot-слой.</p>
            </>
          )}
        </motion.aside>
      </AnimatePresence>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
