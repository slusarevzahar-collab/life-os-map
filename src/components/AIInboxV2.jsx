import { useEffect, useMemo, useState } from 'react';
import { fetchInboxAssets, patchSignal, reprocessInboxSignals } from '../lib/lifeMapRuntime.js';
import { listItems } from '../lib/lifeMapSelectors.js';
import '../ai-inbox-v2.css';

const TABS = [
  { id: 'new', label: 'Входящие' },
  { id: 'prompts', label: 'Промпты', kind: 'Prompt' },
  { id: 'tools', label: 'Инструменты', kind: 'Tool' },
  { id: 'workflow', label: 'Workflow', kind: 'Workflow' },
  { id: 'tasks', label: 'В задачи', kind: 'Task' },
  { id: 'done', label: 'Разобрано' },
];

const SECRET_KEY = 'lifemap.assistant.writeSecret.session';

function processedSignal(status = '') {
  return /reviewed|processed|archived|done|обработ|разобран|архив|готов/i.test(String(status || ''));
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function readSecret() {
  try { return window.sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
}

function openExternal(url = '') {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openAssistantForSignal(signal) {
  const target = {
    id: `signal-${signal.id}`,
    sourceId: signal.id,
    title: signal.title,
    status: signal.status,
    kind: 'signal',
    raw: signal,
  };
  window.dispatchEvent(new CustomEvent('lifemap:assistant-target', { detail: { target, context: { mode: 'signal' } } }));
}

function normalizeSignalFromMap(item) {
  const raw = item?.raw || {};
  return {
    id: item?.sourceId || raw.id || item?.id,
    title: item?.title || raw.title || 'Сигнал',
    type: raw.type || '',
    status: item?.status || raw.status || 'Inbox',
    priority: raw.priority || '',
    relatedProjects: raw.relatedProjects || [],
    summary: raw.summary || item?.summary || '',
    assistantNote: raw.assistantNote || '',
    possibleUse: raw.possibleUse || '',
    nextAction: raw.nextAction || '',
    sourceUrl: raw.sourceUrl || '',
    capturedAt: raw.capturedAt || '',
    assets: Array.isArray(raw.assets) ? raw.assets : [],
    aiProcessingVersion: raw.aiProcessingVersion || '',
  };
}

function flattenAssets(signals = []) {
  const seen = new Set();
  const rows = [];
  signals.forEach((signal) => {
    (Array.isArray(signal.assets) ? signal.assets : []).forEach((asset, index) => {
      const key = [signal.id, asset.kind, asset.category, asset.title, asset.url, index].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        ...asset,
        category: String(asset.category || 'Другое').trim() || 'Другое',
        sourceSignal: signal,
        key,
      });
    });
  });
  return rows;
}

function PromptModal({ asset, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!asset) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asset.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="assetModalBackdrop" onClick={onClose}>
      <div className="assetModal" onClick={(event) => event.stopPropagation()}>
        <div className="assetModalHead">
          <div><small>Промпт</small><h3>{asset.title}</h3></div>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>
        <pre className="promptCopyBox">{asset.content}</pre>
        <div className="assetModalActions">
          <button className="primaryAssetButton" type="button" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать'}</button>
          {asset.url ? <button type="button" onClick={() => openExternal(asset.url)}>Открыть ресурс</button> : null}
        </div>
      </div>
    </div>
  );
}

function AssetCard({ asset, onOpenPrompt }) {
  const source = asset.sourceSignal || {};
  const directUrl = asset.url || source.sourceUrl || '';
  return (
    <article className="inboxAssetCard">
      <div className="assetCardTopline">
        <span>{asset.category || 'Другое'}</span>
        <small>{asset.kind}</small>
      </div>
      <h3>{asset.title || 'Без названия'}</h3>
      {asset.description ? <p>{asset.description}</p> : null}
      {asset.suggestedUse ? <div className="assetSuggestion"><small>Где применить</small><p>{asset.suggestedUse}</p></div> : null}
      <div className="assetSourceLine">Из: {source.title || 'исходного сигнала'}{source.capturedAt ? ` · ${formatDate(source.capturedAt)}` : ''}</div>
      <div className="assetCardActions">
        {asset.kind === 'Prompt' && asset.content ? <button className="primaryAssetButton" type="button" onClick={() => onOpenPrompt(asset)}>Посмотреть промпт</button> : null}
        {directUrl ? <button type="button" onClick={() => openExternal(directUrl)}>{asset.url ? 'Открыть ресурс' : 'Исходный пост'}</button> : null}
        <button type="button" onClick={() => openAssistantForSignal(source)}>Чат с AI</button>
      </div>
    </article>
  );
}

function SignalCard({ signal, statusOverride, busy, onStatus }) {
  const status = statusOverride || signal.status || 'Inbox';
  const processed = processedSignal(status);
  return (
    <article className="inboxSourceCard">
      <div className="sourceCardTopline">
        <span>{signal.type || 'Signal'}</span>
        <small>{[signal.priority, formatDate(signal.capturedAt)].filter(Boolean).join(' · ')}</small>
      </div>
      <h3>{signal.title}</h3>
      {signal.summary ? <p>{signal.summary}</p> : null}
      {signal.assistantNote ? <div className="sourceAiNote"><small>AI</small><p>{signal.assistantNote}</p></div> : null}
      <div className="assetCardActions">
        {signal.sourceUrl ? <button type="button" onClick={() => openExternal(signal.sourceUrl)}>Источник</button> : null}
        <button type="button" onClick={() => openAssistantForSignal(signal)}>Чат с AI</button>
        {processed
          ? <button type="button" disabled={busy} onClick={() => onStatus(signal, 'New')}>{busy ? '…' : 'Вернуть'}</button>
          : <>
            <button className="primaryAssetButton" type="button" disabled={busy} onClick={() => onStatus(signal, 'Reviewed')}>{busy ? '…' : 'Разобрано'}</button>
            <button type="button" disabled={busy} onClick={() => onStatus(signal, 'Archived')}>Архив</button>
          </>}
      </div>
    </article>
  );
}

export function AIInboxV2({ map }) {
  const [tab, setTab] = useState('new');
  const [category, setCategory] = useState('all');
  const [signals, setSignals] = useState([]);
  const [localStatus, setLocalStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busySignalId, setBusySignalId] = useState('');
  const [reprocessing, setReprocessing] = useState(false);
  const [promptAsset, setPromptAsset] = useState(null);

  const mapSignals = useMemo(() => listItems(map).filter((item) => item.kind === 'signal').map(normalizeSignalFromMap), [map]);

  const loadSignals = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchInboxAssets();
      setSignals(rows.length ? rows : mapSignals);
    } catch (err) {
      setSignals(mapSignals);
      setError(`Не удалось загрузить извлечённые элементы: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSignals(); }, [map]);
  useEffect(() => { setCategory('all'); }, [tab]);

  const allAssets = useMemo(() => flattenAssets(signals), [signals]);
  const counts = useMemo(() => ({
    new: signals.filter((signal) => !processedSignal(localStatus[signal.id] || signal.status)).length,
    done: signals.filter((signal) => processedSignal(localStatus[signal.id] || signal.status)).length,
    prompts: allAssets.filter((asset) => asset.kind === 'Prompt').length,
    tools: allAssets.filter((asset) => asset.kind === 'Tool').length,
    workflow: allAssets.filter((asset) => asset.kind === 'Workflow').length,
    tasks: allAssets.filter((asset) => asset.kind === 'Task').length,
  }), [signals, allAssets, localStatus]);

  const currentTab = TABS.find((item) => item.id === tab) || TABS[0];
  const tabAssets = useMemo(() => currentTab.kind ? allAssets.filter((asset) => asset.kind === currentTab.kind) : [], [allAssets, currentTab.kind]);
  const categories = useMemo(() => [...new Set(tabAssets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [tabAssets]);
  const visibleAssets = useMemo(() => category === 'all' ? tabAssets : tabAssets.filter((asset) => asset.category === category), [tabAssets, category]);
  const visibleSignals = useMemo(() => signals.filter((signal) => tab === 'done'
    ? processedSignal(localStatus[signal.id] || signal.status)
    : !processedSignal(localStatus[signal.id] || signal.status)), [signals, tab, localStatus]);
  const missingAssets = useMemo(() => signals.filter((signal) => !Array.isArray(signal.assets) || signal.assets.length === 0).length, [signals]);

  const updateStatus = async (signal, status) => {
    setBusySignalId(signal.id);
    setError('');
    try {
      const nextAction = status === 'Reviewed'
        ? 'Сигнал разобран вручную в LifeMap.'
        : status === 'Archived'
          ? 'Сигнал отправлен в архив LifeMap AI Inbox.'
          : 'Сигнал возвращён во входящие LifeMap AI Inbox.';
      await patchSignal(signal.id, { status, nextAction });
      setLocalStatus((state) => ({ ...state, [signal.id]: status }));
      setNotice(status === 'New' ? 'Сигнал возвращён во входящие.' : 'Статус сохранён в Notion.');
      setTimeout(() => setNotice(''), 2200);
    } catch (err) {
      setError(`Не удалось изменить статус: ${err.message}`);
    } finally {
      setBusySignalId('');
    }
  };

  const reprocess = async () => {
    const secret = readSecret();
    if (!secret) {
      setError('Для переразбора старых сигналов сначала сохрани secret в настройках AI Assistant.');
      return;
    }
    setReprocessing(true);
    setError('');
    setNotice(`Переразбираю ${missingAssets} сигналов без извлечённых элементов…`);
    try {
      const response = await reprocessInboxSignals({ secret, limit: 50, onlyMissing: true });
      const result = response.result || {};
      setNotice(`Готово: обработано ${result.processed || 0}, ошибок ${result.failed || 0}.`);
      await loadSignals();
    } catch (err) {
      setError(`Переразбор не выполнен: ${err.message}`);
      setNotice('');
    } finally {
      setReprocessing(false);
    }
  };

  const assetMode = Boolean(currentTab.kind);

  return (
    <aside className="sideList inboxPanel inboxV2Panel" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead inboxHead inboxV2Head">
        <div><small>AI Inbox · библиотека сигналов</small><strong>{map.title}</strong></div>
        {missingAssets > 0 ? <button className="reprocessButton" type="button" disabled={reprocessing} onClick={reprocess}>{reprocessing ? 'Разбираю…' : `Переразобрать старые · ${missingAssets}`}</button> : null}
      </div>

      <div className="inboxCategoryTabs">{TABS.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}<span>{counts[item.id] || 0}</span></button>)}</div>

      {assetMode && categories.length ? <div className="assetSubtabs">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Все <span>{tabAssets.length}</span></button>
        {categories.map((name) => <button key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}<span>{tabAssets.filter((asset) => asset.category === name).length}</span></button>)}
      </div> : null}

      {notice ? <div className="inboxNotice">{notice}</div> : null}
      {error ? <div className="inboxError">{error}</div> : null}
      {loading ? <div className="emptySide"><b>Загружаю AI Inbox…</b></div> : null}

      {!loading && assetMode ? (
        visibleAssets.length
          ? <div className="assetGrid">{visibleAssets.map((asset) => <AssetCard key={asset.key} asset={asset} onOpenPrompt={setPromptAsset} />)}</div>
          : <div className="emptySide"><b>Здесь пока пусто</b><p>{missingAssets ? 'Часть старых сигналов ещё не переразобрана на отдельные элементы.' : 'В этой категории пока нет извлечённых элементов.'}</p></div>
      ) : null}

      {!loading && !assetMode ? (
        visibleSignals.length
          ? <div className="assetGrid sourceSignalGrid">{visibleSignals.map((signal) => <SignalCard key={signal.id} signal={signal} statusOverride={localStatus[signal.id]} busy={busySignalId === signal.id} onStatus={updateStatus} />)}</div>
          : <div className="emptySide"><b>Здесь пока пусто</b><p>{tab === 'done' ? 'Разобранные сигналы появятся здесь.' : 'Новые сигналы из Telegram появятся во входящих.'}</p></div>
      ) : null}

      <PromptModal asset={promptAsset} onClose={() => setPromptAsset(null)} />
    </aside>
  );
}
