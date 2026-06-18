import React from 'react';
import {
  formatDate,
  minutesLabel,
  normalizeStatus,
  statusLabel,
} from '../lib/lifeOsData.js';

export function Progress({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="progress">
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}

export function StatusPill({ status, statusKey }) {
  return <span className={`statusPill status-${statusKey || normalizeStatus(status)}`}>{statusLabel(status)}</span>;
}

export function MiniMetric({ label, value, tone = 'neutral' }) {
  return (
    <div className={`miniMetric tone-${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function TaskRow({ task, active, onClick }) {
  const statusKey = normalizeStatus(task.status);

  return (
    <button className={`taskRow ${active ? 'activeTaskRow' : ''}`} onClick={onClick}>
      <span className={`taskDot status-${statusKey}`} />
      <span className="taskRowMain">
        <b>{task.title}</b>
        <small>{task.project || 'Life OS'} · {statusLabel(task.status)} · {task.progress || 0}%</small>
      </span>
      <span className="taskRowDate">{formatDate(task.dueDate)}</span>
    </button>
  );
}

export function GoalRow({ goal }) {
  return (
    <div className="compactRow">
      <span className="compactDot" />
      <div>
        <b>{goal.title}</b>
        <small>{goal.status || 'status'} · {goal.progress || 0}% · {formatDate(goal.targetDate)}</small>
      </div>
    </div>
  );
}

export function SessionRow({ session }) {
  return (
    <div className="compactRow">
      <span className="compactDot sessionDot" />
      <div>
        <b>{session.title}</b>
        <small>{session.project || 'Life OS'} · {session.status || 'status'} · {minutesLabel(session.durationMin)}</small>
      </div>
    </div>
  );
}
