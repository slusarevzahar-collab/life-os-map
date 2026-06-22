import { useMemo } from 'react';

export function Stars() {
  const stars = useMemo(() => Array.from({ length: 88 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    top: `${(i * 61) % 100}%`,
    size: 1 + ((i * 13) % 3),
    delay: `${(i % 7) * 0.32}s`,
  })), []);

  return <div className="stars">{stars.map((star, index) => <i key={index} style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }} />)}</div>;
}
