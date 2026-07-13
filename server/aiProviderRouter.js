const DEFAULT_TIMEOUT_MS = 22000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groqConfig({ name, model, apiKey }) {
  return {
    name,
    provider: 'groq',
    apiKey,
    model,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    useJsonObjectMode: true,
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  };
}

function providerConfigs(env = process.env) {
  const groqKey = env.GROQ_API_KEY || '';
  return {
    groq_scout: groqConfig({
      name: 'groq_scout',
      apiKey: groqKey,
      model: env.GROQ_SCOUT_MODEL || 'openai/gpt-oss-120b',
    }),
    groq_qwen: groqConfig({
      name: 'groq_qwen',
      apiKey: groqKey,
      model: env.GROQ_QWEN_MODEL || 'qwen/qwen3-32b',
    }),
    groq_instant: groqConfig({
      name: 'groq_instant',
      apiKey: groqKey,
      model: env.GROQ_INSTANT_MODEL || 'llama-3.1-8b-instant',
    }),
    groq_70b: groqConfig({
      name: 'groq_70b',
      apiKey: groqKey,
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    }),
    gemini: {
      name: 'gemini',
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY || '',
      model: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      useJsonObjectMode: false,
      authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    },
  };
}

const DEFAULT_ORDERS = {
  inbox: ['groq_scout', 'groq_instant', 'groq_qwen', 'gemini'],
  chat: ['groq_qwen', 'groq_scout', 'groq_70b', 'groq_instant', 'gemini'],
};

function expandAlias(name, profile) {
  if (name !== 'groq') return [name];
  return DEFAULT_ORDERS[profile].filter((item) => item.startsWith('groq_'));
}

function profileOrder(env = process.env, profile = 'chat') {
  const specific = profile === 'inbox' ? env.AI_INBOX_PROVIDER_ORDER : env.AI_CHAT_PROVIDER_ORDER;
  const generic = env.AI_PROVIDER_ORDER;
  const raw = specific || generic || DEFAULT_ORDERS[profile].join(',');
  const requested = String(raw)
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((name) => expandAlias(name, profile));
  return [...new Set(requested)].filter((name) => [...DEFAULT_ORDERS.inbox, ...DEFAULT_ORDERS.chat].includes(name));
}

function extractText(data = {}) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('\n').trim();
  return '';
}

function retryAfterMs(response) {
  const raw = Number(response.headers.get('retry-after') || 0);
  return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw * 1000) : 0;
}

function headerNumber(response, name) {
  const raw = response.headers.get(name);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function metricSnapshot(limit, remaining, reset = '') {
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || limit <= 0) return null;
  return {
    limit,
    remaining: Math.max(0, remaining),
    percent: Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))),
    reset: String(reset || ''),
  };
}

function quotaSnapshot(response) {
  const requests = metricSnapshot(
    headerNumber(response, 'x-ratelimit-limit-requests'),
    headerNumber(response, 'x-ratelimit-remaining-requests'),
    response.headers.get('x-ratelimit-reset-requests') || '',
  );
  const tokens = metricSnapshot(
    headerNumber(response, 'x-ratelimit-limit-tokens'),
    headerNumber(response, 'x-ratelimit-remaining-tokens'),
    response.headers.get('x-ratelimit-reset-tokens') || '',
  );
  if (!requests && !tokens) return null;
  return { requests, tokens, updatedAt: new Date().toISOString() };
}

function usageSnapshot(data = {}) {
  const usage = data.usage || {};
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens || 0);
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function shortProviderError(config, response, data) {
  if (response.status === 429) return `${config.provider}/${config.model}: rate limit`;
  const message = String(data.error?.message || `HTTP ${response.status}`).replace(/\s+/g, ' ').slice(0, 220);
  return `${config.provider}/${config.model}: ${message}`;
}

async function callProvider({ config, systemPrompt, userPayload, maxTokens, temperature, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      max_tokens: maxTokens,
      temperature,
    };
    if (config.useJsonObjectMode) body.response_format = { type: 'json_object' };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.authHeader(config.apiKey),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const quota = quotaSnapshot(response);
    const data = await response.json().catch(() => ({}));
    const usage = usageSnapshot(data);
    if (!response.ok || data.error) {
      const error = new Error(shortProviderError(config, response, data));
      error.provider = config.provider;
      error.model = config.model;
      error.status = response.status;
      error.retryAfterMs = retryAfterMs(response);
      error.quota = quota;
      error.usage = usage;
      throw error;
    }
    const text = extractText(data);
    if (!text) {
      const error = new Error(`${config.provider}/${config.model}: empty response`);
      error.provider = config.provider;
      error.model = config.model;
      error.quota = quota;
      error.usage = usage;
      throw error;
    }
    return { text, provider: config.provider, model: data.model || config.model, quota, usage };
  } finally {
    clearTimeout(timer);
  }
}

function soonestRetry(errors = []) {
  const values = errors.map((item) => Number(item.retryAfterMs || 0)).filter((value) => value > 0);
  return values.length ? Math.min(...values) : 0;
}

function conservativePercent(quota) {
  const values = [quota?.requests?.percent, quota?.tokens?.percent].filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

export function createAiProviderRouter(env = process.env) {
  const configs = providerConfigs(env);
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const blockedUntil = new Map();
  const lastProfileCallAt = new Map();
  const routeTelemetry = new Map();
  const profileTelemetry = new Map();
  const minGapMs = {
    inbox: Math.max(5000, Number(env.AI_INBOX_MIN_GAP_MS || 12000)),
    chat: Math.max(0, Number(env.AI_CHAT_MIN_GAP_MS || 0)),
  };

  function orderFor(profile = 'chat') {
    return profileOrder(env, profile);
  }

  async function pace(profile) {
    const gap = Number(minGapMs[profile] || 0);
    if (!gap) return;
    const last = Number(lastProfileCallAt.get(profile) || 0);
    const waitMs = Math.max(0, last + gap - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    lastProfileCallAt.set(profile, Date.now());
  }

  function recordTelemetry(name, profile, payload = {}, outcome = 'ok') {
    const config = configs[name];
    const previous = routeTelemetry.get(name) || {};
    const now = new Date().toISOString();
    routeTelemetry.set(name, {
      ...previous,
      quota: payload.quota || previous.quota || null,
      usage: payload.usage || previous.usage || null,
      lastOutcome: outcome,
      lastUsedAt: now,
    });
    profileTelemetry.set(profile, {
      route: name,
      provider: config?.provider || '',
      model: payload.model || config?.model || '',
      outcome,
      updatedAt: now,
    });
  }

  function profileQuota(profile) {
    const order = orderFor(profile);
    const configured = order.filter((name) => Boolean(configs[name]?.apiKey));
    const available = configured.filter((name) => Math.max(0, Number(blockedUntil.get(name) || 0) - Date.now()) === 0);
    const latest = profileTelemetry.get(profile) || null;
    const telemetryRoute = latest?.route || configured.find((name) => routeTelemetry.get(name)?.quota) || '';
    const telemetry = telemetryRoute ? routeTelemetry.get(telemetryRoute) || null : null;
    const quota = telemetry?.quota || null;
    return {
      profile,
      routeOrder: order,
      configuredRoutes: configured.length,
      availableRoutes: available.length,
      blockedRoutes: configured.length - available.length,
      lastRoute: latest?.route || '',
      lastProvider: latest?.provider || '',
      lastModel: latest?.model || '',
      lastOutcome: latest?.outcome || '',
      updatedAt: quota?.updatedAt || latest?.updatedAt || '',
      requests: quota?.requests || null,
      tokens: quota?.tokens || null,
      capacityPercent: conservativePercent(quota),
      telemetrySource: quota ? 'provider-response-headers' : 'availability-only',
    };
  }

  function status() {
    const uniqueNames = [...new Set([...orderFor('chat'), ...orderFor('inbox')])];
    return {
      order: orderFor('chat'),
      profiles: { chat: orderFor('chat'), inbox: orderFor('inbox') },
      quotaProfiles: { chat: profileQuota('chat'), inbox: profileQuota('inbox') },
      pacingMs: minGapMs,
      providers: uniqueNames.map((name) => ({
        name,
        provider: configs[name]?.provider || name,
        configured: Boolean(configs[name]?.apiKey),
        model: configs[name]?.model || '',
        blockedForMs: Math.max(0, Number(blockedUntil.get(name) || 0) - Date.now()),
        quota: routeTelemetry.get(name)?.quota || null,
        lastOutcome: routeTelemetry.get(name)?.lastOutcome || '',
        lastUsedAt: routeTelemetry.get(name)?.lastUsedAt || '',
      })),
    };
  }

  async function completeJson({ systemPrompt, userPayload, maxTokens = 1800, temperature = 0.15, profile = 'chat' }) {
    await pace(profile);
    const errors = [];
    const order = orderFor(profile);

    for (const name of order) {
      const config = configs[name];
      if (!config?.apiKey) continue;
      const blockedMs = Math.max(0, Number(blockedUntil.get(name) || 0) - Date.now());
      if (blockedMs > 0) {
        errors.push({ provider: config.provider, model: config.model, message: `${name}: cooling down`, status: 429, retryAfterMs: blockedMs });
        continue;
      }

      try {
        const result = await callProvider({ config, systemPrompt, userPayload, maxTokens, temperature, timeoutMs });
        recordTelemetry(name, profile, result, 'ok');
        return result;
      } catch (error) {
        if (error.name === 'AbortError') {
          recordTelemetry(name, profile, {}, 'timeout');
          errors.push({ provider: config.provider, model: config.model, message: `${name}: timeout`, status: 408, retryAfterMs: 0 });
          continue;
        }
        recordTelemetry(name, profile, error, Number(error.status || 0) === 429 ? 'rate_limit' : 'error');
        const item = {
          provider: config.provider,
          model: config.model,
          message: error.message,
          status: Number(error.status || 0),
          retryAfterMs: Number(error.retryAfterMs || 0),
        };
        errors.push(item);
        if (item.status === 429) {
          const cooldown = item.retryAfterMs > 0 ? item.retryAfterMs : 60000;
          blockedUntil.set(name, Date.now() + cooldown);
        }
      }
    }

    const configured = order.filter((name) => Boolean(configs[name]?.apiKey));
    if (!configured.length) throw new Error('No free AI provider is configured. Add GROQ_API_KEY or GEMINI_API_KEY.');

    const rateLimited = errors.length > 0 && errors.every((item) => item.status === 429);
    const retryMs = soonestRetry(errors);
    const error = new Error(rateLimited
      ? `AI capacity is temporarily exhausted across the configured model pool.${retryMs ? ` Retry in about ${Math.max(1, Math.ceil(retryMs / 60000))} min.` : ''}`
      : `All configured AI routes failed (${errors.map((item) => `${item.provider}/${item.model}: ${item.status || 'error'}`).join(', ')}).`);
    error.providerErrors = errors;
    error.status = rateLimited ? 429 : errors[0]?.status || 500;
    error.retryAfterMs = retryMs;
    throw error;
  }

  return { status, completeJson };
}
