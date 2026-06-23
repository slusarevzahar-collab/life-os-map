import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'framer-motion';
import './action-map.css';
import './action-map-overrides.css';
import './action-map-latest.css';
import './lifemap-progress.css';
import './progress-polish.css';

import { buildActionMap, findNode, isLeafNode } from './lib/actionMapModel.js';
import { CUSTOM_OBJECTS_KEY, FOCUS_STORAGE_KEY, TITLE_ALIASES_KEY } from './constants/lifeMap.js';
import { dataState, emptySnapshot, fetchSnapshot, patchItemTitle, patchTask } from './lib/lifeMapRuntime.js';
import {
  applyTitleAliases,
  buildFocusSequence,
  canPatchTask,
  canRenameNode,
  focusCandidateFromNode,
  listItems,
  resolveFocus,
  toFocusItem,
} from './lib/lifeMapSelectors.js';
import { Stars } from './components/Stars.jsx';
import { TopNav } from './components/TopNav.jsx';
import { MissionPanel } from './components/MissionPanel.jsx';
import { OrbitMap } from './components/OrbitMap.jsx';
import { SideList } from './components/SideList.jsx';
import { DetailCard } from './components/DetailCard.jsx';
import { UtilityPanel } from './components/UtilityPanel.jsx';
import { ContextMenu } from './components/ContextMenu.jsx';

const ROUTE_STORAGE_KEY = 'lifemap.route.v1';
const SNAPSHOT_REFRESH_MS = 15000;

function readStorage(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function readInitialRoute() {
  if (typeof window === 'undefined') return ['root'];
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (hash) {
    const route = hash.split('/').map((part) => decodeURIComponent(part)).filter(Boolean);
    if (route.length) return route[0] === 'root' ? route : ['root', ...route];
  }
  const stored = readStorage(ROUTE_STORAGE_KEY, ['root']);
  return Array.isArray(stored) && stored.length ? stored : ['root'];
}

function writeRoute(route) {
  const safeRoute = Array.isArray(route) && route.length ? route : ['root'];
  writeStorage(ROUTE_STORAGE_KEY, safeRoute);
  if (typeof window === 'undefined') return;
  const nextHash = `#${safeRoute.map((part) => encodeURIComponent(part)).join('/')}`;
  if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
}

function normalizeTitle(value = '') {
  return String(value || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function siblingTitleExists(parentNode, title, ignoreId = null) {
  const needle = normalizeTitle(title);
  if (!parentNode || !needle) return false;
  return (parentNode.children || []).some((child) => child.id !== ignoreId && normalizeTitle(child.title) === needle);
}

function findParentNode(node, targetId) {
  if (!node) return null;
  if ((node.children || []).some((child) => child.id === targetId)) return node;
  for (const child of node.children || []) {
    const parent = findParentNode(child, targetId);
    if (parent) return parent;
  }
  return null;
}

function uniqueLocalTitle(parentNode) {
  const base = 'Новая планета';
  if (!siblingTitleExists(parentNode, base)) return base;
  let index = 2;
  while (siblingTitleExists(parentNode, `${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function localObjectNode(parentId, object) {
  return {
    id: object.id,
    sourceId: null,
    title: object.title || 'Новый объект',
    icon: object.icon || 'OB',
    status: 'локальный объект',
    state: 'queue',
    progress: 0,
    tasks: 0,
    completedTasks: 0,
    totalTasks: 0,
    summary: 'Локальная планета LifeMap. Позже её можно связать с Notion или превратить в полноценную задачу/проект.',
    details: [],
    children: [],
    taskList: [],
    kind: 'custom',
    raw: { local: true, parentId, createdAt: object.createdAt },
  };
}

function attachCustomObjects(node, customObjects = {}) {
  if (!node) return node;
  const localChildren = (customObjects[node.id] || []).map((item) => attachCustomObjects(localObjectNode(node.id, item), customObjects));
  const children = [...(node.children || []).map((child) => attachCustomObjects(child, customObjects)), ...localChildren];
  return {
    ...node,
    children,
    taskList: (node.taskList || []).map((child) => attachCustomObjects(child, customObjects)),
  };
}

function hasTaskSideList(node) {
  return listItems(node).some((item) => isLeafNode(item));
}

function matchesFocusItem(node, item) {
  if (!node || !item) return false;
  return node.id === item.id ||
    (item.sourceId && node.sourceId === item.sourceId) ||
    (item.sourceId && node.id === `task-${item.sourceId}`) ||
    (item.sourceId && node.id === `signal-${item.sourceId}`);
}

function findBranchPathForItem(node, item, path = ['root']) {
  if (!node || !item) return null;
  if (listItems(node).some((entry) => matchesFocusItem(entry, item))) return path;
  for (const child of node.children || []) {
    if (isLeafNode(child)) continue;
    const found = findBranchPathForItem(child, item, [...path, child.id]);
    if (found) return found;
  }
  return null;
}

function highlightKey(item) {
  if (!item) return '';
  return item.id || (item.sourceId ? `task-${item.sourceId}` : '');
}

function TextInputDialog({ editor, busy, onSubmit, onClose }) {
  const [value, setValue] = useState(editor?.initialValue || '');
  useEffect(() => { setValue(editor?.initialValue || ''); }, [editor?.id, editor?.initialValue]);
  if (!editor) return null;
  const submit = (event) => {
    event.preventDefault();
    onSubmit(value);
  };
  return (
    <div className="lifeDialogBackdrop" onClick={onClose}>
      <form className="lifeDialog" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <small>{editor.mode === 'create' ? 'НОВЫЙ ОБЪЕКТ' : 'РЕДАКТИРОВАНИЕ'}</small>
        <h2>{editor.title}</h2>
        <label>{editor.label}</label>
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={editor.placeholder} />
        <div className="lifeDialogActions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="submit" disabled={busy || !value.trim()}>{busy ? 'Сохраняю…' : editor.confirmText}</button>
        </div>
      </form>
    </div>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(() => emptySnapshot('loading'));
  const [apiState, setApiState] = useState('loading');
  const [route, setRoute] = useState(() => readInitialRoute());
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [toast, setToast] = useState('');
  const [errorLog, setErrorLog] = useState([]);
  const [viewMode, setViewMode] = useState('active');
  const [contextMenu, setContextMenu] = useState(null);
  const [objectEditor, setObjectEditor] = useState(null);
  const [inlineEditor, setInlineEditor] = useState(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState('');
  const [focusQueue, setFocusQueue] = useState(() => readStorage(FOCUS_STORAGE_KEY, []));
  const [titleAliases, setTitleAliases] = useState(() => readStorage(TITLE_ALIASES_KEY, {}));
  const [customObjects, setCustomObjects] = useState(() => readStorage(CUSTOM_OBJECTS_KEY, {}));

  const loadSnapshot = useCallback(() => {
    setApiState((state) => state === 'api offline' ? 'loading' : state);
    return fetchSnapshot()
      .then((data) => {
        setSnapshot(data);
        setApiState(data.meta?.source?.includes('mock') ? 'mock data' : 'connected');
        return data;
      })
      .catch((error) => {
        setSnapshot(emptySnapshot('api-offline', error.message));
        setApiState('api offline');
        setErrorLog((items) => [`Snapshot: ${error.message}`, ...items].slice(0, 8));
        throw error;
      });
  }, []);

  useEffect(() => { loadSnapshot().catch(() => {}); }, [loadSnapshot]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadSnapshot().catch(() => {});
    }, SNAPSHOT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);
  useEffect(() => { writeRoute(route); }, [route]);
  useEffect(() => { writeStorage(FOCUS_STORAGE_KEY, focusQueue.slice(0, 12)); }, [focusQueue]);
  useEffect(() => { writeStorage(TITLE_ALIASES_KEY, titleAliases); }, [titleAliases]);
  useEffect(() => { writeStorage(CUSTOM_OBJECTS_KEY, customObjects); }, [customObjects]);

  const baseRootMap = useMemo(() => buildActionMap(snapshot), [snapshot]);
  const rootMap = useMemo(() => applyTitleAliases(attachCustomObjects(baseRootMap, customObjects), titleAliases), [baseRootMap, customObjects, titleAliases]);
  const activeFocus = useMemo(() => resolveFocus(rootMap, snapshot, focusQueue), [rootMap, snapshot, focusQueue]);
  const focusQueueItems = useMemo(() => buildFocusSequence(rootMap, activeFocus, focusQueue), [rootMap, activeFocus, focusQueue]);
  const currentId = route[route.length - 1];
  const currentMap = useMemo(() => findNode(rootMap, currentId) || rootMap, [rootMap, currentId]);
  const canBack = route.length > 1;
  const showSideList = canBack && hasTaskSideList(currentMap);
  const errors = useMemo(() => [...(snapshot.meta?.warnings || []), ...errorLog].filter(Boolean), [snapshot.meta?.warnings, errorLog]);

  useEffect(() => { setViewMode(currentId === 'sphere-done' ? 'done' : 'active'); }, [currentId]);

  const showToast = (message, timeout = 2200) => {
    setToast(message);
    setTimeout(() => setToast(''), timeout);
  };

  const openNode = (id) => {
    setRoute((prev) => [...prev, id]);
    setSelected(null);
    setPanel(null);
    setContextMenu(null);
    setInlineEditor(null);
  };

  const openFocusItem = (item) => {
    if (!item) return;
    const path = findBranchPathForItem(rootMap, item);
    if (!path) {
      showToast('Не нашёл эту задачу на текущей карте. Обнови snapshot или проверь Notion.');
      return;
    }
    setRoute(path);
    setSelected(null);
    setPanel(null);
    setContextMenu(null);
    setInlineEditor(null);
    setViewMode('active');
    setHighlightedItemId(highlightKey(item));
    setTimeout(() => setHighlightedItemId(''), 2600);
  };

  const goBack = () => {
    setRoute((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
    setSelected(null);
    setPanel(null);
    setContextMenu(null);
    setInlineEditor(null);
  };

  const goCenter = () => {
    setRoute(['root']);
    setSelected(null);
    setPanel(null);
    setContextMenu(null);
    setInlineEditor(null);
  };

  const openMenu = (node, eventOrPoint) => {
    eventOrPoint?.preventDefault?.();
    eventOrPoint?.stopPropagation?.();
    const x = Math.min(eventOrPoint?.clientX ?? window.innerWidth / 2, window.innerWidth - 230);
    const y = Math.min(eventOrPoint?.clientY ?? window.innerHeight / 2, window.innerHeight - 220);
    setContextMenu({ node, x: Math.max(12, x), y: Math.max(12, y) });
  };

  const beginCreateObject = (node) => {
    setContextMenu(null);
    const parent = findNode(rootMap, node.id);
    const initialValue = uniqueLocalTitle(parent);
    setObjectEditor({
      id: `${node.id}-${Date.now()}`,
      mode: 'create',
      node,
      title: node.title || 'LifeMap',
      label: 'Название нового объекта',
      placeholder: 'Например: AI Inbox',
      initialValue,
      confirmText: 'Создать',
    });
  };

  const beginRenameNode = (node) => {
    if (!canRenameNode(node)) return;
    setContextMenu(null);
    setInlineEditor({ nodeId: node.id, value: node.title || '' });
  };

  const submitRename = async (node, rawTitle) => {
    const title = String(rawTitle || '').trim();
    if (!node || !title) { setInlineEditor(null); return; }
    if (title === node.title) { setInlineEditor(null); return; }

    const parent = findParentNode(rootMap, node.id);
    if (!isLeafNode(node) && siblingTitleExists(parent, title, node.id)) {
      showToast('Такой объект уже есть на этой орбите. Выбери другое название.');
      return;
    }

    if (!node.sourceId) {
      setTitleAliases((aliases) => ({ ...aliases, [node.id]: title }));
      setInlineEditor(null);
      showToast('Название обновлено локально.');
      return;
    }

    setEditorBusy(true);
    setBusyTaskId(node.sourceId);
    setToast('Переименовываю в Notion…');
    try {
      await patchItemTitle(node, title);
      setFocusQueue((queue) => queue.map((item) => item.sourceId === node.sourceId ? { ...item, title } : item));
      await loadSnapshot();
      setSelected(null);
      setInlineEditor(null);
      showToast('Название обновлено в Notion.');
    } catch (error) {
      const message = `Rename: ${error.message}`;
      setToast(`Не переименовалось: ${error.message}`);
      setErrorLog((items) => [message, ...items].slice(0, 8));
      setPanel('errors');
    } finally {
      setEditorBusy(false);
      setBusyTaskId(null);
    }
  };

  const submitInlineRename = (node, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    submitRename(node, inlineEditor?.value);
  };

  const submitObjectEditor = async (value) => {
    const title = String(value || '').trim();
    const editor = objectEditor;
    if (!editor || !title) return;
    if (editor.mode === 'create') {
      const node = editor.node;
      const parent = findNode(rootMap, node.id);
      if (siblingTitleExists(parent, title)) {
        showToast('Такой объект уже есть на этой орбите. Выбери другое название.');
        return;
      }
      const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      setCustomObjects((items) => ({
        ...items,
        [node.id]: [...(items[node.id] || []), { id, title, icon: 'OB', createdAt: new Date().toISOString() }],
      }));
      setObjectEditor(null);
      showToast('Новая планета создана локально в этом уровне LifeMap.', 2400);
    }
  };

  const deleteObject = (node) => {
    if (!node?.raw?.local) return;
    const confirmed = window.confirm(`Удалить объект «${node.title}»? Это действие нельзя отменить.`);
    if (!confirmed) {
      setContextMenu(null);
      return;
    }
    setCustomObjects((items) => {
      const next = { ...items };
      Object.keys(next).forEach((parentId) => {
        next[parentId] = next[parentId].filter((item) => item.id !== node.id);
        if (!next[parentId].length) delete next[parentId];
      });
      delete next[node.id];
      return next;
    });
    setTitleAliases((aliases) => {
      const next = { ...aliases };
      delete next[node.id];
      return next;
    });
    setRoute((prev) => prev.includes(node.id) ? prev.slice(0, Math.max(1, prev.indexOf(node.id))) : prev);
    setSelected(null);
    setContextMenu(null);
    showToast('Локальный объект удалён из LifeMap.');
  };

  const updateTask = async (node, payload, successText) => {
    if (!canPatchTask(node)) return;
    setBusyTaskId(node.sourceId);
    setToast('Сохраняю изменение в Notion…');
    try {
      await patchTask(node.sourceId, payload);
      setFocusQueue((queue) => queue.map((item) => item.sourceId === node.sourceId ? {
        ...item,
        status: payload.status || item.status,
        progress: payload.progress ?? item.progress,
        nextAction: payload.nextAction || item.nextAction,
        title: payload.title || item.title,
      } : item));
      await loadSnapshot();
      setSelected(null);
      showToast(successText, 2400);
    } catch (error) {
      const message = `Task update: ${error.message}`;
      setToast(`Не сохранилось: ${error.message}`);
      setErrorLog((items) => [message, ...items].slice(0, 8));
      setPanel('errors');
    } finally {
      setBusyTaskId(null);
    }
  };

  const completeTask = (node) => updateTask(node, { status: 'Done', progress: 100, nextAction: 'Done: выполнено через LifeMap.' }, 'Готово: задача помечена Done в Notion.');
  const restoreTask = (node) => updateTask(node, { status: 'Next', progress: 0, nextAction: 'Вернуть в работу через LifeMap.' }, 'Готово: задача возвращена в активный список.');
  const saveNote = (node, note) => updateTask(node, { sessionNotes: note }, 'Заметка обновлена в Notion.');

  const reorderList = async (orderedItems) => {
    const patchableItems = orderedItems.filter((item) => canPatchTask(item));
    if (!patchableItems.length) return;
    setBusyTaskId(patchableItems[0].sourceId);
    setToast('Сохраняю новый порядок задач в Notion…');
    try {
      await Promise.all(patchableItems.map((item, orderIndex) => patchTask(item.sourceId, { priority: (orderIndex + 1) * 10 })));
      await loadSnapshot();
      showToast('Порядок задач обновлён.');
    } catch (error) {
      const message = `Task reorder: ${error.message}`;
      setToast(`Порядок не сохранился: ${error.message}`);
      setErrorLog((items) => [message, ...items].slice(0, 8));
      setPanel('errors');
    } finally {
      setBusyTaskId(null);
    }
  };

  const setFocusNow = (node) => {
    const target = focusCandidateFromNode(node);
    const item = toFocusItem(target);
    if (!item) return;
    setFocusQueue((queue) => [item, ...queue.filter((next) => (item.sourceId && next.sourceId !== item.sourceId) || (!item.sourceId && next.id !== item.id))].slice(0, 12));
    setContextMenu(null);
    if (canPatchTask(target)) updateTask(target, { status: 'Now', nextAction: target.raw?.nextAction || target.summary || '' }, 'Текущий фокус обновлён.');
    else showToast('Текущий фокус обновлён локально.', 2000);
  };

  const setFocusNext = (node) => {
    const target = focusCandidateFromNode(node);
    const item = toFocusItem(target);
    if (!item) return;
    setFocusQueue((queue) => {
      const clean = queue.filter((next) => (item.sourceId && next.sourceId !== item.sourceId) || (!item.sourceId && next.id !== item.id));
      return clean.length ? [clean[0], item, ...clean.slice(1)].slice(0, 12) : [item];
    });
    setContextMenu(null);
    if (canPatchTask(target)) updateTask(target, { status: 'Next', nextAction: target.raw?.nextAction || target.summary || '' }, 'Задача поставлена следующей.');
    else showToast('Задача поставлена следующей локально.', 2000);
  };

  const inlineRenameProps = {
    inlineEditor,
    onInlineRenameChange: (value) => setInlineEditor((editor) => editor ? { ...editor, value } : editor),
    onSubmitInlineRename: submitInlineRename,
    onCancelInlineRename: (event) => { event?.preventDefault?.(); event?.stopPropagation?.(); setInlineEditor(null); },
  };

  return (
    <main className={`app actionApp ${showSideList ? 'hasSideList branchView' : ''}`} onClick={() => { setPanel(null); setContextMenu(null); }}>
      <Stars />
      <TopNav canBack={canBack} onBack={goBack} onCenter={goCenter} apiState={dataState(snapshot, apiState)} errorCount={errors.length} onErrors={() => setPanel('errors')} />
      <MissionPanel focus={activeFocus} focusQueueItems={focusQueueItems} snapshot={snapshot} apiState={apiState} onDone={() => setPanel('done')} onOpenFocus={openFocusItem} />
      <AnimatePresence mode="wait">
        <OrbitMap key={currentMap.id} map={currentMap} hasSide={showSideList} onOpen={openNode} onOpenMenu={openMenu} {...inlineRenameProps} />
      </AnimatePresence>
      {showSideList ? <SideList map={currentMap} viewMode={viewMode} setViewMode={setViewMode} onOpen={openNode} onComplete={completeTask} onRestore={restoreTask} onReorderList={reorderList} onOpenMenu={openMenu} onSaveNote={saveNote} busyTaskId={busyTaskId} highlightedItemId={highlightedItemId} {...inlineRenameProps} /> : null}
      <AnimatePresence>
        {selected ? <DetailCard key={selected.id} node={selected} onClose={() => setSelected(null)} onComplete={completeTask} onRestore={restoreTask} onOpenMenu={openMenu} busyTaskId={busyTaskId} /> : null}
        {panel ? <UtilityPanel key={panel} type={panel} rootMap={rootMap} errors={errors} onClose={() => setPanel(null)} onRestore={restoreTask} busyTaskId={busyTaskId} /> : null}
      </AnimatePresence>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onFocusNow={setFocusNow} onFocusNext={setFocusNext} onRename={beginRenameNode} onCreateObject={beginCreateObject} onDeleteObject={deleteObject} />
      <TextInputDialog editor={objectEditor} busy={editorBusy} onSubmit={submitObjectEditor} onClose={() => setObjectEditor(null)} />
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
