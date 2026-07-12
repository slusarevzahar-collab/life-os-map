// LifeMap UI V2 — MissionControl (Stage 3)
// The persistent Mission Control window from the approved design, on mock data.
// It is one element whose HEIGHT animates between collapsed (228px) and expanded
// (656px) while the queue slides down + dissolves — exactly the source's
// approach (no morph frame needed here). Lives in the HUD layer, outside camera
// and pan/zoom. Values below are taken verbatim from LifeMap Home.dc.html:
//   left 32, top 112, width 496, radius 22, bg rgba(30,39,53,.6),
//   border rgba(255,255,255,.12), backdrop blur(22px),
//   collapsed 228 / expanded 656, height transition .55s cubic-bezier(.22,1,.36,1),
//   queue: opacity .38s ease + translateY(30->0) .55s cubic-bezier(.22,1,.36,1).
// Does NOT connect the legacy MissionPanel, Notion, or a real focusQueue.
import { useEffect, useRef, useState } from 'react';

const COLLAPSED_H = 228;
const EXPANDED_H = 656;
const HEIGHT_MS = 550;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event) => setReduced(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export function MissionControl({ data, hidden = false }) {
  const [open, setOpen] = useState(false);
  const busyRef = useRef(false); // blocks re-toggle while the height transition runs
  const timerRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const toggle = () => {
    if (busyRef.current) return; // animation-required re-toggle lock
    busyRef.current = true;
    setOpen((v) => !v);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { busyRef.current = false; }, reducedMotion ? 0 : HEIGHT_MS + 40);
  };

  const height = open ? EXPANDED_H : COLLAPSED_H;
  const heightTransition = reducedMotion ? 'none' : `height ${HEIGHT_MS}ms cubic-bezier(.22,1,.36,1)`;
  const queueTransition = reducedMotion
    ? 'none'
    : `opacity .38s ease, transform ${HEIGHT_MS}ms cubic-bezier(.22,1,.36,1)`;

  return (
    <section
      className="lifemapV2MissionControl"
      aria-label="Mission Control"
      aria-hidden={hidden ? 'true' : undefined}
      data-hidden={hidden ? 'true' : 'false'}
      style={{ height: `${height}px`, transition: heightTransition }}
    >
      <header className="lifemapV2McHead">
        <div className="lifemapV2McTitle">
          <span className="lifemapV2McDot" aria-hidden="true" />MISSION CONTROL
        </div>
        <button
          type="button"
          className="lifemapV2McToggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="lifemap-v2-mission-queue"
          aria-label={open ? 'Свернуть Mission Control' : 'Развернуть Mission Control'}
          tabIndex={hidden ? -1 : 0}
        >
          {open ? 'Свернуть' : 'Развернуть'}
        </button>
      </header>

      <div className="lifemapV2McNow">
        <span className="lifemapV2McNowLabel">Сейчас · </span>
        <span className="lifemapV2McNowText">{data.now}</span>
      </div>
      <div className="lifemapV2McNext">
        <span className="lifemapV2McNextLabel">Далее · </span>
        <span className="lifemapV2McNextText">{data.next}</span>
      </div>

      <div
        id="lifemap-v2-mission-queue"
        className="lifemapV2McQueue"
        style={{
          opacity: open ? 1 : 0,
          transform: `translateY(${open ? 0 : 30}px)`,
          transition: queueTransition,
          pointerEvents: open ? 'auto' : 'none',
        }}
        aria-hidden={open ? undefined : 'true'}
      >
        <div className="lifemapV2McQueueBar">
          <button type="button" className="lifemapV2McQueueHide" tabIndex={open && !hidden ? 0 : -1}>
            Скрыть очередь <span aria-hidden="true">⌃</span>
          </button>
          <button type="button" className="lifemapV2McQueueDone" tabIndex={open && !hidden ? 0 : -1}>
            Выполнено
          </button>
        </div>
        <ol className="lifemapV2McQueueList">
          {data.queue.map((item) => (
            <li key={item.n} className="lifemapV2McQueueItem">
              <span className="lifemapV2McQueueNum">{item.n}</span>
              <span className="lifemapV2McQueueText">{item.title}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
