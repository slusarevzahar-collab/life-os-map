// LifeMap UI V2 — root shell (Stage 0).
// Orchestration container only. At Stage 0 it renders a clean, empty design
// scene inside the StageScaler. No API, no Notion, no timer, no legacy pieces.
// The temporary label exists only to verify the scaffold and is removed in Stage 1.
import { StageScaler } from './stage/StageScaler.jsx';

export function LifeMapShell() {
  return (
    <div className="lifemapV2">
      <StageScaler>
        <div className="lifemapV2Scene">
          <div className="lifemapV2StageLabel">
            <span className="lifemapV2Brand">LIFEMAP</span>
            <span className="lifemapV2Tag">UI V2 — Stage 0</span>
            <span className="lifemapV2Sub">Изолированный каркас · design-box 1280 × 800</span>
          </div>
        </div>
      </StageScaler>
    </div>
  );
}
