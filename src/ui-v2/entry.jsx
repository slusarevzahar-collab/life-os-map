// LifeMap UI V2 — isolated entry point.
// Mounted ONLY when the page is loaded with ?uiv2=1 (see index.html loader).
// Deliberately imports nothing from the legacy app: no legacy CSS and no legacy
// runtime patches (claude-stage / live-map-enhance / claude-style-last).
import { createRoot } from 'react-dom/client';
import { LifeMapShell } from './LifeMapShell.jsx';
import './lifemap-ui-v2.css';
import './lifemap-ui-v2-stage5a.css';
import './lifemap-ui-v2-stage5b1.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<LifeMapShell />);
}
