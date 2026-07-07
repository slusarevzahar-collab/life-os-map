import { useEffect, useMemo, useRef, useState } from 'react';
import {
  attachmentDownloadUrl,
  fetchInboxAssets,
  fetchInboxReprocessStatus,
  patchSignal,
  reprocessInboxSignals,
} from '../lib/lifeMapRuntime.js';
import { listItems } from '../lib/lifeMapSelectors.js';
import { ChevronDown } from './ChevronDown.jsx';
import '../ai-inbox-v2.css';

const MATERIAL_KINDS = ['Research', 'Reference', 'News', 'Instruction', 'File', 'Other'];

const TABS = [
  { id: 'new', label: 'Входящие' },
  { id: 'prompts', label: 'Промпты', kinds: ['Prompt'] },
  { id: 'tools', label: 'Инструменты', kinds: ['Tool'] },
  { id: 'workflow', label: 'Workflow', kinds: ['Workflow'] },
  { id: 'ideas', label: 'Идеи', kinds: ['Idea'] },
  { id: 'materials', label: 'Материалы', kinds: MATERIAL_KINDS },
  { id: 'tasks', label: 'В задачи', kinds: ['Task'] },
  { id: 'done', label: 'Разобрано' },
];

const SECRET_KEY = 'lifemap.assistant.writeSecret.session';
const FILE_NAME_PATTERN = /\.(pdf|md|txt|docx?|xlsx?|pptx?|csv|json|zip|html?)$/i;

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

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

function readSecret() {
  try { return window.sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
}

function openExternal(url = '') {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function inferredAttachment(signal = {}) {
  if (signal.attachment?.fileName) return signal.attachment;
  if (FILE_NAME_PATTERN.test(String(signal.title || '').trim())) {
    return { fileName: signal.title, mimeType: '', fileSize: 0, inferred: true };
  }
  return null;
}

function attachmentLabel(attachment = {}) {
  const name = String(attachment.fileName || '').toLowerCase();
  const mime = String(attachment.mimeType || '').toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf') ? 'Скачать PDF' : 'Скачать файл';
}

function downloadAttachment(signal) {
  const attachment = inferredAttachment(signal);
  if (!attachment || attachment.inferred || !signal.attachment?.fileId) {
    if (signal.sourceUrl) openExternal(signal.sourceUrl);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = attachmentDownloadUrl(signal.id);
  anchor.download = attachment.fileName || 'attachment';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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
    attachment: raw.attachment || null,
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

function AttachmentBlock({ signal }) {
  const attachment = inferredAttachment(signal);
  if (!attachment) return null;
  const canDirectDownload = Boolean(signal.attachment?.fileId);
  return (
    <div className="inboxAttachmentBlock">
      <div className="attachmentMeta">
        <span className="attachmentIcon">FILE</span>
        <span>
          <b>{attachment.fileName}</b>
          <small>{[attachment.mimeType, formatBytes(attachment.fileSize)].filter(Boolean).join(' · ') || (canDirectDownload ? 'Файл из Telegram' : 'Файл в исходном сообщении')}</small>
        </span>
      </div>
      <button type="button" onClick={() => downloadAttachment(signal)}>
        {canDirectDownload ? attachmentLabel(attachment) : 'Открыть источник'}
      </button>
    </div>
  );
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

function AssetRow({ asset, expanded, onToggle, onOpenPrompt, entering }) {
  const source = asset.sourceSignal || {};
  const directUrl = asset.url || source.sourceUrl || '';
  const attachment = inferredAttachment(source);
  return (
    <article className={`compactInboxRow ${expanded ? 'expanded' : ''} ${entering ? 'inboxEntering' : ''}`}>
      <button className="compactInboxMain" type="button" onClick={onToggle}>
        <span className="compactInboxBadge">{asset.category || 'Другое'}</span>
        <span className="compactInboxText">
          <b>{asset.title || 'Без названия'}</b>
          <small>{asset.description || source.title || asset.kind}{attachment ? ` · ${attachment.fileName}` : ''}</small>
        </span>
        <ChevronDown open={expanded} />
      </button>
      {expanded ? <div className="compactInboxDetails">
        {asset.description ? <div><small>Что это</small><p>{asset.description}</p></div> : null}
        {asset.suggestedUse ? <div><small>Где применить</small><p>{asset.suggestedUse}</p></div> : null}
        <AttachmentBlock signal={source} />
        <div className="compactInboxSource">Источник: {source.title || 'исходный сигнал'}{source.capturedAt ? ` · ${formatDate(source.capturedAt)}` : ''}</div>
        <div className="assetCardActions">
          {asset.kind === 'Prompt' && asset.content ? <button className="primaryAssetButton" type="button" onClick={() => onOpenPrompt(asset)}>Посмотреть промпт</button> : null}
          {directUrl ? <button type="button" onClick={() => openExternal(directUrl)}>{asset.url ? 'Открыть ресурс' : 'Исходный пост'}</button> : null}
          <button type="button" onClick={() => openAssistantForSignal(source)}>Чат с AI</button>
        </div>
      </div> : null}
    </article>
  );
}

function SignalRow({ signal, expanded, onToggle, statusOverride, busy, onStatus, entering }) {
  const status = statusOverride || signal.status || 'Inbox';
  const processed = processedSignal(status);
  const attachment = inferredAttachment(signal);
  return (
    <article className={`compactInboxRow ${expanded ? 'expanded' : ''} ${entering ? 'inboxEntering' : ''}`}>
      <button className="compactInboxMain" type="button" onClick={onToggle}>
        <span className="compactInboxBadge">{signal.type || 'Signal'}</span>
        <span className="compactInboxText">
          <b>{signal.title}</b>
          <small>{[signal.priority, formatDate(signal.capturedAt), attachment?.fileName].filter(Boolean).join(' · ')}</small>
        </span>
        <ChevronDown open={expanded} />
      </button>
      {expanded ? <div className="compactInboxDetails">
        {signal.summary ? <div><small>Оригинальный текст / содержание</small><p className="fullSignalText">{signal.summary}</p></div> : null}
        {signal.assistantNote ? <div><small>Комментарий AI</small><p>{signal.assistantNote}</p></div> : null}
        {signal.possibleUse ? <div><small>Как применить</small><p>{signal.possibleUse}</p></div> : null}
        <AttachmentBlock signal={signal} />
        <div className="assetCardActions">
          {signal.sourceUrl ? <button type="button" onClick={() => openExternal(signal.sourceUrl)}>Открыть источник</button> : null}
          <button type="button" onClick={() => openAssistantForSignal(signal)}>Чат с AI</button>
          {processed
            ? <button type="button" disabled={busy} onClick={() => onStatus(signal, 'New')}>{busy ? '…' : 'Вернуть'}</button>
            : <>
              <button className="primaryAssetButton" type="button" disabled={busy} onClick={() => onStatus(signal, 'Reviewed')}>{busy ? '…' : 'Разобрано'}</button>
              <button type="button" disabled={busy} onClick={() => onStatus(signal, 'Archived')}>Архив</button>
            </>}
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
  const [job, setJob] = useState(null);
  const jobRef = useRef(null);
  const lastJobProgressRef = useRef(-1);
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

  const syncJobStatus = async () => {
    try {
      const response = await fetchInboxReprocessStatus();
      const nextJob = response.job || null;
      const previous = jobRef.current;
      jobRef.current = nextJob;
      setJob(nextJob);
      const running = nextJob?.status === 'running';
      setReprocessing(running);

      if (running) {
        const done = Number(nextJob.processed || 0) + Number(nextJob.failed || 0);
        setNotice(`Разбираю сигналы: ${done}/${nextJob.total || '…'}${nextJob.current ? ` · ${nextJob.current}` : ''}`);
        if (done !== lastJobProgressRef.current) {
          lastJobProgressRef.current = done;
          await loadSignals({ initial: false });
        }
      } else if (previous?.status === 'running' && nextJob?.status && nextJob.status !== 'idle') {
        await loadSignals({ initial: false });
        setNotice(`Переразбор завершён: обработано ${nextJob.processed || 0}${nextJob.reused ? `, повторно использовано ${nextJob.reused}` : ''}, ошибок ${nextJob.failed || 0}.`);
      }
    } catch (err) {
      if (jobRef.current?.status === 'running') setError(`Не удалось получить статус переразбора: ${err.message}`);
    }
  };

  useEffect(() => {
    loadSignals({ initial: true });
    syncJobStatus();
    const signalTimer = window.setInterval(() => loadSignals({ initial: false }), 15000);
    const jobTimer = window.setInterval(syncJobStatus, 3000);
    return () => {
      window.clearInterval(signalTimer);
      window.clearInterval(jobTimer);
    };
  }, [map?.id]);

  useEffect(() => { setCategory('all'); setExpandedKey(''); }, [tab]);

  const allAssets = useMemo(() => flattenAssets(signals), [signals]);
  const counts = useMemo(() => ({
    new: signals.filter((signal) => !processedSignal(localStatus[signal.id] || signal.status)).length,
    done: signals.filter((signal) => processedSignal(localStatus[signal.id] || signal.status)).length,
    prompts: allAssets.filter((asset) => asset.kind === 'Prompt').length,
    tools: allAssets.filter((asset) => asset.kind === 'Tool').length,
    workflow: allAssets.filter((asset) => asset.kind === 'Workflow').length,
    ideas: allAssets.filter((asset) => asset.kind === 'Idea').length,
    materials: allAssets.filter((asset) => MATERIAL_KINDS.includes(asset.kind)).length,
    tasks: allAssets.filter((asset) => asset.kind === 'Task').length,
  }), [signals, allAssets, localStatus]);

  const currentTab = TABS.find((item) => item.id === tab) || TABS[0];
  const tabAssets = currentTab.kinds ? allAssets.filter((asset) => currentTab.kinds.includes(asset.kind)) : [];
  const categories = [...new Set(tabAssets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const visibleAssets = category === 'all' ? tabAssets : tabAssets.filter((asset) => asset.category === category);
  const visibleSignals = signals.filter((signal) => tab === 'done'
    ? processedSignal(localStatus[signal.id] || signal.status)
    : !processedSignal(localStatus[signal.id] || signal.status));
  const unprocessedCount = signals.filter((signal) => !signal.aiProcessingVersion).length;
  const jobDone = Number(job?.processed || 0) + Number(job?.failed || 0);
  const jobTotal = Number(job?.total || 0);

  const updateStatus = async (signal, status) => {
    setBusySignalId(signal.id);
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
    setReprocessing(true);
    setError('');
    setNotice(`Запускаю переразбор ${unprocessedCount} сигналов…`);
    try {
      const response = await reprocessInboxSignals({ secret: readSecret(), onlyMissing: true });
      const nextJob = response.job || null;
      jobRef.current = nextJob;
      setJob(nextJob);
      lastJobProgressRef.current = -1;
      await syncJobStatus();
    } catch (err) {
      setError(`Переразбор не запущен: ${err.message}`);
      setNotice('');
      setReprocessing(false);
    }
  };

  const assetMode = Boolean(currentTab.kinds);
  const reprocessLabel = reprocessing
    ? `Обработка ${jobDone}/${jobTotal || '…'}`
    : `Разобрать всё${unprocessedCount ? ` · ${unprocessedCount}` : ''}`;

  return (
    <aside className="sideList inboxPanel inboxV2Panel" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead inboxHead inboxV2Head">
        <div><small>AI Inbox · библиотека сигналов</small><strong>{map.title}</strong></div>
        {(unprocessedCount > 0 || reprocessing) ? <button className="reprocessButton" type="button" disabled={reprocessing} onClick={reprocess}>{reprocessLabel}</button> : null}
      </div>

      <div className="inboxCategoryTabs inboxV2Tabs">
        {TABS.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} type="button" onClick={() => setTab(item.id)}><span className="tabLabel">{item.label}</span><span className="tabCount">{counts[item.id] || 0}</span></button>)}
      </div>

      {assetMode && categories.length ? <div className="assetSubtabs">
        <button className={category === 'all' ? 'active' : ''} type="button" onClick={() => setCategory('all')}>Все <span>{tabAssets.length}</span></button>
        {categories.map((name) => <button key={name} className={category === name ? 'active' : ''} type="button" onClick={() => setCategory(name)}>{name}<span>{tabAssets.filter((asset) => asset.category === name).length}</span></button>)}
      </div> : null}

      {reprocessing && jobTotal > 0 ? <div className="inboxJobProgress"><span style={{ width: `${Math.min(100, (jobDone / jobTotal) * 100)}%` }} /></div> : null}
      {notice ? <div className="inboxNotice">{notice}</div> : null}
      {error ? <div className="inboxError">{error}</div> : null}
      {loading ? <div className="emptySide"><b>Загружаю AI Inbox…</b></div> : null}

      {!loading && assetMode ? <div className="compactInboxList">
        {visibleAssets.length
          ? visibleAssets.map((asset) => <AssetRow key={asset.key} asset={asset} expanded={expandedKey === asset.key} onToggle={() => setExpandedKey((key) => key === asset.key ? '' : asset.key)} onOpenPrompt={setPromptAsset} entering={enteringIds.has(asset.sourceSignal?.id)} />)
          : <div className="emptySide"><b>Здесь пока пусто</b><p>{unprocessedCount ? 'Переразбор ещё идёт или часть старых сигналов пока не обработана.' : 'В этой категории пока нет элементов.'}</p></div>}
      </div> : null}

      {!loading && !assetMode ? <div className="compactInboxList">
        {visibleSignals.length
          ? visibleSignals.map((signal) => <SignalRow key={signal.id} signal={signal} expanded={expandedKey === signal.id} onToggle={() => setExpandedKey((key) => key === signal.id ? '' : signal.id)} statusOverride={localStatus[signal.id]} busy={busySignalId === signal.id} onStatus={updateStatus} entering={enteringIds.has(signal.id)} />)
          : <div className="emptySide"><b>Здесь пока пусто</b><p>{tab === 'done' ? 'Разобранные сигналы появятся здесь.' : 'Новые сигналы из Telegram появятся во входящих.'}</p></div>}
      </div> : null}

      <PromptModal asset={promptAsset} onClose={() => setPromptAsset(null)} />
    </aside>
  );
}
