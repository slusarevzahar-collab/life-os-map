// LifeMap UI V2 — TopHud (Stage 4)
// Minimal persistent top HUD from the approved design: the LIFEMAP wordmark
// plus Назад / Главная actions. Lives in the HUD layer (outside the
// camera-flight and pan/zoom layers), so it never moves, scales, blurs, or
// fades during a map flight. It owns no route/camera/API state — it only
// calls the callbacks the shell passes in, and both actions are disabled
// while the map is flying or a window is morphing.
//
// Stage 4 addition: the former hardcoded "CONNECTED" span is now driven by
// statusLabel/statusTone (CONNECTED | MOCK | OFFLINE | LOADING), computed by
// LifeMapShell from the real snapshot state machine. Stays a compact label
// next to LIFEMAP — no panel, no overlay, no blocking the map. statusTitle
// (optional) carries the last error message as a native tooltip/aria hint —
// this is NOT the Stage 5 StatusNotice.
const STATUS_COLORS = {
  connected: 'rgba(87, 224, 168, .85)',
  mock: 'rgba(240, 196, 110, .92)',
  offline: 'rgba(226, 120, 120, .92)',
  loading: 'rgba(150, 165, 185, .85)',
};

export function TopHud({
  showBackNav = false,
  locked = false,
  onBack,
  onHome,
  statusLabel = 'CONNECTED',
  statusTone = 'connected',
  statusTitle,
}) {
  return (
    <div className="lifemapV2TopHud">
      <div className="lifemapV2Wordmark">
        LIFEMAP
        <span
          className={`lifemapV2Connected lifemapV2Status--${statusTone}`}
          style={{ color: STATUS_COLORS[statusTone] || STATUS_COLORS.connected }}
          role="status"
          title={statusTitle || undefined}
          aria-label={`Статус LifeMap: ${statusLabel}`}
        >
          {statusLabel}
        </span>
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
