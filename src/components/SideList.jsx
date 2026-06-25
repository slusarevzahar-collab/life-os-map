import { useEffect, useMemo, useRef, useState } from 'react';
import { isDoneNode, isLeafNode } from '../lib/actionMapModel.js';
import { patchSignal } from '../lib/lifeMapRuntime.js';
import { canPatchTask, listItems } from '../lib/lifeMapSelectors.js';
import { ChevronDown } from './ChevronDown.jsx';

const INBOX_TABS = [
  { id: 'new', label: 'Входящие' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'tools', label: 'Инструменты' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'tasks', label: 'В задачи' },
  { id: 'done', label: 'Разобрано' },
];

function processedSignal(status = '') {
  return /reviewed|processed|archived|done|обработ|разобран|архив|готов/i.test(String(status || ''));
}

function compactCode(value = 'LM') {
  const source = String(value || 'LM').toUpperCase().replace(/\s+/g, '');
  const explicit = source.match(/^([A-ZА-Я]{1,3})-?(\d{1,4})$/);
  if (explicit) return `${explicit[1]}${explicit[2]}`;
  const letters = (source.match(/[A-ZА-Я]{1,3}/)?.[0] || 'LM').slice(0, 3);
  const number = source.match(/\d+/)?.[0] || '1';
  return `${letters}${number}`;
}

function itemCode(item, fallback = 'LM') {
  return compactCode(item.code || item.raw?.code || item.icon || fallback);
}

function progressValue(item) {
  return Math.max(0, Math.min(100, Math.round(Number(item.progress) || 0)));
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function normalize(value = '') {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function nodeHighlighted(item, highlightedItemId) {
  if (!item || !highlightedItemId) return false;
  return item.id === highlightedItemId ||
    item.sourceId === highlightedItemId ||
    `task-${item.sourceId}` === highlightedItemId ||
    `signal-${item.sourceId}` === highlightedItemId;
}

function highlightRowStyle(active) {
  return active ? {
    borderColor: 'rgba(125, 249, 255, 0.78)',
    background: 'rgba(103, 232, 249, 0.14)',
    boxShadow: '0 0 0 1px rgba(103, 232, 249, 0.2), 0 0 34px rgba(103, 232, 249, 0.22)',
    transform: 'translateY(-1px)',
  } : undefined;
}

function textOf(item) {
  const raw = item.raw || {};
  return `${item.title || ''} ${raw.summary || ''} ${item.summary || ''} ${raw.possibleUse || ''} ${raw.nextAction || ''} ${raw.type || ''}`.toLowerCase();
}

function hasAny(source, tokens) {
  return tokens.some((token) => source.includes(token.toLowerCase()));
}

function unique(items = []) {
  const seen = new Set();
  return items.filter(Boolean).filter((item) => {
    const key = normalize(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function arrayProp(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function parseTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function sourceChannel(sourceUrl = '') {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'c') return `c/${parts[1]}`;
    return parts[0] || '';
  } catch {
    return '';
  }
}

function signalIdentity(item) {
  const raw = item.raw || {};
  const source = String(raw.sourceUrl || '').trim();
  if (source) return `url:${source}`;
  const title = normalize(item.title);
  const body = normalize(raw.summary || item.summary || raw.possibleUse || '');
  const day = String(raw.capturedAt || '').slice(0, 10);
  return `${title}:${body.slice(0, 80)}:${day}`;
}

function signalQuality(item) {
  const raw = item.raw || {};
  const summary = String(raw.summary || '').trim();
  const possibleUse = String(raw.possibleUse || '').trim();
  const nextAction = String(raw.nextAction || '').trim();
  return summary.length * 4 + possibleUse.length + nextAction.length + (raw.sourceUrl ? 500 : 0);
}

function dedupeSignals(items = []) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = signalIdentity(item);
    const existing = byKey.get(key);
    if (!existing || signalQuality(item) > signalQuality(existing)) byKey.set(key, item);
  });
  return [...byKey.values()].sort((a, b) => String(b.raw?.capturedAt || '').localeCompare(String(a.raw?.capturedAt || '')));
}

function shortEnoughSummary(item) {
  const summary = String(item.raw?.summary || '').trim();
  const title = String(item.title || '').trim();
  return !summary || summary === title || summary.length < 80;
}

function isContextAttachment(item) {
  const title = String(item.title || '').toLowerCase().trim();
  const raw = item.raw || {};
  return /\.(md|txt|pdf|docx?|json|csv|html?)$/.test(title) ||
    (shortEnoughSummary(item) && /file|document|attachment|документ|файл/i.test(`${raw.type || ''} ${raw.summary || ''} ${raw.possibleUse || ''}`));
}

function closeEnoughForContext(attachments, parent) {
  if (!attachments.length || !parent) return false;
  const parentTime = parseTime(parent.raw?.capturedAt);
  if (!parentTime) return false;
  const parentChannel = sourceChannel(parent.raw?.sourceUrl || '');
  return attachments.every((item) => {
    const itemTime = parseTime(item.raw?.capturedAt);
    const itemChannel = sourceChannel(item.raw?.sourceUrl || '');
    const sameChannel = !parentChannel || !itemChannel || parentChannel === itemChannel;
    const nearTime = itemTime ? Math.abs(parentTime - itemTime) <= 20 * 60 * 1000 : true;
    return sameChannel && nearTime;
  });
}

function groupSignalsForDisplay(items = []) {
  const groups = [];
  let pendingContext = [];
  items.forEach((item) => {
    if (isContextAttachment(item)) {
      pendingContext.push(item);
      return;
    }
    if (pendingContext.length && closeEnoughForContext(pendingContext, item)) {
      groups.push({ item, contextItems: pendingContext });
      pendingContext = [];
      return;
    }
    pendingContext.forEach((contextItem) => groups.push({ item: contextItem, contextItems: [] }));
    pendingContext = [];
    groups.push({ item, contextItems: [] });
  });
  pendingContext.forEach((contextItem) => groups.push({ item: contextItem, contextItems: [] }));
  return groups;
}

function inferSignalMeta(item) {
  const raw = item.raw || {};
  const text = textOf(item);
  const platforms = new Set(arrayProp(raw.platforms || raw.toolPlatform || raw.tools));
  const assets = new Set(arrayProp(raw.assetTypes || raw.assetType));

  if (hasAny(text, ['chatgpt', 'gpt-'])) platforms.add('ChatGPT');
  if (hasAny(text, ['codex', 'opencode'])) platforms.add('Codex');
  if (hasAny(text, ['claude code'])) platforms.add('Claude Code');
  if (hasAny(text, ['claude'])) platforms.add('Claude');
  if (hasAny(text, ['mcp'])) platforms.add('MCP');
  if (hasAny(text, ['github'])) platforms.add('GitHub');
  if (hasAny(text, ['telegram', 'бот', 'bot'])) platforms.add('Telegram');
  if (hasAny(text, ['notion'])) platforms.add('Notion');
  if (hasAny(text, ['make'])) platforms.add('Make');

  let category = raw.aiCategory || raw.category || '';
  let decision = raw.decision || 'Review';
  if (hasAny(text, ['промпт', 'prompt', 'claude.md', 'review.md'])) { category ||= 'Prompt'; assets.add('Prompt'); assets.add('Instruction'); decision = raw.decision || 'Save to library'; }
  if (hasAny(text, ['record & replay', 'workflow', 'пайплайн', 'pipeline', 'автоматизац', 'agent', 'агент'])) { category ||= 'Workflow'; assets.add('Workflow'); }
  if (hasAny(text, ['codex', 'github', 'cursor', 'opencode', 'claude code', 'ssd', 'trace', 'sqlite'])) { category ||= 'Code/Codex'; assets.add('Instruction'); }
  if (hasAny(text, ['design', 'дизайн', 'макет', 'ui', 'ux', 'интерфейс', 'компонент'])) { category ||= 'Design/UX'; assets.add('Idea'); }
  if (hasAny(text, ['скрейп', 'scraping', 'pixelrag', 'rag', 'retriever', 'embedding', 'парс'])) { category ||= 'Research/News'; assets.add('Tool link'); }
  if (hasAny(text, ['нейросети и сервисы', 'подборка', 'инструмент', 'tool', 'сервис'])) { category ||= 'AI Tool'; assets.add('Tool link'); }
  if (hasAny(text, ['клиент', 'деньги', 'монетизац', 'лимиты', 'платн'])) category ||= 'Business/Monetization';
  if (hasAny(text, ['безопасн', 'legal', 'security', 'edr', 'уязвим', 'атака', 'reverse'])) category ||= 'Security/Legal';

  category ||= raw.type === 'Tool' ? 'AI Tool' : raw.type || 'Reference';
  if (!assets.size) assets.add(category === 'AI Tool' ? 'Tool link' : 'Source');

  const categoryLabel = category === 'Code/Codex' ? 'Код / Codex' :
    category === 'Design/UX' ? 'Дизайн / UX' :
      category === 'Research/News' ? 'Ресёрч / новость' :
        category === 'Business/Monetization' ? 'Деньги / бизнес' :
          category === 'Security/Legal' ? 'Безопасность' :
            category === 'AI Tool' ? 'AI-инструмент' :
              category === 'Workflow' ? 'Workflow' :
                category === 'Prompt' ? 'Промпт' : category;

  const nextStep = category === 'Prompt'
    ? 'Вынести в библиотеку промптов и подписать цель применения.'
    : category === 'AI Tool'
      ? 'Сохранить в библиотеку инструментов: что делает, где применить, нужна ли проверка.'
      : category === 'Code/Codex'
        ? 'Проверить, применимо ли это к текущему workflow LifeMap/Codex.'
        : category === 'Workflow'
          ? 'Разложить на повторяемые шаги и решить, нужна ли задача.'
          : 'Разобрать и решить: архив, задача, заметка или проектный материал.';

  return { category, categoryLabel, platforms: unique([...platforms]), assets: unique([...assets]), decision, nextStep };
}

function displayChips(meta, projects = []) {
  const chips = [];
  const add = (value) => {
    const text = String(value || '').trim();
    const key = normalize(text);
    if (!text || chips.some((item) => normalize(item) === key)) return;
    chips.push(text);
  };
  add(meta.categoryLabel);
  [...meta.platforms, ...meta.assets, ...projects].forEach(add);
  return chips;
}

function matchesInboxTab(item, tabId, localStatus) {
  const status = localStatus || item.status;
  const done = processedSignal(status);
  const meta = inferSignalMeta(item);
  if (tabId === 'done') return done;
  if (done) return false;
  if (tabId === 'new') return true;
  if (tabId === 'prompts') return meta.category === 'Prompt' || meta.assets.includes('Prompt');
  if (tabId === 'tools') return meta.category === 'AI Tool' || meta.assets.includes('Tool link') || meta.platforms.length > 0;
  if (tabId === 'workflow') return meta.category === 'Workflow' || meta.assets.includes('Workflow') || meta.category === 'Code/Codex';
  if (tabId === 'tasks') return meta.decision === 'Create task' || /задач|task/i.test(item.raw?.possibleUse || item.raw?.nextAction || '');
  return true;
}

function InlineTitleEditor({ value, onChange, onSubmit, onCancel }) {
  return (
    <input className="inlineTitleInput taskTitleInput" autoFocus value={value} onChange={(event) => onChange(event.target.value)} onBlur={onSubmit} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') onSubmit(event); if (event.key === 'Escape') onCancel(event); }} />
  );
}

function telegramDeepLink(sourceUrl = '') {
  if (!sourceUrl) return '';
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!['t.me', 'telegram.me'].includes(host)) return '';
    const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    if (!parts.length) return '';
    if (parts[0] === 'c' && parts[1] && parts[2]) return `tg://privatepost?channel=${encodeURIComponent(parts[1])}&post=${encodeURIComponent(parts[2])}`;
    if (parts[0] === 's' && parts[1]) return `tg://resolve?domain=${encodeURIComponent(parts[1])}${parts[2] ? `&post=${encodeURIComponent(parts[2])}` : ''}`;
    if (/^[+]/.test(parts[0])) return sourceUrl;
    return `tg://resolve?domain=${encodeURIComponent(parts[0])}${parts[1] ? `&post=${encodeURIComponent(parts[1])}` : ''}`;
  } catch { return ''; }
}

function openSource(event, sourceUrl = '') {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!sourceUrl) return;
  const appUrl = telegramDeepLink(sourceUrl);
  if (appUrl && appUrl.startsWith('tg://')) { window.location.href = appUrl; return; }
  window.open(sourceUrl, '_blank', 'noopener,noreferrer');
}

function TextWithLinks({ text, className }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/gi);
  return <p className={className}>{parts.map((part, index) => /^https?:\/\//i.test(part) ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noopener noreferrer" className="inboxTextLink">{part}</a> : <span key={`${part}-${index}`}>{part}</span>)}</p>;
}

function openAssistantFor(target, context = {}) {
  window.dispatchEvent(new CustomEvent('lifemap:assistant-target', { detail: { target, context } }));
}

function signalBody(item) {
  const raw = item.raw || {};
  const text = String(raw.summary || item.summary || raw.rawText || raw.assistantNote || '').trim();
  if (!text || normalize(text) === normalize(item.title) || text === 'Сигнал сохранён в AI Inbox.') return '';
  return text;
}

function SignalDetails({ item, contextItems = [] }) {
  const raw = item.raw || {};
  const meta = inferSignalMeta(item);
  const projects = raw.relatedProjects || [];
  const body = signalBody(item);
  const chips = displayChips(meta, projects);
  return (
    <div className="inlineTaskDetails inboxDetails">
      <div className="inboxChips inboxMetaChips">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
      <div className="inboxBodyBlock">
        <small>Оригинальный текст поста</small>
        {body ? <TextWithLinks className="inboxFullText" text={body} /> : <p className="inboxMissingText">У этого сигнала в Notion пока нет полного текста — сохранён только заголовок. Я поправил сохранение новых сигналов; старый дубль лучше отправить в архив или переслать после обновления backend.</p>}
      </div>
      {raw.possibleUse ? <div className="inboxBodyBlock"><small>Как применить</small><TextWithLinks text={raw.possibleUse} /></div> : null}
      <div className="inboxBodyBlock"><small>Решение AI Inbox</small><p>{meta.nextStep}</p></div>
      {raw.nextAction ? <div className="inboxBodyBlock"><small>Далее из Notion</small><p>{raw.nextAction}</p></div> : null}
      {contextItems.length ? <div className="contextDocs"><small>Контекст к этому посту</small><div className="contextDocGrid">{contextItems.map((contextItem) => <ContextDoc key={contextItem.id} item={contextItem} />)}</div></div> : null}
      <div className="inboxDetailActions">
        {raw.sourceUrl ? <button className="inboxLink" type="button" onClick={(event) => openSource(event, raw.sourceUrl)}>Открыть источник</button> : null}
        <button className="ghostInboxAction" type="button" onClick={() => openAssistantFor(item, { mode: 'signal', contextItems })}>Чат с AI</button>
        <button className="ghostInboxAction" type="button" title="Будет подключено следующим этапом">В библиотеку</button>
        <button className="ghostInboxAction" type="button" title="Будет подключено следующим этапом">Сделать задачей</button>
      </div>
    </div>
  );
}

function ContextDoc({ item }) {
  const raw = item.raw || {};
  const summary = signalBody(item) || String(raw.summary || '').trim();
  return <div className="contextDocCard"><b>{item.title}</b>{summary ? <TextWithLinks text={summary} /> : <p className="inboxMissingText">Документ сохранён как отдельный сигнал без полного текста.</p>}{raw.sourceUrl ? <button className="ghostInboxAction" type="button" onClick={(event) => openSource(event, raw.sourceUrl)}>Открыть документ</button> : null}</div>;
}

function AIInboxList({ map, highlightedItemId }) {
  const [expandedId, setExpandedId] = useState(null);
  const [inboxTab, setInboxTab] = useState('new');
  const [localState, setLocalState] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busySignalId, setBusySignalId] = useState(null);
  const listRef = useRef(null);
  const signals = useMemo(() => dedupeSignals(listItems(map).filter((item) => item.kind === 'signal')), [map]);
  const counts = useMemo(() => Object.fromEntries(INBOX_TABS.map((tab) => {
    const tabItems = signals.filter((item) => matchesInboxTab(item, tab.id, localState[item.sourceId || item.id]));
    return [tab.id, groupSignalsForDisplay(tabItems).length];
  })), [signals, localState]);
  const visible = useMemo(() => signals.filter((item) => matchesInboxTab(item, inboxTab, localState[item.sourceId || item.id])), [signals, inboxTab, localState]);
  const visibleGroups = useMemo(() => groupSignalsForDisplay(visible), [visible]);

  useEffect(() => { if (highlightedItemId && listRef.current) listRef.current.querySelector('.highlightedTask')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [highlightedItemId, visibleGroups.length]);

  const updateSignalStatus = async (item, status) => {
    const signalId = item.sourceId;
    const nextAction = status === 'Reviewed' ? 'Сигнал разобран вручную в LifeMap. Следующий шаг будет выбран отдельно.' : status === 'Archived' ? 'Сигнал отправлен в архив LifeMap AI Inbox.' : 'Вернуть сигнал во входящие LifeMap AI Inbox.';
    if (!signalId || item.raw?.local) {
      setLocalState((state) => ({ ...state, [item.sourceId || item.id]: status }));
      setNotice('Статус изменён локально: этот сигнал хранится не в Notion.');
      setTimeout(() => setNotice(''), 2600);
      return;
    }
    setBusySignalId(signalId);
    setError('');
    setNotice('Сохраняю статус сигнала в Notion…');
    try {
      await patchSignal(signalId, { status, nextAction });
      setLocalState((state) => ({ ...state, [signalId]: status }));
      setNotice(status === 'New' ? 'Сигнал возвращён во входящие и сохранён в Notion.' : 'Статус сигнала сохранён в Notion.');
      setTimeout(() => setNotice(''), 2600);
    } catch (err) {
      setError(`Не удалось сохранить статус в Notion: ${err.message}`);
      setNotice('');
    } finally {
      setBusySignalId(null);
    }
  };

  return (
    <aside className="sideList inboxPanel" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead inboxHead"><div><small>AI Inbox · входящие сигналы</small><strong>{map.title}</strong></div></div>
      <div className="inboxCategoryTabs">{INBOX_TABS.map((tab) => <button key={tab.id} className={inboxTab === tab.id ? 'active' : ''} onClick={() => setInboxTab(tab.id)}>{tab.label}<span>{counts[tab.id] || 0}</span></button>)}</div>
      {notice ? <div className="inboxNotice">{notice}</div> : null}
      {error ? <div className="inboxError">{error}</div> : null}
      {visibleGroups.length ? <div className="sideItems inboxItems" ref={listRef}>{visibleGroups.map(({ item, contextItems }) => {
        const raw = item.raw || {};
        const meta = inferSignalMeta(item);
        const expanded = expandedId === item.id;
        const currentStatus = localState[item.sourceId || item.id] || item.status || 'New';
        const processed = processedSignal(currentStatus);
        const highlighted = nodeHighlighted(item, highlightedItemId);
        const busy = busySignalId === item.sourceId;
        return (
          <div className={`sideItemRow inboxSignal ${expanded ? 'expandedRow' : ''} ${highlighted ? 'highlightedTask' : ''}`} style={highlightRowStyle(highlighted)} key={item.id}>
            <button className="sideItemMain inboxSignalMain" onClick={() => setExpandedId((id) => id === item.id ? null : item.id)}>
              <span className="taskCodeBadge inboxCode">{itemCode(item, 'IN')}</span>
              <div><b>{item.title}</b><small>{[meta.categoryLabel, meta.platforms.slice(0, 2).join(' + '), contextItems.length ? `${contextItems.length} файла контекста` : '', formatDate(raw.capturedAt), raw.priority].filter(Boolean).join(' · ')}</small></div>
            </button>
            <div className="rowActions inboxActions">
              <button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((id) => id === item.id ? null : item.id); }}><ChevronDown open={expanded} /></button>
              {processed ? <button className="restoreMini" disabled={busy} onClick={(event) => { event.stopPropagation(); updateSignalStatus(item, 'New'); }}>{busy ? '…' : 'Вернуть'}</button> : <><button className="doneMini" disabled={busy} onClick={(event) => { event.stopPropagation(); updateSignalStatus(item, 'Reviewed'); }}>{busy ? '…' : 'Разобрано'}</button><button className="archiveMini" disabled={busy} onClick={(event) => { event.stopPropagation(); updateSignalStatus(item, 'Archived'); }}>Архив</button></>}
            </div>
            {expanded ? <SignalDetails item={item} contextItems={contextItems} /> : null}
          </div>
        );
      })}</div> : <div className="emptySide"><b>Здесь пока пусто</b><p>В этой категории нет сигналов. Новые посты из Telegram появятся во «Входящих».</p></div>}
    </aside>
  );
}

export function SideList({ map, viewMode, setViewMode, onComplete, onRestore, onOpenMenu, onSaveNote, busyTaskId, highlightedItemId, inlineEditor, onInlineRenameChange, onSubmitInlineRename, onCancelInlineRename }) {
  const items = listItems(map).filter((item) => isLeafNode(item));
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});
  const listRef = useRef(null);
  const inboxMode = map?.id === 'sphere-inbox' || map?.kind === 'inbox' || (map?.title === 'AI Inbox' && items.some((item) => item.kind === 'signal'));
  const activeItems = items.filter((item) => !isDoneNode(item));
  const doneItems = items.filter((item) => isDoneNode(item));
  const visibleItems = viewMode === 'done' ? doneItems : activeItems;
  const mapProgress = progressValue(map);

  useEffect(() => { if (highlightedItemId && listRef.current) listRef.current.querySelector('.highlightedTask')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [highlightedItemId, visibleItems.length]);
  if (inboxMode) return <AIInboxList map={map} highlightedItemId={highlightedItemId} />;

  return (
    <aside className="sideList" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead"><div><small>{viewMode === 'done' ? 'Выполненные задачи' : 'Задачи ветки'}</small><strong>{map.title}</strong></div><b className="miniProgressRing" title={`${mapProgress}%`} style={{ '--pct': `${mapProgress}%` }}>{mapProgress}%</b></div>
      <div className="sideTabs"><button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Активные <span>{activeItems.length}</span></button><button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Сделано <span>{doneItems.length}</span></button></div>
      {visibleItems.length ? <div className="sideItems" ref={listRef}>{visibleItems.map((item) => {
        const patchable = canPatchTask(item);
        const done = isDoneNode(item);
        const expanded = expandedId === item.id;
        const editing = inlineEditor?.nodeId === item.id;
        const noteValue = notesDraft[item.id] ?? item.raw?.sessionNotes ?? item.summary ?? '';
        const highlighted = nodeHighlighted(item, highlightedItemId);
        return (
          <div className={`sideItemRow ${done ? 'doneRow' : ''} ${expanded ? 'expandedRow' : ''} ${highlighted ? 'highlightedTask' : ''}`} style={highlightRowStyle(highlighted)} key={item.id} onContextMenu={(event) => onOpenMenu(item, event)}>
            <button className="sideItemMain" style={{ gridTemplateColumns: 'minmax(48px, auto) minmax(0, 1fr)' }} onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}>
              <span className="taskCodeBadge" style={{ width: 'auto', minWidth: 48, padding: '0 8px', fontSize: 10 }}>{itemCode(item)}</span>
              <div>{editing ? <InlineTitleEditor value={inlineEditor.value} onChange={onInlineRenameChange} onSubmit={(event) => onSubmitInlineRename(item, event)} onCancel={onCancelInlineRename} /> : <b>{item.title}</b>}</div>
            </button>
            <div className="rowActions"><button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((current) => current === item.id ? null : item.id); }}><ChevronDown open={expanded} /></button><button className="ghostInboxAction taskAiChat" type="button" onClick={(event) => { event.stopPropagation(); openAssistantFor(item, { mode: 'task', mapTitle: map.title }); }}>AI</button>{patchable ? <button className={done ? 'restoreMini' : 'doneMini'} disabled={busyTaskId === item.sourceId} onClick={(event) => { event.stopPropagation(); done ? onRestore(item) : onComplete(item); }}>{busyTaskId === item.sourceId ? '…' : done ? 'Вернуть' : 'Done'}</button> : null}</div>
            {expanded ? <div className="inlineTaskDetails"><label className="noteEditorLabel">Заметка к задаче</label><textarea className="noteEditor" value={noteValue} onChange={(event) => setNotesDraft((drafts) => ({ ...drafts, [item.id]: event.target.value }))} placeholder="Короткая заметка, уточнение или контекст по задаче" /><div className="noteEditorActions"><button type="button" className="ghostInboxAction" onClick={() => openAssistantFor(item, { mode: 'task', mapTitle: map.title })}>Чат с AI</button><button disabled={!patchable || busyTaskId === item.sourceId} onClick={() => onSaveNote(item, noteValue)}>{busyTaskId === item.sourceId ? 'Сохраняю…' : 'Сохранить'}</button></div></div> : null}
          </div>
        );
      })}</div> : <div className="emptySide"><b>{viewMode === 'done' ? 'Выполненных задач нет' : 'Список пуст'}</b><p>{viewMode === 'done' ? 'Когда задачи будут помечены Done, они появятся здесь.' : 'У этой ветки пока нет задач для списка.'}</p></div>}
    </aside>
  );
}
