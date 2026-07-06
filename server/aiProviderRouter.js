const DEFAULT_TIMEOUT_MS = 22000;

function providerConfigs(env = process.env) {
  return {
    groq: {
      provider: 'groq',
      apiKey: env.GROQ_API_KEY || '',
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      useJsonObjectMode: true,
      authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    },
    gemini: {
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY || '',
      model: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      useJsonObjectMode: false,
      authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    },
  };
}

function providerOrder(env = process.env) {
  const requested = String(env.AI_PROVIDER_ORDER || 'groq,gemini')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(requested)].filter((name) => ['groq', 'gemini'].includes(name));
}

function extractText(data = {}) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('\n').trim();
  return '';
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

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const message = data.error?.message || `HTTP ${response.status}`;
      throw new Error(`${config.provider}: ${message}`);
    }
    const text = extractText(data);
    if (!text) throw new Error(`${config.provider}: empty response`);
    return { text, provider: config.provider, model: data.model || config.model };
  } finally {
    clearTimeout(timer);
  }
}

export function createAiProviderRouter(env = process.env) {
  const configs = providerConfigs(env);
  const order = providerOrder(env);
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  function status() {
    return {
      order,
      providers: order.map((name) => ({
        provider: name,
        configured: Boolean(configs[name]?.apiKey),
        model: configs[name]?.model || '',
      })),
    };
  }

  async function completeJson({ systemPrompt, userPayload, maxTokens = 1800, temperature = 0.15 }) {
    const errors = [];
    for (const name of order) {
      const config = configs[name];
      if (!config?.apiKey) continue;
      try {
        return await callProvider({ config, systemPrompt, userPayload, maxTokens, temperature, timeoutMs });
      } catch (error) {
        errors.push(error.name === 'AbortError' ? `${name}: timeout` : error.message);
      }
    }
    const configured = order.filter((name) => Boolean(configs[name]?.apiKey));
    if (!configured.length) throw new Error('No free AI provider is configured. Add GROQ_API_KEY or GEMINI_API_KEY.');
    throw new Error(`All configured AI providers failed: ${errors.join(' | ')}`);
  }

  return { status, completeJson };
}
