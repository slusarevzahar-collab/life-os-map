import { createAiProviderRouter } from './aiProviderRouter.js';
import { buildAssistantSystemPrompt, buildInboxSystemPrompt } from './aiPrompts.js';
import { AI_POLICY_VERSION, EXECUTABLE_ACTIONS, PLANNING_ACTIONS } from './lifemapAiPolicy.js';
import { buildSafeInboxPayload, compactForAssistant, sanitizeTextForAi } from './aiPrivacy.js';

const ALL_ACTIONS = new Set([...EXECUTABLE_ACTIONS, ...PLANNING_ACTIONS]);
const EXECUTABLE = new Set(EXECUTABLE_ACTIONS);
const SIGNAL_TYPES = new Set(['Idea', 'Tool', 'Research', 'News', 'Reference', 'Task candidate', 'Personal note', 'Telegram']);
const PRIORITIES = new Set(['High', 'Normal', 'Low']);
const ASSET_KINDS = new Set(['Prompt', 'Tool', 'Workflow', 'Task', 'Research', 'Idea', 'Reference', 'News', 'Instruction', 'File', 'Other']);

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]); } catch { return {}; }
  }
}

function payloadString(value) {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value)); }
    catch { return JSON.stringify({ note: sanitizeTextForAi(value, 1000) }); }
  }
  return JSON.stringify(value && typeof value === 'object' ? value : {});
}

function normalizeAssistantResponse(rawValue, meta = {}) {
  const raw = parseJson(rawValue);
  const proposedActions = (Array.isArray(raw.proposedActions) ? raw.proposedActions : [])
    .filter((action) => action && ALL_ACTIONS.has(String(action.type || action.name || '')))
    .slice(0, 3)
    .map((action) => {
      const type = String(action.type || action.name || '');
      const risk = String(action.risk || '').toLowerCase();
      return {
        type,
        title: sanitizeTextForAi(action.title || type, 240),
        payload: payloadString(action.payload),
        requiresConfirmation: EXECUTABLE.has(type) ? true : action.requiresConfirmation !== false,
        risk: ['low', 'medium', 'high'].includes(risk) ? risk : 'medium',
      };
    });

  return {
    reply: sanitizeTextForAi(raw.reply || 'Не удалось сформировать содержательный ответ.', 4000),
    summary: sanitizeTextForAi(raw.summary || '', 1000),
    proposedActions,
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).map((item) => sanitizeTextForAi(item, 400)).filter(Boolean).slice(0, 8),
    nextStep: sanitizeTextForAi(raw.nextStep || '', 800),
    provider: meta.provider || 'none',
    model: meta.model || '',
    policyVersion: AI_POLICY_VERSION,
  };
}

function assetIdentity(asset = {}) {
  return [asset.kind, asset.category, asset.title, asset.url, asset.content].map((value) => String(value || '').trim().toLowerCase()).join('|');
}

function normalizeAssets(rawAssets = []) {
  const seen = new Set();
  return (Array.isArray(rawAssets) ? rawAssets : [])
    .map((asset) => {
      const kind = ASSET_KINDS.has(String(asset?.kind || '')) ? String(asset.kind) : '';
      if (!kind) return null;
      return {
        kind,
        category: sanitizeTextForAi(asset.category || 'Другое', 80) || 'Другое',
        title: sanitizeTextForAi(asset.title || kind, 140),
        description: sanitizeTextForAi(asset.description || '', 900),
        content: sanitizeTextForAi(asset.content || '', 6000),
        url: sanitizeTextForAi(asset.url || '', 1200),
        suggestedUse: sanitizeTextForAi(asset.suggestedUse || '', 900),
      };
    })
    .filter(Boolean)
    .filter((asset) => {
      const identity = assetIdentity(asset);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice(0, 40);
}

function normalizeInboxAnalysis(rawValue, availableProjects = [], meta = {}) {
  const raw = parseJson(rawValue);
  const allowed = new Map(availableProjects.map((name) => [String(name).toLowerCase(), name]));
  const confidence = Number(raw.confidence);
  return {
    title: sanitizeTextForAi(raw.title, 90),
    type: SIGNAL_TYPES.has(raw.type) ? raw.type : 'Telegram',
    priority: PRIORITIES.has(raw.priority) ? raw.priority : 'Normal',
    relatedProjects: (Array.isArray(raw.relatedProjects) ? raw.relatedProjects : [])
      .map((name) => allowed.get(String(name).toLowerCase())).filter(Boolean).slice(0, 6),
    summary: sanitizeTextForAi(raw.summary, 5000),
    assistantNote: sanitizeTextForAi(raw.assistantNote, 1800),
    possibleUse: sanitizeTextForAi(raw.possibleUse, 1800),
    nextAction: sanitizeTextForAi(raw.nextAction, 900),
    shouldCreateTask: raw.shouldCreateTask === true,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).map((item) => sanitizeTextForAi(item, 400)).filter(Boolean).slice(0, 6),
    assets: normalizeAssets(raw.assets),
    provider: meta.provider || 'none',
    model: meta.model || '',
    policyVersion: AI_POLICY_VERSION,
  };
}

function fallbackAssistant() {
  return {
    reply: 'AI-провайдер пока не подключён. LifeMap продолжает работать без AI. Для бесплатного режима достаточно добавить GROQ_API_KEY или GEMINI_API_KEY и перезапустить API.',
    summary: '',
    proposedActions: [],
    warnings: ['AI provider is not configured.'],
    nextStep: 'Подключить один бесплатный API-ключ: Groq или Gemini.',
    provider: 'deterministic-fallback',
    model: '',
    policyVersion: AI_POLICY_VERSION,
  };
}

function providerLabel(provider = '') {
  if (provider === 'groq') return 'Groq';
  if (provider === 'gemini') return 'Gemini';
  return provider;
}

export function createLifeMapAiService(env = process.env) {
  const router = createAiProviderRouter(env);

  function status() {
    const providerStatus = router.status();
    const activeProvider = providerStatus.providers.find((provider) => provider.configured) || null;
    const configured = Boolean(activeProvider);
    const groqModels = providerStatus.providers.filter((provider) => provider.configured && provider.provider === 'groq').length;
    return {
      configured,
      provider: activeProvider?.provider || '',
      model: activeProvider
        ? groqModels > 1
          ? `Groq pool · ${groqModels} модели`
          : `${providerLabel(activeProvider.provider)} · ${activeProvider.model}`
        : '',
      policyVersion: AI_POLICY_VERSION,
      providerOrder: providerStatus.order,
      providerProfiles: providerStatus.profiles,
      providers: providerStatus.providers,
      privacy: {
        minimalContext: true,
        secretRedaction: true,
        untrustedInboxContent: true,
        promptResponseLogging: false,
      },
      executableActions: EXECUTABLE_ACTIONS,
      planningActions: PLANNING_ACTIONS,
    };
  }

  async function chat({ message, messages = [], target = {}, clientContext = {}, snapshot = {} }) {
    if (!status().configured) return fallbackAssistant();
    const safeHistory = messages.slice(-6).map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeTextForAi(item.content || item.text || '', 900),
    }));
    const userPayload = {
      message: sanitizeTextForAi(message, 3200),
      recentConversation: safeHistory,
      clientContext: {
        screen: sanitizeTextForAi(clientContext.screen, 120),
        selectedView: sanitizeTextForAi(clientContext.selectedView, 120),
      },
      lifemap: compactForAssistant(snapshot, target),
    };
    const result = await router.completeJson({
      profile: 'chat',
      systemPrompt: buildAssistantSystemPrompt(),
      userPayload,
      maxTokens: 1200,
      temperature: 0.2,
    });
    return normalizeAssistantResponse(result.text, result);
  }

  async function analyzeInboxSignal({ signal, snapshot = {} }) {
    if (!status().configured) {
      return {
        ...signal,
        assets: Array.isArray(signal.assets) ? signal.assets : [],
        assistantNote: signal.assistantNote || 'Сигнал сохранён без внешнего AI-разбора. Эвристическая классификация сохранена.',
        aiProcessing: { provider: 'deterministic-fallback', policyVersion: AI_POLICY_VERSION },
      };
    }
    const safePayload = buildSafeInboxPayload(signal, snapshot);
    const result = await router.completeJson({
      profile: 'inbox',
      systemPrompt: buildInboxSystemPrompt(safePayload.availableProjects),
      userPayload: safePayload,
      maxTokens: 1800,
      temperature: 0.1,
    });
    const analysis = normalizeInboxAnalysis(result.text, safePayload.availableProjects, result);
    return {
      ...signal,
      title: analysis.title || signal.title,
      type: analysis.type || signal.type,
      priority: analysis.priority || signal.priority,
      relatedProjects: analysis.relatedProjects.length ? analysis.relatedProjects : signal.relatedProjects,
      summary: analysis.summary || signal.summary,
      assistantNote: analysis.assistantNote,
      possibleUse: analysis.possibleUse || signal.possibleUse,
      nextAction: analysis.nextAction || '',
      taskRecommendation: analysis.shouldCreateTask,
      assets: analysis.assets,
      aiProcessing: {
        provider: analysis.provider,
        model: analysis.model,
        confidence: analysis.confidence,
        warnings: analysis.warnings,
        policyVersion: analysis.policyVersion,
      },
    };
  }

  return { status, chat, analyzeInboxSignal };
}
