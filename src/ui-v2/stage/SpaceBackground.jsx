// LifeMap UI V2 — SpaceBackground (Stage 2)
// Receives a declarative pose via props (transformOrigin, transform,
// dimOpacity, transitionMs) and applies it ONLY to its own inline styles.
// The pose lives in useCameraFlight React state, so re-renders cannot reset it.
import { useEffect, useMemo, useState } from 'react';

function seededTwinkles(count = 230, seed = 4211) {
  let state = seed;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  return Array.from({ length: count }, () => ({
    left: +(random() * 100).toFixed(2),
    top: +(random() * 100).toFixed(2),
    size: +(0.4 + random() * 0.8).toFixed(2),
    duration: +(2.6 + random() * 4.2).toFixed(2),
    delay: +(random() * 6).toFixed(2),
  }));
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event) => setReduced(event.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reduced;
}

export function SpaceBackground({ pose }) {
  const twinkles = useMemo(() => seededTwinkles(), []);
  const reducedMotion = usePrefersReducedMotion();
  const {
    transformOrigin = '640px 400px',
    transform = 'translate(0px,0px) scale(1)',
    dimOpacity = 0,
    transitionMs = 1150,
  } = pose || {};
  const effectiveTransitionMs = reducedMotion ? 0 : transitionMs;

  return (
    <div className="lifemapV2Background" aria-hidden="true">
      <div
        className="lifemapV2BgPhoto"
        style={{ transformOrigin, transform, transitionDuration: `${effectiveTransitionMs}ms` }}
      >
        {twinkles.map((star, index) => (
          <i
            key={index}
            className="lifemapV2Twinkle"
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDuration: reducedMotion ? '0s' : `${star.duration}s`,
              animationDelay: `${star.delay}s`,
              animationPlayState: reducedMotion ? 'paused' : 'running',
            }}
          />
        ))}
      </div>
      <div
        className="lifemapV2BgDim"
        style={{ opacity: dimOpacity, transitionDuration: `${effectiveTransitionMs}ms` }}
      />
      <div className="lifemapV2BgShade" />
      <div className="lifemapV2BgVignette" />
    </div>
  );
}
