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

export function WorkTimerWidget({ onSessionChange }) {
  const timer = useWorkTimer({ onSessionChange });
  const active = Boolean(timer.activeSession);
  const busy = ['starting', 'pausing'].includes(timer.status);
  return (
    <section className={`workTimerWidget ${active ? 'isActive' : ''}`} aria-label="Учёт рабочего времени" onClick={(event) => event.stopPropagation()}>
      <div className="workTimerHead">
        <span className="workTimerDot" aria-hidden="true" />
        <span>{active ? 'Работаю' : timer.status === 'sync-error' ? 'Нет связи' : 'Не работаю'}</span>
        {active ? <small>Начато в {startTime(timer.activeSession)}</small> : null}
      </div>
      <div className="workTimerClock" aria-live="off">{formatWorkDuration(timer.currentSessionSeconds)}</div>
      <div className="workTimerTotal"><span>Сегодня</span><b>{formatWorkDuration(timer.todayTotalSeconds)}</b></div>
      <button
        type="button"
        disabled={busy}
        aria-label={active ? 'Поставить учёт рабочего времени на паузу' : 'Начать учёт рабочего времени'}
        title={active ? 'Завершить текущую рабочую сессию' : 'Начать новую рабочую сессию'}
        onClick={() => active ? timer.pause() : timer.start()}
      >
        {busy ? 'Сохраняю…' : active ? 'Пауза' : 'Старт'}
      </button>
      {timer.error ? <p role="status">{timer.error}</p> : null}
    </section>
  );
}

