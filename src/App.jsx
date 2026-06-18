import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'framer-motion';
import './styles.css';

import {
  buildMapFromSnapshot,
  compactTitle,
  fallbackSnapshot,
  normalizeStatus,
  taskIcon,
} from './lib/lifeOsData.js';
import { LifeOsMap } from './components/LifeOsMap.jsx';
import {
  ActiveQueue,
  BottomNav,
  DetailSheet,
  MapFilters,
  MissionControl,
} from './components/LifeOsPanels.jsx';

function Stars() {
  const stars = useMemo(
    () => Array.from({ length: 90 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      top: `${(i * 61) % 100}%`,
      size: 1 + ((i * 13) % 3),
      delay: `${(i % 9) * 0.22}s`,
    })),
    [],
  );

  return (
    <div className="stars">
      {stars.map((star, index) => (
        <i
          key={index}
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
          }}
        />
      ))}
    </div>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(fallbackSnapshot);
  const [apiState, setApiState] = useState('loading');
  const [panel, setPanel] = useState(null);
  const [selected, setSelected] = useState(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [mapFilter, setMapFilter] = useState('all');

  const map = useMemo(() => buildMapFromSnapshot(snapshot, mapFilter), [snapshot, mapFilter]);
  const activeNode =
    selected ||
    map.taskNodes.find((node) => node.id === map.nowTask?.id) ||
    map.taskNodes[0] ||
    map.goalNodes[0] ||
    map;

  useEffect(() => {
    let active = true;

    fetch('/api/life-os/snapshot')
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
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

    return () => {
      active = false;
    };
  }, []);

  const closePanel = () => setPanel(null);
  const openPanel = (nextPanel) => setPanel((current) => (current === nextPanel ? null : nextPanel));

  const toggleWorkspace = (event) => {
    event.stopPropagation();
    setWorkspaceVisible((value) => !value);
    setPanel(null);
  };

  const resetMapFilter = (filter) => {
    setMapFilter(filter);
    setSelected(null);
    setPanel(null);
  };

  const selectNode = (node) => {
    setSelected(node);
    setPanel('mission');
  };

  const selectTask = (task) => {
    const nextNode = map.taskNodes.find((node) => node.id === task.id) || {
      id: task.id,
      type: 'task',
      title: task.title,
      shortTitle: compactTitle(task.title),
      monogram: taskIcon(task.project),
      status: task.status,
      statusKey: normalizeStatus(task.status),
      project: task.project,
      progress: task.progress,
      dueDate: task.dueDate,
      priority: task.priority,
      summary: task.nextAction || 'Следующий шаг пока не указан.',
    };

    selectNode(nextNode);
  };

  return (
    <main className={`app ${workspaceVisible ? '' : 'mapOnly'}`} onClick={closePanel}>
      <Stars />

      <header className="topBar" onClick={(event) => event.stopPropagation()}>
        <div className="topBarIdentity">
          <span>Life OS Map</span>
          <b>{map.current}</b>
        </div>
        <div className="topBarMeta">
          <span className={`apiBadge api-${apiState}`}>{apiState}</span>
          <button className="workspaceToggle" onClick={toggleWorkspace}>
            {workspaceVisible ? 'Скрыть панели' : 'Показать панели'}
          </button>
        </div>
      </header>

      <section className="workspace">
        <AnimatePresence>
          {workspaceVisible && <MissionControl map={map} snapshot={snapshot} apiState={apiState} />}
        </AnimatePresence>

        <section className="mapColumn">
          <MapFilters value={mapFilter} onChange={resetMapFilter} />
          <LifeOsMap
            map={map}
            activeNode={activeNode}
            onSelect={selectNode}
            onClose={closePanel}
          />
        </section>

        <AnimatePresence>
          {workspaceVisible && (
            <ActiveQueue
              map={map}
              mapFilter={mapFilter}
              activeNode={activeNode}
              onSelectTask={selectTask}
            />
          )}
        </AnimatePresence>
      </section>

      <BottomNav panel={panel} onOpen={openPanel} />

      <button
        className="orbi"
        onClick={(event) => {
          event.stopPropagation();
          openPanel('copilot');
        }}
      >
        AI
      </button>

      <AnimatePresence mode="wait">
        <DetailSheet
          panel={panel}
          activeNode={activeNode}
          map={map}
          snapshot={snapshot}
          apiState={apiState}
          onClose={closePanel}
          onSelectTask={selectTask}
        />
      </AnimatePresence>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
