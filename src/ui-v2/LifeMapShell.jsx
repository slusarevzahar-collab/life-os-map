// LifeMap UI V2 — root shell (Stage 1).
// Composes the static home map on mock data: StageScaler > frame > SpaceBackground
// + OrbitSystem. Stage-0 placeholder label removed. Still no API, no Notion, no
// timer, no Mission Control, no Inbox/AI, no legacy components.
import { StageScaler } from './stage/StageScaler.jsx';
import { SpaceBackground } from './stage/SpaceBackground.jsx';
import { OrbitSystem } from './map/OrbitSystem.jsx';
import { homeMapMock } from './mock/homeMapMock.js';

export function LifeMapShell() {
  return (
    <div className="lifemapV2">
      <StageScaler>
        <div className="lifemapV2Frame">
          <SpaceBackground />
          <div className="lifemapV2Content">
            <OrbitSystem planets={homeMapMock} />
          </div>
        </div>
      </StageScaler>
    </div>
  );
}
