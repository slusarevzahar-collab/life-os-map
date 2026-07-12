// LifeMap UI V2 — SpaceBackground (Stage 1)
// Layers: original photo + twinkles (decorative loop from the approved design),
// dim layer (inert — wired to real camera state in Stage 2), base shade, vignette.
// The background does not move yet: no parallax, no camera transform.
import { useMemo } from 'react';

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

export function SpaceBackground() {
  const twinkles = useMemo(() => seededTwinkles(), []);

  return (
    <div className="lifemapV2Background" aria-hidden="true">
      <div className="lifemapV2BgPhoto">
        {twinkles.map((star, index) => (
          <i
            key={index}
            className="lifemapV2Twinkle"
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>
      {/* Future camera dim layer: static/inactive until Stage 2 wires camera state */}
      <div className="lifemapV2BgDim" />
      <div className="lifemapV2BgShade" />
      <div className="lifemapV2BgVignette" />
    </div>
  );
}
