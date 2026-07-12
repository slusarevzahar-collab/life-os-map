// LifeMap UI V2 — localMapExtensions (Stage 4)
// Read-only mirrors of the existing localStorage contracts. They never write
// aliases, custom objects, or the focus queue; changes from another tab are
// picked up through the native storage event.
import { useCallback, useEffect, useState } from 'react';
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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Generic read-only localStorage mirror + cross-tab resync. event.key is null
// when another tab clears the whole storage area, which must also refresh us.
export function useStorageJson(key, fallback) {
  const [value, setValue] = useState(() => readJson(key, fallback));

  const resync = useCallback(
    (event) => {
      if (event && event.key !== null && event.key !== key) return;
      setValue(readJson(key, fallback));
    },
    // The fallback is an initialization contract; callers keep its type stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => {
    window.addEventListener('storage', resync);
    return () => window.removeEventListener('storage', resync);
  }, [resync]);

  return value;
}

export function useLocalMapExtensions() {
  const titleAliases = asRecord(useStorageJson(TITLE_ALIASES_KEY, {}));
  const customObjects = asRecord(useStorageJson(CUSTOM_OBJECTS_KEY, {}));
  return { titleAliases, customObjects };
}

export function useFocusQueueReadOnly() {
  const value = useStorageJson(FOCUS_STORAGE_KEY, []);
  return Array.isArray(value) ? value : [];
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
