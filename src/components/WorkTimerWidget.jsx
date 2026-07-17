import { memo, useEffect, useRef } from 'react';
import { useWorkTimer } from '../hooks/useWorkTimer.js';

export function formatWorkDuration(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatWorkDurationShort(totalSeconds = 0) {
  const totalMinutes = Math.floor(Math.max(0, Number(totalSeconds) || 0) / 60);
  return [Math.floor(totalMinutes / 60), totalMinutes % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
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

export const WorkTimerWidget = memo(function WorkTimerWidget({ onSessionChange, placement = 'legacy' }) {
  const widgetRef = useRef(null);
  const timer = useWorkTimer({ onSessionChange });
  const active = Boolean(timer.activeSession);
  const busy = ['starting', 'pausing', 'stopping'].includes(timer.status);
  const hasLast = timer.lastSessionSeconds > 0;
  const showLast = !active && hasLast;
  const visualState = active ? 'running' : timer.paused ? 'paused' : timer.stopFlash ? 'stopped' : 'idle';
  const currentDuration = formatWorkDuration(timer.currentSessionSeconds);
  const durationCharacters = currentDuration.split('');
  const underHour = active && timer.currentSessionSeconds < 3600;

  useEffect(() => {
    if (placement === 'v2') return undefined;
    const widget = widgetRef.current;
    if (!widget) return undefined;

    let retryTimer;
    let resizeObserver;

    const syncDockPosition = () => {
      const app = document.querySelector('.app.actionApp');
      const dock = document.querySelector('.claudeMorphHudLabels');
      if (!app || !dock || !dock.getClientRects().length) return false;

      const appRect = app.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const horizontalInset = Math.max(0, appRect.right - dockRect.right);
      const verticalInset = Math.max(0, appRect.bottom - dockRect.bottom);
      const viewportHeight = window.visualViewport?.height || document.documentElement.getBoundingClientRect().height;

      widget.style.setProperty('--work-timer-left', `${appRect.left + horizontalInset}px`);
      widget.style.setProperty('--work-timer-bottom', `${viewportHeight - appRect.bottom + verticalInset}px`);
      return true;
    };

    const connect = () => {
      if (!syncDockPosition()) {
        retryTimer = window.setTimeout(connect, 100);
        return;
      }

      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(syncDockPosition);
        resizeObserver.observe(document.querySelector('.app.actionApp'));
        resizeObserver.observe(document.querySelector('.claudeMorphHudLabels'));
      }
    };

    connect();
    window.addEventListener('resize', syncDockPosition);
    return () => {
      window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncDockPosition);
    };
  }, [placement]);

  return (
    <section
      ref={widgetRef}
      className={`workTimerWidget${placement === 'v2' ? ' is-v2' : ''} is-${visualState} ${underHour ? 'is-under-hour' : ''}`}
      data-timer-state={visualState}
      aria-label="Учёт рабочего времени"
      onClick={(event) => event.stopPropagation()}
    >
      <div className={`workTimerReadout ${hasLast ? 'hasLast' : ''}`}>
        <div className="workTimerClock" aria-live="off" aria-label={currentDuration}>
          <span className="workTimerFullDigits" aria-hidden="true">{durationCharacters.map((character, index) => <span key={index}>{character}</span>)}</span>
          <span className="workTimerRunningDigits" aria-hidden="true">
            <span className="workTimerRunningHours">{durationCharacters.slice(0, 3).map((character, index) => <span key={index}>{character}</span>)}</span>
            <span className="workTimerRunningMinutes">{durationCharacters.slice(3).map((character, index) => <span key={index}>{character}</span>)}</span>
          </span>
        </div>
        {hasLast ? <div className={`workTimerLast ${showLast ? 'is-visible' : ''} ${timer.stopFlash ? 'isFlashing' : ''}`}><span className="workTimerSessionDivider" aria-hidden="true" /><b>{formatWorkDurationShort(timer.lastSessionSeconds)}</b></div> : null}
      </div>
      <div className={`workTimerActions ${busy ? 'isBusy' : ''}`}>
        {active ? (
          <button type="button" disabled={busy} className="workTimerPause" aria-label="Поставить таймер на паузу" title="Пауза" onClick={timer.pause}><PauseIcon /></button>
        ) : (
          <button type="button" disabled={busy} className="workTimerPlay" aria-label={timer.paused ? 'Продолжить учёт времени' : 'Начать учёт времени'} title={timer.paused ? 'Продолжить' : 'Старт'} onClick={() => timer.start()}><PlayIcon /></button>
        )}
        {(active || timer.paused) ? (
          <button type="button" disabled={busy} className="workTimerStop" aria-label="Остановить таймер" title="Стоп" onClick={timer.stop}><StopIcon /></button>
        ) : null}
      </div>
      {timer.error ? <p role="status">{timer.error}</p> : null}
    </section>
  );
});
