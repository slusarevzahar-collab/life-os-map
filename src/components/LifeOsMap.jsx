import React from 'react';
import { motion } from 'framer-motion';
import { statusLabel } from '../lib/lifeOsData.js';

function NodeBubble({ node, onSelect, selected }) {
  const isGoal = node.type === 'goal';
  const hiddenCount = isGoal ? Number(node.hiddenTaskCount || 0) : 0;

  return (
    <motion.button
      className={`${isGoal ? 'goalNode' : 'planet'} ${selected ? 'selectedPlanet' : ''} status-${node.statusKey}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node);
      }}
      whileTap={{ scale: 0.96 }}
      animate={isGoal ? { scale: [1, 1.018, 1] } : { y: [-2, 2, -2] }}
      transition={{ duration: isGoal ? 7 : 6, repeat: Infinity, ease: 'easeInOut' }}
      title={node.title}
    >
      <div className={isGoal ? 'goalBall' : 'planetBall'}>
        <span>{node.monogram}</span>
        {hiddenCount > 0 ? <em>+{hiddenCount}</em> : null}
      </div>
      <div className={isGoal ? 'goalLabel' : 'planetLabel'}>
        <strong>{node.shortTitle}</strong>
        <small>{isGoal ? `${node.taskCount || 0} задач · ${node.progress}%` : `${statusLabel(node.status)} · ${node.progress}%`}</small>
      </div>
    </motion.button>
  );
}

export function LifeOsMap({ map, activeNode, onSelect, onClose }) {
  return (
    <section className="map" aria-label="Life OS map" onClick={onClose}>
      <div className="mapGlow" />
      <div className="orbit orbit1" />
      <div className="orbit orbit2" />
      <div className="orbit orbit3" />
      <div className="orbit orbit4" />

      {map.goalNodes.map((goal) => (
        <div
          key={`line-${goal.id}`}
          className="goalLine"
          style={{
            left: `${goal.x}%`,
            top: `${goal.y}%`,
            '--line-angle': `${goal.angle + 90}deg`,
          }}
        />
      ))}

      <button
        className="center"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(map);
        }}
      >
        <span>{map.icon}</span>
        <strong>{map.title}</strong>
        <small>{map.status}</small>
      </button>

      {map.goalNodes.map((node) => (
        <NodeBubble
          key={node.id}
          node={node}
          selected={activeNode?.id === node.id}
          onSelect={onSelect}
        />
      ))}

      {map.taskNodes.map((node) => (
        <NodeBubble
          key={node.id}
          node={node}
          selected={activeNode?.id === node.id}
          onSelect={onSelect}
        />
      ))}

      {map.hiddenTaskCount > 0 ? (
        <div className="mapHint">
          На карте показаны главные узлы. Ещё {map.hiddenTaskCount} задач — в очереди справа.
        </div>
      ) : null}
    </section>
  );
}
