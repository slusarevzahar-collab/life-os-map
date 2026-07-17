// LifeMap UI V2 — lifeMapUiAdapter (Stage 4)
// Pure translation of the REAL LifeMap tree (buildActionMap's rootMap, from
// src/lib/actionMapModel.js — imported, never reimplemented) into the flat,
// id-keyed visual-level map OrbitSystem/LifeMapShell already understand — the
// exact same shape mapTreeMock.js used to provide:
//   { [nodeId]: { id, title, sublabel, parentId, core, rings, planets } }
// so LifeMapShell's existing `mapData[currentFrame.id]`-style lookups keep
// working unchanged once `mapTreeMock` is swapped for this adapter's output.
//
// Only branch (non-leaf) children ever become planets — isLeafNode() from
// actionMapModel.js decides that, never reimplemented. Leaf tasks stay purely
// as data (their count feeds the metric text) and are not turned into
// navigation planets just to fill the map; SideList (Stage 5) will read them.
//
// sphere-inbox is walked and KEPT in the flat map like every other node (so it
// remains part of the real model, addressable by id) — it is only left out of
// the ROOT level's own `planets` array. That exclusion happens nowhere else.
import { isLeafNode } from '../../lib/actionMapModel.js';

export const INBOX_SPHERE_ID = 'sphere-inbox';

const CENTER = { x: 640, y: 400 };
// Radius of ring N (index 0 = first ring). Ring "size" (diameter) fed to
// OrbitSystem is radius * 2, matching the approved design's 500px root ring
// (radius 250) and giving each further ring 100px of breathing room.
const RING_RADII = [250, 350, 450, 550, 650];
const RING_STEP = 100;
// Angles are tried in this fixed order on every ring: cardinal points first
// (matching the three approved root positions below), then diagonals. This is
// the "predictable corner slots" layout — deterministic, no Math.random, and
// stable across refreshes as long as the composition of children is stable.
const CANDIDATE_ANGLES_DEG = [-90, 0, 180, 90, -45, 45, -135, 135];

// Approved Claude Design root positions — used ONLY at the root level, and
// ONLY when the corresponding id is actually present in the real tree.
const ROOT_FIXED_SLOTS = {
  'sphere-projects': { x: 640, y: 150 },
  'sphere-goals': { x: 890, y: 400 },
  'sphere-backlog': { x: 390, y: 400 },
};

const ROOT_CORE_SIZE = 196;
const ROOT_PLANET_SIZE = 120;
const DEPTH1_CORE_SIZE = 176;
const DEPTH1_PLANET_SIZE = 116;
const DEPTH2_CORE_SIZE = 160;
const DEPTH2_PLANET_SIZE = 108;

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Russian plural for "N направление/направления/направлений" — small, local,
// deterministic; not a generic i18n dependency.
function pluralDirections(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'направлений';
  if (mod10 === 1 && mod100 !== 11) word = 'направление';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'направления';
  return `${count} ${word}`;
}

// Metric text: prefer real task counts, then child-branch count, then the
// node's own progress, then its status/subtitle. Never a second independent
// percentage — `progress` below always comes straight from node.progress.
export function deriveMetric(node) {
  const directLeaves = [...(node?.taskList || []), ...(node?.children || []).filter((item) => isLeafNode(item))]
    .filter((item, index, items) => item?.id && items.findIndex((next) => next.id === item.id) === index);
  const explicitTotal = Number(node?.totalTasks) || 0;
  const total = explicitTotal > 0 ? explicitTotal : directLeaves.length;
  if (total > 0) {
    const explicitDone = Number(node?.completedTasks) || 0;
    const done = explicitTotal > 0
      ? explicitDone
      : directLeaves.filter((item) => item.state === 'done' || clampPercent(item.progress) === 100).length;
    return `${Math.min(done, total)}/${total} готово`;
  }
  const childCount = (node?.children || []).filter((item) => item && !isLeafNode(item)).length;
  if (childCount > 0) return pluralDirections(childCount);
  const progress = clampPercent(node?.progress);
  if (progress > 0) return `${progress}%`;
  return node?.status || node?.subtitle || 'нет данных';
}

function isEmptyBranch(node) {
  const hasTasks = Number(node?.totalTasks) > 0;
  const hasChildren = Array.isArray(node?.children) && node.children.length > 0;
  return !hasTasks && !hasChildren;
}

function coreSizeForDepth(depth) {
  if (depth <= 0) return ROOT_CORE_SIZE;
  if (depth === 1) return DEPTH1_CORE_SIZE;
  return DEPTH2_CORE_SIZE;
}

function planetSizeForDepth(depth) {
  if (depth <= 0) return ROOT_PLANET_SIZE;
  if (depth === 1) return DEPTH1_PLANET_SIZE;
  return DEPTH2_PLANET_SIZE;
}

function radiusForRing(index) {
  if (index < RING_RADII.length) return RING_RADII[index];
  return RING_RADII[RING_RADII.length - 1] + (index - RING_RADII.length + 1) * RING_STEP;
}

function angleToPoint(deg, radius) {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER.x + radius * Math.cos(rad), y: CENTER.y + radius * Math.sin(rad) };
}

function toPlanetFields(node, x, y, size) {
  return {
    id: node.id,
    title: node.title || 'Без названия',
    metric: deriveMetric(node),
    progress: clampPercent(node.progress),
    x,
    y,
    size,
    variant: isEmptyBranch(node) ? 'muted' : 'default',
    navigable: true,
  };
}

// Deterministic ring layout. `children` is the ALREADY-FILTERED list of
// navigable (non-leaf) nodes to place, in their original data order (never
// reordered, never silently sliced — every entry gets a slot, promoting
// overflow to further rings as needed).
function layoutPlanets(children, isRootLevel, depth) {
  const size = planetSizeForDepth(depth);
  const placed = [];
  const remaining = [];

  if (isRootLevel) {
    for (const child of children) {
      const slot = ROOT_FIXED_SLOTS[child.id];
      if (slot) placed.push(toPlanetFields(child, slot.x, slot.y, size));
      else remaining.push(child);
    }
  } else {
    remaining.push(...children);
  }

  const usedRing0Angles = new Set();
  for (const planet of placed) {
    const deg = Math.round((Math.atan2(planet.y - CENTER.y, planet.x - CENTER.x) * 180) / Math.PI);
    usedRing0Angles.add(deg);
  }

  let ringIndex = 0;
  let angleCursor = 0;
  let maxRingUsed = placed.length ? 0 : -1;

  for (const child of remaining) {
    // find the next free candidate angle, wrapping onto further rings once a
    // ring's candidate list is exhausted
    for (;;) {
      if (angleCursor >= CANDIDATE_ANGLES_DEG.length) {
        angleCursor = 0;
        ringIndex += 1;
      }
      const deg = CANDIDATE_ANGLES_DEG[angleCursor];
      angleCursor += 1;
      const occupied = ringIndex === 0 && usedRing0Angles.has(deg);
      if (occupied) continue;
      const radius = radiusForRing(ringIndex);
      const point = angleToPoint(deg, radius);
      placed.push(toPlanetFields(child, round1(point.x), round1(point.y), size));
      if (ringIndex === 0) usedRing0Angles.add(deg);
      maxRingUsed = Math.max(maxRingUsed, ringIndex);
      break;
    }
  }

  const ringsUsedCount = Math.max(maxRingUsed + 1, placed.length ? 1 : 0);
  const rings = Array.from({ length: Math.max(ringsUsedCount, 1) }, (_, index) => radiusForRing(index) * 2);
  return { planets: placed, rings };
}

function sublabelFor(node, depth) {
  if (depth <= 0) return 'HOME';
  const text = (node.subtitle || node.status || 'ветка').toString();
  return text.toUpperCase();
}

// Builds the flat, id-keyed visual map for the WHOLE real tree in one pass.
// Cycle-safe (a node already visited is never re-walked). sphere-inbox and its
// descendants are still walked and present in the returned map — only the
// ROOT level's own `planets` array excludes it.
export function buildVisualTree(rootMap) {
  const flat = {};
  if (!rootMap || !rootMap.id) return flat;

  function walk(node, parentId, depth, isRootLevel) {
    if (!node || !node.id || flat[node.id]) return;
    const branchChildren = (node.children || []).filter((child) => child && !isLeafNode(child));
    const visibleChildren = isRootLevel
      ? branchChildren.filter((child) => child.id !== INBOX_SPHERE_ID)
      : branchChildren;
    const { planets, rings } = layoutPlanets(visibleChildren, isRootLevel, depth);

    flat[node.id] = {
      id: node.id,
      title: node.title || 'LifeMap',
      sublabel: sublabelFor(node, depth),
      parentId,
      core: {
        title: node.title || 'LifeMap',
        sublabel: sublabelFor(node, depth),
        size: coreSizeForDepth(depth),
      },
      rings,
      planets,
    };

    branchChildren.forEach((child) => walk(child, node.id, depth + 1, false));
  }

  walk(rootMap, null, 0, true);
  return flat;
}
