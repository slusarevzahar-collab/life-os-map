import { useMemo } from 'react';

function createTwinkles(count = 230, seed = 4211) {
  let state = seed;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  return Array.from({ length: count }, () => ({
    left: `${(random() * 100).toFixed(2)}%`,
    top: `${(random() * 100).toFixed(2)}%`,
    size: `${(0.4 + random() * 0.8).toFixed(2)}px`,
    duration: `${(2.6 + random() * 4.2).toFixed(2)}s`,
    delay: `${(random() * 6).toFixed(2)}s`,
  }));
}

export function Stars() {
  const stars = useMemo(() => createTwinkles(), []);

  return (
    <>
      <div className="claudeSpaceBackground" aria-hidden="true">
        <div className="stars">
          {stars.map((star, index) => (
            <i
              key={index}
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                animationDuration: star.duration,
                animationDelay: star.delay,
              }}
            />
          ))}
        </div>
      </div>
      <div className="claudeCameraDim" aria-hidden="true" />
      <div className="claudeBaseShade" aria-hidden="true" />
      <div className="claudeVignette" aria-hidden="true" />
    </>
  );
}
