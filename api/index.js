import { createLifeMapApp } from '../server/lifemapStart.js';

const { app } = createLifeMapApp();

function restoreApiPath(req) {
  const parsed = new URL(req.url || '/api', 'http://lifemap.local');
  const routePath = parsed.searchParams.get('path');
  if (!routePath) return;

  parsed.searchParams.delete('path');
  const query = parsed.searchParams.toString();
  req.url = `/api/${routePath.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
}

export default function handler(req, res) {
  restoreApiPath(req);
  return app(req, res);
}
