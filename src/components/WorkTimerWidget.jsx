import { useWorkTimer } from '../hooks/useWorkTimer.js';

export function formatWorkDuration(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

function startTime(session) {
  if (!session?.startedAt) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(session.startedAt));
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.25 5.2v13.6L19 12 8.25 5.2Z" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5h3.5v13H7v-13Zm6.5 0H17v13h-3.5v-13Z" /></svg>;
}

function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.25" y="6.25" width="11.5" height="11.5" rx="1.5" /></svg>;
}

export function WorkTimerWidget({ onSessionChange }) {
  const timer = useWorkTimer({ onSessionChange });
  const active = Boolean(timer.activeSession);
  const busy = ['starting', 'pausing', 'stopping'].includes(timer.status);
  const stateLabel = active ? 'Работаю' : timer.paused ? 'Пауза' : timer.status === 'sync-error' ? 'Нет связи' : 'Не работаю';
  return (
    <section className={`workTimerWidget ${active ? 'isActive' : ''} ${timer.paused ? 'isPaused' : ''}`} aria-label="Учёт рабочего времени" onClick={(event) => event.stopPropagation()}>
      <div className="workTimerHead">
        <span className="workTimerDot" aria-hidden="true" />
        <span>{stateLabel}</span>
        {active ? <small>Начато в {startTime(timer.activeSession)}</small> : null}
      </div>
      <div className="workTimerReadout">
        <div className="workTimerClock" aria-live="off">{formatWorkDuration(timer.currentSessionSeconds)}</div>
        <div className="workTimerTotal"><span>Сегодня</span><b>{formatWorkDuration(timer.todayTotalSeconds)}</b></div>
      </div>
      <div className={`workTimerActions ${busy ? 'isBusy' : ''}`}>
        {active ? (
          <button type="button" disabled={busy} className="workTimerPause" aria-label="Поставить таймер на паузу" title="Пауза" onClick={timer.pause}><PauseIcon /></button>
        ) : (
          <button type="button" disabled={busy} className="workTimerPlay" aria-label={timer.paused ? 'Продолжить учёт времени' : 'Начать учёт времени'} title={timer.paused ? 'Продолжить' : 'Старт'} onClick={timer.start}><PlayIcon /></button>
        )}
        {(active || timer.paused) ? (
          <button type="button" disabled={busy} className="workTimerStop" aria-label="Остановить таймер" title="Стоп" onClick={timer.stop}><StopIcon /></button>
        ) : null}
      </div>
      {timer.error ? <p role="status">{timer.error}</p> : null}
    </section>
  );
}
