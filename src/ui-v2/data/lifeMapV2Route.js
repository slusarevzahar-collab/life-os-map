// LifeMap UI V2 — lifeMapV2Route (Stage 4)
// Owns reading, validating, and persisting the UI V2 route. Storage contains
// only ids; camera origins are reconstructed from the visual adapter.
import { isLeafNode } from '../../lib/actionMapModel.js';

export const ROUTE_V2_KEY = 'lifemap.ui-v2.route.v1';
const LEGACY_ROUTE_KEY = 'lifemap.route.v1'; // read-only fallback, never written
const ROOT_ORIGIN = { x: 640, y: 400 };

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isStringIdArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0);
}

function readHashRouteIds() {
  if (typeof window === 'undefined') return null;
  const hash = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!hash) return null;
  const parts = hash
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .filter(Boolean);
  if (!parts.length) return null;
  return parts[0] === 'root' ? parts : ['root', ...parts];
}

// Priority on first real-data load: V2 key, hash, then the legacy key read-only.
export function readInitialRouteIds() {
  const own = readJson(ROUTE_V2_KEY, null);
  if (isStringIdArray(own)) return own;
  const fromHash = readHashRouteIds();
  if (isStringIdArray(fromHash)) return fromHash;
  const legacy = readJson(LEGACY_ROUTE_KEY, null);
  if (isStringIdArray(legacy)) return legacy;
  return ['root'];
}

export function persistRouteIds(ids) {
  if (typeof window === 'undefined') return;
  try {
    const safe = isStringIdArray(ids) ? ids : ['root'];
    window.localStorage.setItem(ROUTE_V2_KEY, JSON.stringify(safe));
  } catch {
    // Best-effort persistence only.
  }
}

// Validates both the real parent-child sequence and the visual navigation
// surface. The optional visual lookup rejects real model branches that are not
// exposed as map planets in UI V2 (notably root/sphere-inbox).
export function validateRouteIds(ids, rootMap, getVisualLevel) {
  const rootId = rootMap?.id || 'root';
  if (!isStringIdArray(ids) || ids[0] !== rootId) return [rootId];

  const out = [rootId];
  let current = rootMap;
  for (let index = 1; index < ids.length; index += 1) {
    const nextId = ids[index];
    const child = (current.children || []).find((item) => item?.id === nextId && !isLeafNode(item));
    const visualParent = typeof getVisualLevel === 'function' ? getVisualLevel(current.id) : null;
    const visuallyNavigable = !getVisualLevel || visualParent?.planets?.some(
      (planet) => planet.id === nextId && planet.navigable !== false
    );
    if (!child || !visuallyNavigable) break;
    out.push(nextId);
    current = child;
  }
  return out;
}

// Reconstructs design-space origins from the matching planet in each parent.
// The shell may subsequently pass those points through a saved per-level
// viewport so ascend returns through the actual visual position.
export function deriveRouteFrames(ids, getVisualLevel) {
  const safeIds = isStringIdArray(ids) ? ids : ['root'];
  const frames = [{ id: safeIds[0], origin: ROOT_ORIGIN }];
  for (let index = 1; index < safeIds.length; index += 1) {
    const parentLevel = getVisualLevel(safeIds[index - 1]);
    const planet = parentLevel?.planets?.find((item) => item.id === safeIds[index]);
    frames.push({
      id: safeIds[index],
      origin: planet ? { x: planet.x, y: planet.y } : ROOT_ORIGIN,
    });
  }
  return frames;
}

export function sameRouteIds(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((id, index) => id === b[index]);
}

export function sameRouteFrames(a, b, epsilon = 0.05) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((frame, index) => {
    const other = b[index];
    return frame?.id === other?.id &&
      Math.abs(Number(frame?.origin?.x) - Number(other?.origin?.x)) <= epsilon &&
      Math.abs(Number(frame?.origin?.y) - Number(other?.origin?.y)) <= epsilon;
  });
}
