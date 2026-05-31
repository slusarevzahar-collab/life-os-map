import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const dataSource = {
  mode: 'mock-notion-adapter',
  name: 'Life OS Notion Adapter v0.2',
  endpoint: '/api/life-os/snapshot',
  next: 'Подключить серверный маршрут, который будет читать Notion DB и отдавать карте готовый JSON.',
};

const root = {
  id: 'root',
  title: 'AI-first Life OS',
  icon: '☀️',
  progress: 55,
  status: 'центр системы',
  current: 'Life OS Map: сделать карту рабочим навигатором',
  next: 'Подключить карту к данным Notion через data adapter',
  nodes: [
    { id: 'tasks', title: 'Tasks DB', icon: '✅', progress: 45, status: 'создано', angle: -90, orbit: 178, summary: 'Задачи, статусы, сроки, переносы, прогресс и следующий шаг.' },
    { id: 'goals', title: 'Goals DB', icon: '🎯', progress: 38, status: 'создано', angle: -30, orbit: 222, summary: 'Цели на месяц, полгода, год и связь с задачами.' },
    { id: 'sessions', title: 'Work Sessions', icon: '⏱️', progress: 30, status: 'создано', angle: 32, orbit: 204, summary: 'Рабочие сессии, время, результат и следующий шаг.' },
    { id: 'notion-adapter', title: 'Notion Adapter', icon: '🔌', progress: 25, status: 'в работе', angle: 118, orbit: 220, summary: 'Слой, который отделяет данные от интерфейса карты.' },
    { id: 'ai-inbox', title: 'AI Inbox', icon: '📥', progress: 35, status: 'следующий шаг', angle: 205, orbit: 218, summary: 'Telegram → Make → Notion для ссылок, постов, голосовых и заметок.' },
    { id: 'content', title: 'AI-контент', icon: '🎬', progress: 22, status: 'ветка', angle: 275, orbit: 220, summary: 'Hyperframes, NotebookLM, reusable workflow и Content Agent.' },
  ],
};

function polar(orbit, angle) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * orbit, y: Math.sin(rad) * orbit };
}

function Progress({ value }) {
  return <div className="progress"><span style={{ width: `${value}%` }} /></div>;
}

function Planet({ node, onSelect }) {
  const pos = polar(node.orbit, node.angle);
  return (
    <motion.button
      className="planet"
      style={{ left: `calc(50% + ${pos.x}px)`, top: `calc(50% + ${pos.y}px)` }}
      onClick={() => onSelect(node)}
      whileTap={{ scale: 0.96 }}
      animate={{ y: [-4, 4, -4] }}
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
  const [selected, setSelected] = useState(root.nodes[3]);
  const [panel, setPanel] = useState('mission');
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, size: 1 + ((i * 13) % 3) })), []);

  return (
    <main className="app">
      <div className="stars">{stars.map((s, i) => <i key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size }} />)}</div>

      <section className="mission">
        <div className="missionHeader">
          <span className="sun">{root.icon}</span>
          <div>
            <small>MISSION CONTROL</small>
            <h1>{root.title}</h1>
          </div>
          <strong>{root.progress}%</strong>
        </div>
        <Progress value={root.progress} />
        <p><b>Сейчас:</b> {root.current}</p>
        <p><b>Следующий шаг:</b> {root.next}</p>
      </section>

      <section className="map" aria-label="Life OS map">
        <div className="orbit orbit1" />
        <div className="orbit orbit2" />
        <div className="orbit orbit3" />
        <button className="center" onClick={() => setSelected(root)}>
          <span>{root.icon}</span>
          <strong>{root.title}</strong>
          <small>{root.status}</small>
        </button>
        {root.nodes.map((node) => <Planet key={node.id} node={node} onSelect={setSelected} />)}
      </section>

      <nav className="bottomNav">
        <button onClick={() => setPanel('mission')}>Фокус</button>
        <button onClick={() => setPanel('data')}>Данные</button>
        <button onClick={() => setPanel('plan')}>План</button>
      </nav>

      <button className="orbi" onClick={() => setPanel('copilot')}>🤖</button>

      <AnimatePresence mode="wait">
        <motion.aside key={panel + selected?.id} className="sheet" initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 32, opacity: 0 }}>
          {panel === 'mission' && selected && (
            <>
              <div className="sheetTitle"><span>{selected.icon}</span><div><small>{selected.status}</small><h2>{selected.title}</h2></div></div>
              <p>{selected.summary || root.current}</p>
              <Progress value={selected.progress || root.progress} />
            </>
          )}
          {panel === 'data' && (
            <>
              <h2>Data adapter</h2>
              <p><b>Режим:</b> {dataSource.mode}</p>
              <p><b>Источник:</b> {dataSource.name}</p>
              <p><b>Будущий endpoint:</b> <code>{dataSource.endpoint}</code></p>
              <p>{dataSource.next}</p>
            </>
          )}
          {panel === 'plan' && (
            <>
              <h2>Следующий технический план</h2>
              <ol>
                <li>Проверить запуск.</li>
                <li>Сделать стабильный preview.</li>
                <li>Создать endpoint <code>/api/life-os/snapshot</code>.</li>
                <li>Подключить Notion DB через сервер.</li>
                <li>Заменить mock data на живой snapshot.</li>
              </ol>
            </>
          )}
          {panel === 'copilot' && (
            <>
              <h2>Орби · Copilot</h2>
              <p>Я должен помогать выбирать следующий шаг, видеть просрочки, переносы, цели и рабочие сессии. Сейчас это UI-прототип, позже он будет читать данные через backend.</p>
            </>
          )}
        </motion.aside>
      </AnimatePresence>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
