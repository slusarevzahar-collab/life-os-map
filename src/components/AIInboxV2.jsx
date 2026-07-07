import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchInboxAssets, patchSignal, reprocessInboxSignals } from '../lib/lifeMapRuntime.js';
import { listItems } from '../lib/lifeMapSelectors.js';
import { ChevronDown } from './ChevronDown.jsx';
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
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
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
  };
}

function flattenAssets(signals = []) {
  return signals.flatMap((signal) => (Array.isArray(signal.assets) ? signal.assets : []).map((asset, index) => ({
    ...asset,
    category: String(asset.category || 'Другое').trim() || 'Другое',
    sourceSignal: signal,
    key: [signal.id, asset.kind, asset.category, asset.title, index].join('|'),
  })));
}

function PromptModal({ asset, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!asset) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(asset.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="assetModalBackdrop" onClick={onClose}>
      <div className="assetModal" onClick={(event) => event.stopPropagation()}>
        <div className="assetModalHead"><div><small>Промпт</small><h3>{asset.title}</h3></div><button onClick={onClose}>Закрыть</button></div>
        <pre className="promptCopyBox">{asset.content}</pre>
        <div className="assetModalActions"><button className="primaryAssetButton" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать'}</button>{asset.url ? <button onClick={() => openExternal(asset.url)}>Открыть ресурс</button> : null}</div>
      </div>
    </div>
  );
}

function AssetRow({ asset, expanded, onToggle, onOpenPrompt, entering }) {
  const source = asset.sourceSignal || {};
  const directUrl = asset.url || source.sourceUrl || '';
  return (
    <article className={`compactInboxRow ${expanded ? 'expanded' : ''} ${entering ? 'inboxEntering' : ''}`}>
      <button className="compactInboxMain" onClick={onToggle}>
        <span className="compactInboxBadge">{asset.category || 'Другое'}</span>
        <span className="compactInboxText"><b>{asset.title || 'Без названия'}</b><small>{asset.description || source.title || asset.kind}</small></span>
        <ChevronDown open={expanded} />
      </button>
      {expanded ? <div className="compactInboxDetails">
        {asset.description ? <div><small>Что это</small><p>{asset.description}</p></div> : null}
        {asset.suggestedUse ? <div><small>Где применить</small><p>{asset.suggestedUse}</p></div> : null}
        <div className="compactInboxSource">Источник: {source.title || 'исходный сигнал'}{source.capturedAt ? ` · ${formatDate(source.capturedAt)}` : ''}</div>
        <div className="assetCardActions">
          {asset.kind === 'Prompt' && asset.content ? <button className="primaryAssetButton" onClick={() => onOpenPrompt(asset)}>Посмотреть промпт</button> : null}
          {directUrl ? <button onClick={() => openExternal(directUrl)}>{asset.url ? 'Открыть ресурс' : 'Исходный пост'}</button> : null}
          <button onClick={() => openAssistantForSignal(source)}>Чат с AI</button>
        </div>
      </div> : null}
    </article>
  );
}

function SignalRow({ signal, expanded, onToggle, statusOverride, busy, onStatus, entering }) {
  const status = statusOverride || signal.status || 'Inbox';
  const processed = processedSignal(status);
  return (
    <article className={`compactInboxRow ${expanded ? 'expanded' : ''} ${entering ? 'inboxEntering' : ''}`}>
      <button className="compactInboxMain" onClick={onToggle}>
        <span className="compactInboxBadge">{signal.type || 'Signal'}</span>
        <span className="compactInboxText"><b>{signal.title}</b><small>{[signal.priority, formatDate(signal.capturedAt)].filter(Boolean).join(' · ')}</small></span>
        <ChevronDown open={expanded} />
      </button>
      {expanded ? <div className="compactInboxDetails">
        {signal.summary ? <div><small>Оригинальный текст / содержание</small><p className="fullSignalText">{signal.summary}</p></div> : null}
        {signal.assistantNote ? <div><small>Комментарий AI</small><p>{signal.assistantNote}</p></div> : null}
        {signal.possibleUse ? <div><small>Как применить</small><p>{signal.possibleUse}</p></div> : null}
        <div className="assetCardActions">
          {signal.sourceUrl ? <button onClick={() => openExternal(signal.sourceUrl)}>Открыть источник</button> : null}
          <button onClick={() => openAssistantForSignal(signal)}>Чат с AI</button>
          {processed ? <button disabled={busy} onClick={() => onStatus(signal, 'New')}>{busy ? '…' : 'Вернуть'}</button> : <><button className="primaryAssetButton" disabled={busy} onClick={() => onStatus(signal, 'Reviewed')}>{busy ? '…' : 'Разобрано'}</button><button disabled={busy} onClick={() => onStatus(signal, 'Archived')}>Архив</button></>}
        </div>
      </div> : null}
    </article>
  );
}

export function AIInboxV2({ map }) {
  const [tab, setTab] = useState('new');
  const [category, setCategory] = useState('all');
  const [signals, setSignals] = useState([]);
  const signalsRef = useRef([]);
  const [localStatus, setLocalStatus] = useState({});
  const [expandedKey, setExpandedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busySignalId, setBusySignalId] = useState('');
  const [reprocessing, setReprocessing] = useState(false);
  const [promptAsset, setPromptAsset] = useState(null);
  const [enteringIds, setEnteringIds] = useState(new Set());

  const mapSignals = useMemo(() => listItems(map).filter((item) => item.kind === 'signal').map(normalizeSignalFromMap), [map]);

  const loadSignals = async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    try {
      const rows = await fetchInboxAssets();
      const next = rows.length ? rows : mapSignals;
      const previousIds = new Set(signalsRef.current.map((item) => item.id));
      const added = next.filter((item) => !previousIds.has(item.id)).map((item) => item.id);
      signalsRef.current = next;
      setSignals(next);
      if (!initial && added.length) {
        setEnteringIds(new Set(added));
        setTimeout(() => setEnteringIds(new Set()), 900);
      }
      setError('');
    } catch (err) {
      if (!signalsRef.current.length) {
        signalsRef.current = mapSignals;
        setSignals(mapSignals);
      }
      setError(`Не удалось обновить AI Inbox: ${err.message}`);
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals({ initial: true });
    const timer = window.setInterval(() => loadSignals({ initial: false }), 15000);
    return () => window.clearInterval(timer);
  }, [map?.id]);

  useEffect(() => { setCategory('all'); setExpandedKey(''); }, [tab]);

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
  const tabAssets = currentTab.kind ? allAssets.filter((asset) => asset.kind === currentTab.kind) : [];
  const categories = [...new Set(tabAssets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const visibleAssets = category === 'all' ? tabAssets : tabAssets.filter((asset) => asset.category === category);
  const visibleSignals = signals.filter((signal) => tab === 'done' ? processedSignal(localStatus[signal.id] || signal.status) : !processedSignal(localStatus[signal.id] || signal.status));
  const missingAssets = signals.filter((signal) => !Array.isArray(signal.assets) || signal.assets.length === 0).length;

  const updateStatus = async (signal, status) => {
    setBusySignalId(signal.id);
    try {
      const nextAction = status === 'Reviewed' ? 'Сигнал разобран вручную в LifeMap.' : status === 'Archived' ? 'Сигнал отправлен в архив LifeMap AI Inbox.' : 'Сигнал возвращён во входящие LifeMap AI Inbox.';
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
    setReprocessing(true);
    setError('');
    setNotice(`Переразбираю ${missingAssets} старых сигналов…`);
    try {
      const response = await reprocessInboxSignals({ secret: readSecret(), limit: 50, onlyMissing: true });
      const result = response.result || {};
      setNotice(`Готово: обработано ${result.processed || 0}, ошибок ${result.failed || 0}.`);
      await loadSignals({ initial: false });
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
      <div className="sideListHead inboxHead inboxV2Head"><div><small>AI Inbox · библиотека сигналов</small><strong>{map.title}</strong></div>{missingAssets > 0 ? <button className="reprocessButton" disabled={reprocessing} onClick={reprocess}>{reprocessing ? 'Разбираю…' : `Переразобрать · ${missingAssets}`}</button> : null}</div>
      <div className="inboxCategoryTabs">{TABS.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}<span>{counts[item.id] || 0}</span></button>)}</div>
      {assetMode && categories.length ? <div className="assetSubtabs"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Все <span>{tabAssets.length}</span></button>{categories.map((name) => <button key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}<span>{tabAssets.filter((asset) => asset.category === name).length}</span></button>)}</div> : null}
      {notice ? <div className="inboxNotice">{notice}</div> : null}
      {error ? <div className="inboxError">{error}</div> : null}
      {loading ? <div className="emptySide"><b>Загружаю AI Inbox…</b></div> : null}
      {!loading && assetMode ? <div className="compactInboxList">{visibleAssets.length ? visibleAssets.map((asset) => <AssetRow key={asset.key} asset={asset} expanded={expandedKey === asset.key} onToggle={() => setExpandedKey((key) => key === asset.key ? '' : asset.key)} onOpenPrompt={setPromptAsset} entering={enteringIds.has(asset.sourceSignal?.id)} />) : <div className="emptySide"><b>Здесь пока пусто</b><p>{missingAssets ? 'Старые сигналы ещё не переразобраны.' : 'В этой категории пока нет элементов.'}</p></div>}</div> : null}
      {!loading && !assetMode ? <div className="compactInboxList">{visibleSignals.length ? visibleSignals.map((signal) => <SignalRow key={signal.id} signal={signal} expanded={expandedKey === signal.id} onToggle={() => setExpandedKey((key) => key === signal.id ? '' : signal.id)} statusOverride={localStatus[signal.id]} busy={busySignalId === signal.id} onStatus={updateStatus} entering={enteringIds.has(signal.id)} />) : <div className="emptySide"><b>Здесь пока пусто</b><p>{tab === 'done' ? 'Разобранные сигналы появятся здесь.' : 'Новые сигналы из Telegram появятся во входящих.'}</p></div>}</div> : null}
      <PromptModal asset={promptAsset} onClose={() => setPromptAsset(null)} />
    </aside>
  );
}
