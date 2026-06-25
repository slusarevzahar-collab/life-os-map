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
  const source = String(value || 'LM').toUpperCase();
  const letters = (source.match(/[A-ZА-Я]{1,2}/)?.[0] || 'LM').slice(0, 2);
  const rawNumber = Number(source.match(/\d+/)?.[0] || 1);
  const number = ((Math.max(rawNumber, 1) - 1) % 100) + 1;
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
  return `${item.title || ''} ${raw.summary || ''} ${raw.possibleUse || ''} ${raw.nextAction || ''} ${raw.type || ''}`.toLowerCase();
}

function hasAny(source, tokens) {
  return tokens.some((token) => source.includes(token.toLowerCase()));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
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

  if (hasAny(text, ['промпт', 'prompt', 'claude.md', 'review.md'])) {
    category ||= 'Prompt';
    assets.add('Prompt');
    assets.add('Instruction');
    decision = raw.decision || 'Save to library';
  }
  if (hasAny(text, ['record & replay', 'workflow', 'пайплайн', 'pipeline', 'автоматизац', 'agent', 'агент'])) {
    category ||= 'Workflow';
    assets.add('Workflow');
  }
  if (hasAny(text, ['codex', 'github', 'cursor', 'opencode', 'claude code', 'ssd', 'trace', 'sqlite'])) {
    category ||= 'Code/Codex';
    assets.add('Instruction');
  }
  if (hasAny(text, ['design', 'дизайн', 'макет', 'ui', 'ux', 'интерфейс', 'компонент'])) {
    category ||= 'Design/UX';
    assets.add('Idea');
  }
  if (hasAny(text, ['скрейп', 'scraping', 'pixelrag', 'rag', 'retriever', 'embedding', 'парс'])) {
    category ||= 'Research/News';
    assets.add('Tool link');
  }
  if (hasAny(text, ['нейросети и сервисы', 'подборка', 'инструмент', 'tool', 'сервис'])) {
    category ||= 'AI Tool';
    assets.add('Tool link');
  }
  if (hasAny(text, ['клиент', 'деньги', 'монетизац', 'лимиты', 'платн'])) {
    category ||= 'Business/Monetization';
  }
  if (hasAny(text, ['безопасн', 'legal', 'security', 'edr', 'уязвим', 'атака', 'reverse'])) {
    category ||= 'Security/Legal';
  }

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

  return {
    category,
    categoryLabel,
    platforms: unique([...platforms]),
    assets: unique([...assets]),
    decision,
    nextStep,
  };
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
    <input
      className="inlineTitleInput taskTitleInput"
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onSubmit}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit(event);
        if (event.key === 'Escape') onCancel(event);
      }}
    />
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

    if (parts[0] === 'c' && parts[1] && parts[2]) {
      return `tg://privatepost?channel=${encodeURIComponent(parts[1])}&post=${encodeURIComponent(parts[2])}`;
    }

    if (parts[0] === 's' && parts[1]) {
      const post = parts[2] ? `&post=${encodeURIComponent(parts[2])}` : '';
      return `tg://resolve?domain=${encodeURIComponent(parts[1])}${post}`;
    }

    if (/^[+]/.test(parts[0])) return sourceUrl;

    const domain = parts[0];
    const post = parts[1] ? `&post=${encodeURIComponent(parts[1])}` : '';
    return `tg://resolve?domain=${encodeURIComponent(domain)}${post}`;
  } catch {
    return '';
  }
}

function openSource(event, sourceUrl = '') {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!sourceUrl) return;

  const appUrl = telegramDeepLink(sourceUrl);
  if (appUrl && appUrl.startsWith('tg://')) {
    window.location.href = appUrl;
    return;
  }

  window.open(sourceUrl, '_blank', 'noopener,noreferrer');
}

function SignalDetails({ item }) {
  const raw = item.raw || {};
  const meta = inferSignalMeta(item);
  const projects = raw.relatedProjects || [];
  return (
    <div className="inlineTaskDetails inboxDetails">
      <div className="inboxChips inboxMetaChips">
        <span>{meta.categoryLabel}</span>
        {meta.platforms.map((platform) => <span key={platform}>{platform}</span>)}
        {meta.assets.map((asset) => <span key={asset}>{asset}</span>)}
      </div>
      {raw.summary ? <div><small>Суть</small><p>{raw.summary}</p></div> : null}
      {raw.possibleUse ? <div><small>Как применить</small><p>{raw.possibleUse}</p></div> : null}
      <div><small>Решение AI Inbox</small><p>{meta.nextStep}</p></div>
      {raw.nextAction ? <div><small>Далее из Notion</small><p>{raw.nextAction}</p></div> : null}
      {projects.length ? <div className="inboxChips">{projects.map((project) => <span key={project}>{project}</span>)}</div> : null}
      <div className="inboxDetailActions">
        {raw.sourceUrl ? <button className="inboxLink" type="button" onClick={(event) => openSource(event, raw.sourceUrl)}>Открыть источник</button> : null}
        <button className="ghostInboxAction" type="button" title="Будет подключено следующим этапом">В библиотеку</button>
        <button className="ghostInboxAction" type="button" title="Будет подключено следующим этапом">Сделать задачей</button>
      </div>
    </div>
  );
}

function AIInboxList({ map, highlightedItemId }) {
  const [expandedId, setExpandedId] = useState(null);
  const [inboxTab, setInboxTab] = useState('new');
  const [localState, setLocalState] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busySignalId, setBusySignalId] = useState(null);
  const listRef = useRef(null);
  const signals = useMemo(() => listItems(map).filter((item) => item.kind === 'signal'), [map]);
  const counts = useMemo(() => Object.fromEntries(INBOX_TABS.map((tab) => [
    tab.id,
    signals.filter((item) => matchesInboxTab(item, tab.id, localState[item.sourceId || item.id])).length,
  ])), [signals, localState]);
  const visible = useMemo(() => signals.filter((item) => matchesInboxTab(item, inboxTab, localState[item.sourceId || item.id])), [signals, inboxTab, localState]);

  useEffect(() => {
    if (!highlightedItemId || !listRef.current) return;
    listRef.current.querySelector('.highlightedTask')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedItemId, visible.length]);

  const updateSignalStatus = async (item, status) => {
    const signalId = item.sourceId;
    const nextAction = status === 'Reviewed'
      ? 'Сигнал разобран вручную в LifeMap. Следующий шаг будет выбран отдельно.'
      : status === 'Archived'
        ? 'Сигнал отправлен в архив LifeMap AI Inbox.'
        : 'Вернуть сигнал во входящие LifeMap AI Inbox.';

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
      <div className="sideListHead inboxHead">
        <div>
          <small>AI Inbox · входящие сигналы</small>
          <strong>{map.title}</strong>
          <p>Посты, ссылки, промпты и инструменты из Telegram. Здесь они сначала сортируются, а уже потом становятся задачами, промптами или материалами проекта.</p>
        </div>
        <b className="miniProgressRing" title={`${counts.new || 0} входящих`}>{counts.new || 0}</b>
      </div>
      <div className="inboxCategoryTabs">
        {INBOX_TABS.map((tab) => <button key={tab.id} className={inboxTab === tab.id ? 'active' : ''} onClick={() => setInboxTab(tab.id)}>{tab.label}<span>{counts[tab.id] || 0}</span></button>)}
      </div>
      {notice ? <div className="inboxNotice">{notice}</div> : null}
      {error ? <div className="inboxError">{error}</div> : null}
      {visible.length ? <div className="sideItems inboxItems" ref={listRef}>
        {visible.map((item) => {
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
                <div>
                  <b>{item.title}</b>
                  <small>{[meta.categoryLabel, meta.platforms.slice(0, 2).join(' + '), formatDate(raw.capturedAt), raw.priority].filter(Boolean).join(' · ')}</small>
                </div>
              </button>
              <div className="rowActions inboxActions">
                <button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((id) => id === item.id ? null : item.id); }}><ChevronDown open={expanded} /></button>
                {processed
                  ? <button className="restoreMini" disabled={busy} onClick={(event) => { event.stopPropagation(); updateSignalStatus(item, 'New'); }}>{busy ? '…' : 'Вернуть'}</button>
                  : <><button className="doneMini" disabled={busy} onClick={(event) => { event.stopPropagation(); updateSignalStatus(item, 'Reviewed'); }}>{busy ? '…' : 'Разобрано'}</button><button className="archiveMini" disabled={busy} onClick={(event) => { event.stopPropagation(); updateSignalStatus(item, 'Archived'); }}>Архив</button></>}
              </div>
              {expanded ? <SignalDetails item={item} /> : null}
            </div>
          );
        })}
      </div> : <div className="emptySide"><b>Здесь пока пусто</b><p>В этой категории нет сигналов. Новые посты из Telegram появятся во «Входящих».</p></div>}
    </aside>
  );
}

export function SideList({
  map,
  viewMode,
  setViewMode,
  onOpen,
  onComplete,
  onRestore,
  onOpenMenu,
  onSaveNote,
  busyTaskId,
  highlightedItemId,
  inlineEditor,
  onInlineRenameChange,
  onSubmitInlineRename,
  onCancelInlineRename,
}) {
  const items = listItems(map).filter((item) => isLeafNode(item));
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});
  const listRef = useRef(null);
  const inboxMode = map?.id === 'sphere-inbox' || map?.kind === 'inbox' || (map?.title === 'AI Inbox' && items.some((item) => item.kind === 'signal'));
  const activeItems = items.filter((item) => !isDoneNode(item));
  const doneItems = items.filter((item) => isDoneNode(item));
  const visibleItems = viewMode === 'done' ? doneItems : activeItems;
  const mapProgress = progressValue(map);

  useEffect(() => {
    if (!highlightedItemId || !listRef.current) return;
    listRef.current.querySelector('.highlightedTask')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedItemId, visibleItems.length]);

  if (inboxMode) return <AIInboxList map={map} highlightedItemId={highlightedItemId} />;

  return (
    <aside className="sideList" onClick={(event) => event.stopPropagation()}>
      <div className="sideListHead"><div><small>{viewMode === 'done' ? 'Выполненные задачи' : 'Задачи ветки'}</small><strong>{map.title}</strong></div><b className="miniProgressRing" title={`${mapProgress}%`} style={{ '--pct': `${mapProgress}%` }}>{mapProgress}%</b></div>
      <div className="sideTabs"><button className={viewMode === 'active' ? 'active' : ''} onClick={() => setViewMode('active')}>Активные <span>{activeItems.length}</span></button><button className={viewMode === 'done' ? 'active' : ''} onClick={() => setViewMode('done')}>Сделано <span>{doneItems.length}</span></button></div>
      {visibleItems.length ? <div className="sideItems" ref={listRef}>
        {visibleItems.map((item) => {
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
              <div className="rowActions"><button className="expandMini" title="Развернуть" onClick={(event) => { event.stopPropagation(); setExpandedId((current) => current === item.id ? null : item.id); }}><ChevronDown open={expanded} /></button>{patchable ? <button className={done ? 'restoreMini' : 'doneMini'} disabled={busyTaskId === item.sourceId} onClick={(event) => { event.stopPropagation(); done ? onRestore(item) : onComplete(item); }}>{busyTaskId === item.sourceId ? '…' : done ? 'Вернуть' : 'Done'}</button> : null}</div>
              {expanded ? <div className="inlineTaskDetails"><label className="noteEditorLabel">Заметка к задаче</label><textarea className="noteEditor" value={noteValue} onChange={(event) => setNotesDraft((drafts) => ({ ...drafts, [item.id]: event.target.value }))} placeholder="Короткая заметка, уточнение или контекст по задаче" /><div className="noteEditorActions"><button disabled={!patchable || busyTaskId === item.sourceId} onClick={() => onSaveNote(item, noteValue)}>{busyTaskId === item.sourceId ? 'Сохраняю…' : 'Сохранить'}</button></div></div> : null}
            </div>
          );
        })}
      </div> : <div className="emptySide"><b>{viewMode === 'done' ? 'Выполненных задач нет' : 'Список пуст'}</b><p>{viewMode === 'done' ? 'Когда задачи будут помечены Done, они появятся здесь.' : 'У этой ветки пока нет задач для списка.'}</p></div>}
    </aside>
  );
}
