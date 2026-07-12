// LifeMap UI V2 — TopHud (Stage 3)
// Minimal persistent top HUD from the approved design: the LIFEMAP / CONNECTED
// wordmark plus Назад / Главная actions. Lives in the HUD layer (outside the
// camera-flight and pan/zoom layers), so it never moves, scales, blurs, or
// fades during a map flight. It owns no route/camera state — it only calls the
// callbacks the shell passes in, and both actions are disabled while the map is
// flying or a window is morphing.
export function TopHud({ showBackNav = false, locked = false, onBack, onHome }) {
  return (
    <div className="lifemapV2TopHud">
      <div className="lifemapV2Wordmark">
        LIFEMAP<span className="lifemapV2Connected">CONNECTED</span>
      </div>
      {showBackNav ? (
        <div className="lifemapV2BackNav">
          <button
            type="button"
            className="lifemapV2NavBtn lifemapV2NavBack"
            disabled={locked}
            onClick={onBack}
            aria-label="Назад — на предыдущий уровень"
          >
            ← Назад
          </button>
          <button
            type="button"
            className="lifemapV2NavBtn lifemapV2NavHome"
            disabled={locked}
            onClick={onHome}
            aria-label="Главная — вернуться к корню карты"
          >
            Главная
          </button>
        </div>
      ) : null}
    </div>
  );
}
