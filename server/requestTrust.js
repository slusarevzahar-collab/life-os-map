export function trustedLifeMapUi(req) {
  if (String(req.get('Sec-Fetch-Site') || '').toLowerCase() === 'same-origin') return true;

  const candidates = [req.get('Origin'), req.get('Referer')].filter(Boolean);
  if (!candidates.length) return false;

  const codespaceName = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
  const port = Number(process.env.API_PORT || 3001);
  const productionOrigins = String(process.env.LIFEMAP_TRUSTED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return candidates.some((candidate) => {
    try {
      const url = new URL(candidate);
      if (['localhost', '127.0.0.1'].includes(url.hostname)) return true;
      if (Boolean(codespaceName) && url.hostname === `${codespaceName}-${port}.${domain}`) return true;
      return productionOrigins.some((origin) => {
        try { return new URL(origin).origin === url.origin; } catch { return false; }
      });
    } catch {
      return false;
    }
  });
}

export function trustedWriteRequest(req, assistantSecretOk) {
  return Boolean(assistantSecretOk?.(req));
}

export function requireTrustedWrite(req, res, assistantSecretOk) {
  if (trustedWriteRequest(req, assistantSecretOk)) return true;
  res.status(403).json({ ok: false, error: 'LifeMap write secret required.' });
  return false;
}
