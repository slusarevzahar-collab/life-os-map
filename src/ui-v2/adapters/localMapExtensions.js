// LifeMap UI V2 — localMapExtensions (Stage 5A)
// Upgraded from Stage 4's read-only mirrors into read+write hooks that still
// resync from OTHER tabs via the native 'storage' event, but now ALSO update
// same-tab state immediately through plain React state (no global event bus,
// no custom window event) — exactly the "React state/actions in the V2 data
// layer" pattern the plan asks for. Writing is still the ONLY thing that
// touches TITLE_ALIASES_KEY/CUSTOM_OBJECTS_KEY/FOCUS_STORAGE_KEY; nothing
// about the keys themselves changed, so the legacy "/" UI keeps working.
//
// localObjectNode / attachCustomObjects are unchanged from Stage 4 (still not
// exported by App.jsx, still re-implemented against the same contract).
import { useCallback, useEffect, useRef, useState } from 'react';
import { TITLE_ALIASES_KEY, CUSTOM_OBJECTS_KEY, FOCUS_STORAGE_KEY } from '../../constants/lifeMap.js';

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort persistence only
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Generic read+write localStorage mirror. Returns [value, setPersisted] like
// useState — setPersisted accepts a value OR an updater function, updates
// local React state immediately (same-tab reflect), and persists to storage.
// A native 'storage' listener resyncs from writes made in ANOTHER tab only
// (the tab that itself wrote never receives its own 'storage' event, which is
// exactly why the immediate setState above is required for same-tab reflect).
export function useStorageJson(key, fallback) {
  const [value, setValue] = useState(() => readJson(key, fallback));
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event && event.key !== null && event.key !== key) return;
      const next = readJson(key, fallback);
      valueRef.current = next;
      setValue(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // fallback is an initialization contract; callers keep its type stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setPersisted = useCallback(
    (updater) => {
      const previous = valueRef.current;
      const next = typeof updater === 'function' ? updater(previous) : updater;
      valueRef.current = next;
      setValue(next);
      writeJson(key, next);
    },
    [key]
  );

  return [value, setPersisted];
}

export function useLocalMapExtensions() {
  const [titleAliases, setTitleAliases] = useStorageJson(TITLE_ALIASES_KEY, {});
  const [customObjects, setCustomObjects] = useStorageJson(CUSTOM_OBJECTS_KEY, {});
  return {
    titleAliases: asRecord(titleAliases),
    setTitleAliases,
    customObjects: asRecord(customObjects),
    setCustomObjects,
  };
}

export function useFocusQueue() {
  const [value, setValue] = useStorageJson(FOCUS_STORAGE_KEY, []);
  const focusQueue = Array.isArray(value) ? value : [];
  const setFocusQueue = useCallback(
    (updater) => setValue((previous) => {
      const base = Array.isArray(previous) ? previous : [];
      return typeof updater === 'function' ? updater(base) : updater;
    }),
    [setValue]
  );
  return [focusQueue, setFocusQueue];
}

export function localObjectNode(parentId, object = {}) {
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

export function attachCustomObjects(node, customObjects = {}) {
  if (!node) return node;
  const localItems = Array.isArray(customObjects[node.id]) ? customObjects[node.id] : [];
  const localChildren = localItems
    .filter((item) => item?.id)
    .map((item) => attachCustomObjects(localObjectNode(node.id, item), customObjects));
  const children = [
    ...(node.children || []).map((child) => attachCustomObjects(child, customObjects)),
    ...localChildren,
  ];
  return {
    ...node,
    children,
    taskList: (node.taskList || []).map((child) => attachCustomObjects(child, customObjects)),
  };
}
