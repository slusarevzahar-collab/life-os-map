// LifeMap UI V2 — local object/alias actions (Stage 5A).
// Uses the existing localStorage shapes through lifted React setters; no fetch,
// no Notion and no global event bus.
import { useCallback } from 'react';
import { findNode, isLeafNode } from '../../lib/actionMapModel.js';

export function normalizeTitleForCompare(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function findParentNode(rootMap, targetId) {
  let parent = null;
  (function visit(candidate) {
    if (!candidate || parent) return;
    if ((candidate.children || []).some((child) => child.id === targetId)) {
      parent = candidate;
      return;
    }
    (candidate.children || []).forEach(visit);
  })(rootMap);
  return parent;
}

function siblingTitleExists(parentNode, title, ignoreId = null) {
  const needle = normalizeTitleForCompare(title);
  if (!parentNode || !needle) return false;
  return (parentNode.children || []).some(
    (child) => child.id !== ignoreId && normalizeTitleForCompare(child.title) === needle
  );
}

function uniqueLocalTitle(parentNode) {
  const base = 'Новая планета';
  if (!siblingTitleExists(parentNode, base)) return base;
  let index = 2;
  while (siblingTitleExists(parentNode, `${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

let localSequence = 0;
function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`;
  }
  localSequence += 1;
  return `local-${Date.now().toString(36)}-${localSequence.toString(36)}`;
}

function collectSubtreeIds(node, accumulator = []) {
  if (!node) return accumulator;
  accumulator.push(node.id);
  (node.children || []).forEach((child) => collectSubtreeIds(child, accumulator));
  return accumulator;
}

export function useLocalMapActions({ rootMap, setCustomObjects, setTitleAliases }) {
  const validateSiblingTitle = useCallback(
    (node, rawTitle, ignoreId = node?.id || null) => {
      const title = String(rawTitle || '').trim();
      if (!title) return { ok: false, error: 'Название не может быть пустым.' };
      const parentNode = node?.id ? findParentNode(rootMap, node.id) : null;
      if (parentNode && siblingTitleExists(parentNode, title, ignoreId)) {
        return { ok: false, error: 'Такой объект уже есть на этой орбите. Выбери другое название.' };
      }
      return { ok: true, title };
    },
    [rootMap]
  );

  const getUniqueLocalTitle = useCallback(
    (parentId) => {
      const parentNode = findNode(rootMap, parentId);
      if (!parentNode) return { ok: false, error: 'Не нашёл этот уровень на карте.' };
      if (isLeafNode(parentNode)) return { ok: false, error: 'Внутри этой записи нельзя создать планету.' };
      return { ok: true, title: uniqueLocalTitle(parentNode) };
    },
    [rootMap]
  );

  const createLocalObject = useCallback(
    (parentId, rawTitle) => {
      const parentNode = findNode(rootMap, parentId);
      if (!parentNode) return { ok: false, error: 'Не нашёл этот уровень на карте.' };
      if (isLeafNode(parentNode)) return { ok: false, error: 'Внутри этой записи нельзя создать планету.' };
      const title = String(rawTitle || '').trim() || uniqueLocalTitle(parentNode);
      if (siblingTitleExists(parentNode, title)) {
        return { ok: false, error: 'Такой объект уже есть на этой орбите. Выбери другое название.' };
      }
      const id = createLocalId();
      setCustomObjects((previous) => ({
        ...previous,
        [parentId]: [
          ...(previous[parentId] || []),
          { id, title, icon: 'OB', createdAt: new Date().toISOString() },
        ],
      }));
      return { ok: true, id, title };
    },
    [rootMap, setCustomObjects]
  );

  const renameLocal = useCallback(
    (node, rawTitle) => {
      const validation = validateSiblingTitle(node, rawTitle, node?.id || null);
      if (!validation.ok) return validation;
      if (validation.title === node.title) return { ok: true, unchanged: true, title: validation.title };
      setTitleAliases((previous) => ({ ...previous, [node.id]: validation.title }));
      return { ok: true, title: validation.title };
    },
    [setTitleAliases, validateSiblingTitle]
  );

  const deleteLocalObject = useCallback(
    (node) => {
      if (!node?.raw?.local) return { ok: false, error: 'Удалять можно только локальные объекты.' };
      const subtreeIds = new Set(collectSubtreeIds(node));
      setCustomObjects((previous) => {
        const next = { ...previous };
        Object.keys(next).forEach((parentId) => {
          next[parentId] = (next[parentId] || []).filter((item) => !subtreeIds.has(item.id));
          if (!next[parentId].length) delete next[parentId];
        });
        subtreeIds.forEach((id) => delete next[id]);
        return next;
      });
      setTitleAliases((previous) => {
        const next = { ...previous };
        subtreeIds.forEach((id) => delete next[id]);
        return next;
      });
      return { ok: true, deletedIds: [...subtreeIds] };
    },
    [setCustomObjects, setTitleAliases]
  );

  return {
    validateSiblingTitle,
    getUniqueLocalTitle,
    createLocalObject,
    renameLocal,
    deleteLocalObject,
  };
}
