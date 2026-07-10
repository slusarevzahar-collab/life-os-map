import crypto from 'node:crypto';

const ACCESS_COOKIE = 'lifemap_access';

function accessToken() {
  const secret = String(process.env.LIFEMAP_ASSISTANT_API_SECRET || '');
  if (!secret) return '';
  return crypto.createHash('sha256').update(`lifemap-access:${secret}`).digest('base64url');
}

function cookieValue(req, name) {
  const raw = String(req.get('Cookie') || '');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

function cookieAccessOk(req) {
  const expected = accessToken();
  const actual = cookieValue(req, ACCESS_COOKIE);
  if (!expected || !actual || expected.length !== actual.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

function issueAccessCookie(res) {
  const token = accessToken();
  if (!token) return;
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.append('Set-Cookie', `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure}`);
}

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

export function requireLifeMapAccess(req, res, assistantSecretOk) {
  if (cookieAccessOk(req)) return true;
  if (assistantSecretOk?.(req)) {
    issueAccessCookie(res);
    return true;
  }
  res.status(403).json({ ok: false, error: 'LifeMap access key required.' });
  return false;
}

export function requireTrustedWrite(req, res, assistantSecretOk) {
  if (assistantSecretOk?.(req)) {
    issueAccessCookie(res);
    return true;
  }
  res.status(403).json({ ok: false, error: 'LifeMap write key required.' });
  return false;
}
