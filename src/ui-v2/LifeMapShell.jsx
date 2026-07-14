// LifeMap UI V2 — root shell (Stage 5B1).
// Keeps Stage 2/3 camera/morph/pill/HUD logic and the reviewer's Stage-4
// fixes to route/visual-bundle swapping EXACTLY as committed (single request
// in flight lives in useLifeMapSnapshot, last-good snapshot lives there too,
// the visual bundle only swaps when camera+morph are idle, route validation
// checks both the real tree AND the visual planet list via
// validateRouteIds(ids, rootMap, getVisualLevel), origins are recomputed
// through the parent level's saved viewport). Stage 5A workspace/menu/dialog/
// toast logic is unchanged. Stage 5B1 adds: live Inbox/Assistant windows
// (real props instead of hudMock), an assistant boot target
// (pendingWindowTargetRef) and the Inbox → Assistant close→open morph
// sequence, plus "Обсудить с AI" wiring for task rows, the detail panel and
// the context menu.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StageScaler } from './stage/StageScaler.jsx';
import { SpaceBackground } from './stage/SpaceBackground.jsx';
import { MapViewport, defaultViewport } from './stage/MapViewport.jsx';
import { useCameraFlight } from './stage/useCameraFlight.js';
import { pointThroughViewport } from './stage/cameraMath.js';
import { OrbitSystem } from './map/OrbitSystem.jsx';
import { mapTreeMock } from './mock/mapTreeMock.js';
import { TopHud } from './hud/TopHud.jsx';
import { MissionControl } from './mission/MissionControl.jsx';
import { LauncherPill, snapPillPosition } from './dock/LauncherPill.jsx';
import { useWindowMorph, WINDOW_RECTS } from './dock/useWindowMorph.js';
import { InboxWindow } from './windows/InboxWindow.jsx';
import { AssistantWindow } from './windows/AssistantWindow.jsx';
import { missionControlMock } from './mock/hudMock.js';

import { buildActionMap, findNode, isLeafNode, isDoneNode } from '../lib/actionMapModel.js';
import {
  applyTitleAliases,
  resolveFocus,
  buildFocusSequence,
  listItems,
  canPatchTask,
  canRenameNode,
  focusCandidateFromNode,
  toFocusItem,
} from '../lib/lifeMapSelectors.js';
import { useLifeMapSnapshot } from './data/useLifeMapSnapshot.js';
import { useLocalMapExtensions, useFocusQueue, attachCustomObjects } from './adapters/localMapExtensions.js';
import { buildVisualTree } from './adapters/lifeMapUiAdapter.js';
import { normalizeSignalFromMap } from './adapters/inboxUiAdapter.js';
import {
  readInitialRouteIds,
  validateRouteIds,
  deriveRouteFrames,
  persistRouteIds,
  sameRouteFrames,
} from './data/lifeMapV2Route.js';
import { useLifeMapActions } from './data/useLifeMapActions.js';
import { useLocalMapActions } from './data/useLocalMapActions.js';
import { TaskWorkspace } from './tasks/TaskWorkspace.jsx';
import { TaskDetailPanel } from './tasks/TaskDetailPanel.jsx';
import { ContextMenuV2, clientPointToDesignBox } from './context/ContextMenuV2.jsx';
import { TextInputDialogV2 } from './dialogs/TextInputDialogV2.jsx';
import { ToastStack } from './feedback/ToastStack.jsx';
import { WorkTimerWidget } from '../components/WorkTimerWidget.jsx';

const ROOT_ID = 'root';
const ROOT_ORIGIN = { x: 640, y: 400 };
const DESIGN_WIDTH = 1280;
const PILL_START = { x: 1122, y: 710 };
const EMPTY_VISUAL_MAP = {
  root: {
    id: ROOT_ID,
    title: 'LifeMap',
    sublabel: 'HOME',
    parentId: null,
    core: { title: 'LifeMap', sublabel: 'HOME', size: 196 },
    rings: [500],
    planets: [],
  },
};

const STATUS_INFO = {
  loading: { label: 'LOADING', tone: 'loading' },
  connected: { label: 'CONNECTED', tone: 'connected' },
  'mock data': { label: 'MOCK', tone: 'mock' },
  'api offline': { label: 'OFFLINE', tone: 'offline' },
  stale: { label: 'STALE', tone: 'offline' },
};

function isDebugMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('uiv2debug') === '1';
}

function isFixtureMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('fixture') === '1';
}

let toastSeq = 0;
function nextToastId() {
  toastSeq += 1;
  return `toast-${Date.now().toString(36)}-${toastSeq}`;
}

export function LifeMapShell() {
  const [route, setRoute] = useState([{ id: ROOT_ID, origin: ROOT_ORIGIN }]);
  const [viewportByLevel, setViewportByLevel] = useState({});
  const [dragging, setDragging] = useState(false);
  const [pill, setPill] = useState(PILL_START);
  const [pillDragging, setPillDragging] = useState(false);
  const [pillGhost, setPillGhost] = useState(false);
  const [pillLabelGhost, setPillLabelGhost] = useState(false);

  const pendingEntryRef = useRef(null);
  const homeChainRef = useRef(false);
  const stageScaleRef = useRef(1);
  const frameRef = useRef(null);
  const pillRef = useRef(null);
  const inboxSegRef = useRef(null);
  const aiSegRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const pendingWindowTargetRef = useRef(null);
  const menuReturnFocusRef = useRef(null);
  const dialogReturnFocusRef = useRef(null);
  const detailReturnFocusRef = useRef(null);
  const restoredRouteRef = useRef(false);
  const debugMode = useRef(isDebugMode()).current;
  const fixtureMode = useRef(isFixtureMode()).current;

  // Stage 5B1: boot payload for the Assistant window ({ target, context }).
  const [assistantBoot, setAssistantBoot] = useState(null);
  // Stage 5B1 fix2: bumped after an Assistant AI action succeeds, so a
  // mounted InboxWindow's useInboxData knows its data may be stale (the two
  // windows are mutually exclusive today via the morph, so this is
  // forward-compatible more than load-bearing right now).
  const [inboxRefreshRevision, setInboxRefreshRevision] = useState(0);
  const bumpInboxRefreshRevision = useCallback(() => setInboxRefreshRevision((value) => value + 1), []);

  const snapshotState = useLifeMapSnapshot({ enabled: !fixtureMode });
  const handleWorkSessionChange = useCallback(() => { snapshotState.refresh(); }, [snapshotState.refresh]);
  const { titleAliases, setTitleAliases, customObjects, setCustomObjects } = useLocalMapExtensions();
  const [focusQueue, setFocusQueue] = useFocusQueue();

  const baseRootMap = useMemo(() => {
    try {
      return buildActionMap(snapshotState.snapshot);
    } catch {
      return null;
    }
  }, [snapshotState.snapshot]);

  const rootMap = useMemo(() => {
    if (!baseRootMap) return null;
    try {
      return applyTitleAliases(attachCustomObjects(baseRootMap, customObjects), titleAliases);
    } catch {
      return baseRootMap;
    }
  }, [baseRootMap, customObjects, titleAliases]);

  const rootMapLooksEmpty = useMemo(() => {
    if (!rootMap) return true;
    return !(rootMap.children || []).some((child) => (child.children || []).length || (child.taskList || []).length);
  }, [rootMap]);
  const snapshotIsMock = String(snapshotState.snapshot?.meta?.source || '').toLowerCase().includes('mock');

  const latestMapData = useMemo(() => {
    if (fixtureMode) return mapTreeMock;
    if (!rootMap || rootMapLooksEmpty || snapshotIsMock) return EMPTY_VISUAL_MAP;
    try {
      const built = buildVisualTree(rootMap);
      return built && built.root ? built : EMPTY_VISUAL_MAP;
    } catch {
      return EMPTY_VISUAL_MAP;
    }
  }, [fixtureMode, rootMap, rootMapLooksEmpty, snapshotIsMock]);

  const latestMapMode = fixtureMode ? 'fixture' : latestMapData === EMPTY_VISUAL_MAP ? 'empty' : 'real';
  const latestMapIsFallback = latestMapMode !== 'real';
  const latestVisualBundle = useMemo(
    () => ({ mapData: latestMapData, rootMap, mapIsFallback: latestMapIsFallback, mode: latestMapMode }),
    [latestMapData, rootMap, latestMapIsFallback, latestMapMode]
  );
  const [visualBundle, setVisualBundle] = useState(() => latestVisualBundle);
  const visualMapData = visualBundle.mapData;
  const visualMapIsFallback = visualBundle.mapIsFallback;

  const activeFocus = useMemo(() => {
    if (latestMapIsFallback || !rootMap) return null;
    try {
      return resolveFocus(rootMap, snapshotState.snapshot, focusQueue);
    } catch {
      return null;
    }
  }, [latestMapIsFallback, rootMap, snapshotState.snapshot, focusQueue]);

  const focusQueueItems = useMemo(() => {
    if (latestMapIsFallback || !rootMap || !activeFocus) return [];
    try {
      return buildFocusSequence(rootMap, activeFocus, focusQueue);
    } catch {
      return [];
    }
  }, [latestMapIsFallback, rootMap, activeFocus, focusQueue]);

  const missionControlData = useMemo(() => {
    if (fixtureMode) return missionControlMock;
    const now =
      activeFocus?.nextAction && activeFocus.title !== 'Фокус не выбран'
        ? `${activeFocus.title} — ${activeFocus.nextAction}`
        : activeFocus?.title || 'Фокус не выбран';
    const rest = focusQueueItems.slice(1);
    const next = rest[0]?.title || 'Очередь пуста';
    const queue = rest.slice(0, 12).map((item, index) => ({ n: String(index + 1).padStart(2, '0'), title: item.title }));
    return { now, next, queue };
  }, [fixtureMode, activeFocus, focusQueueItems]);

  const effectiveStatus = fixtureMode
    ? 'mock data'
    : snapshotState.isStale && snapshotState.status === 'api offline'
      ? 'stale'
      : snapshotState.status;
  const statusInfo = STATUS_INFO[effectiveStatus] || STATUS_INFO.connected;
  const networkWritable = snapshotState.status === 'connected' && !visualMapIsFallback;

  // Stage 5B1: map-derived signals as the Inbox fallback when the assets
  // endpoint returns nothing (same idea as legacy AIInboxV2's mapSignals).
  const inboxFallbackSignals = useMemo(() => {
    const root = visualBundle.rootMap;
    if (!root) return [];
    const sphere = findNode(root, 'sphere-inbox');
    if (!sphere) return [];
    try {
      return listItems(sphere).filter((item) => item.kind === 'signal').map(normalizeSignalFromMap);
    } catch {
      return [];
    }
  }, [visualBundle.rootMap]);

  const cameraFlight = useCameraFlight({
    onSwap: (targetId, mode, flightOrigin) => {
      pendingEntryRef.current = { mode, origin: flightOrigin };
      setRoute((prev) => {
        if (mode === 'ascend') return prev.slice(0, -1);
        if (mode === 'lateral') {
          const parentFrame = prev.length > 1 ? prev[prev.length - 2] : null;
          const parentLevel = parentFrame ? visualMapData[parentFrame.id] : null;
          const targetInParent = parentLevel?.planets?.find((planet) => planet.id === targetId);
          const parentViewport = parentFrame
            ? viewportByLevel[parentFrame.id] || defaultViewport()
            : defaultViewport();
          const routeOrigin = targetInParent
            ? pointThroughViewport(targetInParent, parentViewport)
            : flightOrigin;
          return [...prev.slice(0, -1), { id: targetId, origin: routeOrigin }];
        }
        return [...prev, { id: targetId, origin: flightOrigin }];
      });
    },
  });

  const morph = useWindowMorph({
    cameraLayerRef: cameraFlight.layerRef,
    onClosed: (target) => {
      pendingFocusRef.current = target;
      setPillGhost(false);
      setPillLabelGhost(false);
      if (target === 'assistant') setAssistantBoot(null);
    },
    onPillLabelReveal: () => setPillLabelGhost(false),
    onPillSkinReveal: () => setPillGhost(false),
  });

  const currentFrame = route[route.length - 1];
  const level = visualMapData[currentFrame.id] || visualMapData.root || EMPTY_VISUAL_MAP.root;
  const parentFrame = route.length > 1 ? route[route.length - 2] : null;
  const flying = cameraFlight.phase !== 'idle';
  const windowActive = morph.isActive;
  const busy = flying || morph.isBusy;
  const baseInteractionLocked = busy || windowActive || pillDragging;

  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [detailNodeId, setDetailNodeId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [toasts, setToasts] = useState([]);
  const interactionLocked = baseInteractionLocked || Boolean(dialog) || Boolean(menu);

  const addToast = useCallback((kind, message) => {
    if (!message) return;
    setToasts((previous) => [...previous, { id: nextToastId(), kind, message }]);
  }, []);
  const dismissToast = useCallback((id) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const actions = useLifeMapActions({ refresh: snapshotState.refresh, networkAvailable: networkWritable });
  const localActions = useLocalMapActions({ rootMap: visualBundle.rootMap || rootMap, setCustomObjects, setTitleAliases });

  const currentTaskNode = useMemo(() => {
    if (visualMapIsFallback || !visualBundle.rootMap) return null;
    return findNode(visualBundle.rootMap, currentFrame.id);
  }, [visualMapIsFallback, visualBundle.rootMap, currentFrame.id]);

  const taskItems = useMemo(() => {
    if (!currentTaskNode) return [];
    try {
      return listItems(currentTaskNode).filter((item) => isLeafNode(item));
    } catch {
      return [];
    }
  }, [currentTaskNode]);

  const detailNode = useMemo(() => {
    if (!detailNodeId || !visualBundle.rootMap) return null;
    return findNode(visualBundle.rootMap, detailNodeId) || null;
  }, [detailNodeId, visualBundle.rootMap]);

  const restoreFocus = useCallback((ref) => {
    const element = ref.current;
    ref.current = null;
    if (!element) return;
    window.requestAnimationFrame(() => {
      if (element.isConnected && typeof element.focus === 'function') element.focus();
    });
  }, []);

  const closeMenu = useCallback((restore = true) => {
    setMenu(null);
    if (restore) restoreFocus(menuReturnFocusRef);
    else menuReturnFocusRef.current = null;
  }, [restoreFocus]);

  const closeDialog = useCallback((restore = true) => {
    setDialog(null);
    setDialogError('');
    if (restore) restoreFocus(dialogReturnFocusRef);
    else dialogReturnFocusRef.current = null;
  }, [restoreFocus]);

  const closeDetails = useCallback((restore = true) => {
    setDetailNodeId(null);
    if (restore) restoreFocus(detailReturnFocusRef);
    else detailReturnFocusRef.current = null;
  }, [restoreFocus]);

  useEffect(() => {
    if (detailNodeId && visualBundle.rootMap && !findNode(visualBundle.rootMap, detailNodeId)) closeDetails(false);
  }, [closeDetails, detailNodeId, visualBundle.rootMap]);

  useEffect(() => {
    if (flying) {
      closeMenu(false);
      closeDialog(false);
    }
  }, [closeDialog, closeMenu, flying]);
  useEffect(() => {
    if (windowActive) {
      closeMenu(false);
      closeDialog(false);
    }
  }, [closeDialog, closeMenu, windowActive]);
  useEffect(() => {
    closeMenu(false);
    closeDialog(false);
  }, [closeDialog, closeMenu, currentFrame.id]);

  useEffect(() => {
    const measure = () => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) stageScaleRef.current = rect.width / DESIGN_WIDTH;
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('orientationchange', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  useEffect(() => {
    const pending = pendingEntryRef.current;
    if (!pending) return;
    pendingEntryRef.current = null;
    cameraFlight.playEntry(pending.mode, pending.origin);
  }, [currentFrame.id]);

  useEffect(() => {
    if (!homeChainRef.current || cameraFlight.phase !== 'idle') return;
    if (route.length <= 1) {
      homeChainRef.current = false;
      return;
    }
    ascendOnce();
  }, [cameraFlight.phase, route.length]);

  useEffect(() => {
    if (morph.state !== 'closed' || !pendingFocusRef.current) return undefined;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const frameId = window.requestAnimationFrame(() => {
      const segment = target === 'assistant' ? aiSegRef.current : inboxSegRef.current;
      segment?.focus?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [morph.state]);

  const getViewport = (levelId) => viewportByLevel[levelId] || defaultViewport();
  const setViewport = (levelId, next) => setViewportByLevel((prev) => ({ ...prev, [levelId]: next }));

  const deriveFramesForMap = (ids, data) => {
    const frames = deriveRouteFrames(ids, (id) => data[id]);
    return frames.map((frame, index) => {
      if (index === 0) return frame;
      const parentId = ids[index - 1];
      const planet = data[parentId]?.planets?.find((item) => item.id === frame.id);
      if (!planet) return frame;
      return { ...frame, origin: pointThroughViewport(planet, getViewport(parentId)) };
    });
  };

  useEffect(() => {
    if (flying || morph.isBusy) return;
    const nextBundle = latestVisualBundle;
    setVisualBundle((current) => (current === nextBundle ? current : nextBundle));
    setRoute((currentRoute) => {
      if (nextBundle.mapIsFallback || !nextBundle.rootMap || !snapshotState.hasLoadedOnce) {
        if (!nextBundle.mapData[currentRoute[currentRoute.length - 1]?.id]) return [{ id: ROOT_ID, origin: ROOT_ORIGIN }];
        return currentRoute;
      }
      const sourceIds = restoredRouteRef.current ? currentRoute.map((frame) => frame.id) : readInitialRouteIds();
      const validIds = validateRouteIds(sourceIds, nextBundle.rootMap, (id) => nextBundle.mapData[id]);
      const nextFrames = deriveFramesForMap(validIds, nextBundle.mapData);
      restoredRouteRef.current = true;
      return sameRouteFrames(currentRoute, nextFrames) ? currentRoute : nextFrames;
    });
  }, [latestVisualBundle, flying, morph.isBusy, snapshotState.hasLoadedOnce, viewportByLevel]);

  useEffect(() => {
    if (visualMapIsFallback || !restoredRouteRef.current || !snapshotState.hasLoadedOnce) return;
    persistRouteIds(route.map((frame) => frame.id));
  }, [route, visualMapIsFallback, snapshotState.hasLoadedOnce]);

  const handlePlanetActivate = (planet) => {
    if (interactionLocked || cameraFlight.isFlying()) return;
    const targetLevel = visualMapData[planet.id];
    if (!targetLevel) return;
    const isSameParent = targetLevel.parentId === level?.parentId && targetLevel.id !== currentFrame.id;
    const mode = isSameParent && level?.parentId != null ? 'lateral' : 'descend';
    const visualOrigin = pointThroughViewport(planet, getViewport(currentFrame.id));
    cameraFlight.flyTo(mode, visualOrigin, planet.id);
  };

  function ascendOnce() {
    const current = route[route.length - 1];
    const parent = route.length > 1 ? route[route.length - 2] : null;
    if (!parent || cameraFlight.isFlying()) return;
    cameraFlight.flyTo('ascend', current.origin, parent.id);
  }

  const handleBack = () => {
    if (interactionLocked || !parentFrame) return;
    ascendOnce();
  };
  const handleHome = () => {
    if (interactionLocked || route.length <= 1) return;
    homeChainRef.current = true;
    ascendOnce();
  };
  const handlePillDragEnd = (wasDragging) => {
    setPillDragging(false);
    if (wasDragging) setPill((current) => snapPillPosition(current.x, current.y));
  };

  const elementDesignRect = (element, radius = 18) => {
    const frame = frameRef.current;
    if (!element || !frame) return null;
    const scale = stageScaleRef.current || 1;
    const elementRect = element.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      x: (elementRect.left - frameRect.left) / scale,
      y: (elementRect.top - frameRect.top) / scale,
      w: elementRect.width / scale,
      h: elementRect.height / scale,
      r: radius,
    };
  };

  const launcherGeometry = (target) => {
    const segment = target === 'assistant' ? aiSegRef.current : inboxSegRef.current;
    const pillRect = elementDesignRect(pillRef.current, 18);
    const segmentRect = elementDesignRect(segment, 18);
    if (!pillRect || !segmentRect) return null;
    return {
      pillRect,
      segmentRect,
      cameraMode: route.length === 1 ? 'descend' : 'lateral',
      baseBackgroundPose: cameraFlight.pose,
    };
  };

  const openWindow = (target) => {
    if (interactionLocked) return;
    const geometry = launcherGeometry(target);
    if (!geometry) return;
    // Exact rule: the plain pill segment always opens GENERALLY — it never
    // carries a boot target, so it must never show a stale one left over
    // from an earlier "Обсудить с AI" call. openAssistantWindow(boot) below
    // is the ONLY path allowed to set a non-null assistantBoot.
    if (target === 'assistant') setAssistantBoot(null);
    setPillGhost(true);
    setPillLabelGhost(true);
    morph.open(target, geometry);
  };
  const closeWindow = () => {
    if (!morph.isActive) return;
    const geometry = launcherGeometry(morph.target) || launcherGeometry('inbox');
    if (geometry) morph.close(geometry);
  };
  const windowRectStyle = (target) => {
    const rect = WINDOW_RECTS[target];
    return rect ? { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` } : undefined;
  };

  const openAssistantWindow = useCallback((boot) => {
    if (flying || morph.isBusy || morph.isActive || pillDragging) return;
    const geometry = launcherGeometry('assistant');
    if (!geometry) return;
    setAssistantBoot(boot || null);
    setPillGhost(true);
    setPillLabelGhost(true);
    morph.open('assistant', geometry);
  }, [flying, morph, pillDragging]);

  const handleDiscussWithAi = useCallback((nodeOrTarget, extraContext = {}) => {
    if (!nodeOrTarget || flying || morph.isBusy) return;
    const boot = {
      target: {
        id: nodeOrTarget.id,
        sourceId: nodeOrTarget.sourceId || null,
        title: nodeOrTarget.title || '',
        status: nodeOrTarget.status || '',
        kind: nodeOrTarget.kind || 'node',
        code: nodeOrTarget.code || nodeOrTarget.icon || '',
        raw: nodeOrTarget.raw || {},
      },
      context: {
        mode: nodeOrTarget.kind || '',
        mapTitle: currentTaskNode?.title || level?.title || '',
        ...extraContext,
      },
    };
    if (menu) closeMenu(false);
    if (detailNodeId) closeDetails(false);
    if (morph.state === 'open') {
      pendingWindowTargetRef.current = boot;
      closeWindow();
      return;
    }
    if (morph.state === 'closed') openAssistantWindow(boot);
  }, [closeDetails, closeMenu, closeWindow, currentTaskNode, detailNodeId, flying, level, menu, morph, openAssistantWindow]);

  useEffect(() => {
    if (morph.state !== 'closed' || !pendingWindowTargetRef.current) return undefined;
    const boot = pendingWindowTargetRef.current;
    const frameId = window.requestAnimationFrame(() => {
      pendingWindowTargetRef.current = null;
      openAssistantWindow(boot);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [morph.state, openAssistantWindow]);

  const showBackNav = Boolean(parentFrame) && !windowActive;
  const showWorkspace = !flying && !windowActive && Boolean(currentTaskNode) && taskItems.length > 0;
  const handleToggleExpand = (id) => setExpandedTaskId((current) => (current === id ? null : id));

  const handleOpenDetails = (node) => {
    detailReturnFocusRef.current = menuReturnFocusRef.current || document.activeElement;
    closeMenu(false);
    setDetailNodeId(node.id);
  };
  const handleCloseDetails = useCallback(() => closeDetails(true), [closeDetails]);

  const handleDone = async (node) => {
    if (menu) closeMenu(true);
    const result = await actions.completeTask(node);
    if (result?.skipped) return result;
    addToast(result?.ok ? 'success' : 'error', result?.ok ? 'Готово: задача отмечена выполненной.' : result?.error);
    return result;
  };
  const handleRestore = async (node) => {
    if (menu) closeMenu(true);
    const result = await actions.restoreTask(node);
    if (result?.skipped) return result;
    addToast(result?.ok ? 'success' : 'error', result?.ok ? 'Задача возвращена в работу.' : result?.error);
    return result;
  };
  const handleSaveNote = async (node, note) => {
    const result = await actions.saveNote(node, note);
    if (result?.ok) addToast('success', 'Заметка сохранена.');
    else if (result?.error) addToast('error', result.error);
    return result;
  };
  const handleReorder = async (orderedItems) => {
    const result = await actions.reorderTasks(orderedItems);
    if (result?.skipped) return result;
    if (result?.ok && !result?.unchanged) addToast('success', 'Порядок задач сохранён.');
    if (!result?.ok) addToast('error', result?.error || 'Не удалось сохранить порядок.');
    return result;
  };

  const focusToast = (result, successMessage) => {
    if (result?.warning) addToast('warning', result.warning);
    else if (result?.ok) addToast('success', successMessage);
    else addToast('error', result?.error || 'Не удалось обновить фокус.');
  };
  const handleFocusNow = async (node) => {
    const candidate = focusCandidateFromNode(node);
    const focusItem = toFocusItem(candidate);
    closeMenu(true);
    if (!focusItem) return;
    const result = await actions.setFocusNow(candidate, focusItem, setFocusQueue);
    focusToast(result, 'Фокус обновлён.');
  };
  const handleFocusNext = async (node) => {
    const candidate = focusCandidateFromNode(node);
    const focusItem = toFocusItem(candidate);
    closeMenu(true);
    if (!focusItem) return;
    const result = await actions.setFocusNext(candidate, focusItem, setFocusQueue);
    focusToast(result, 'Добавлено в очередь.');
  };

  const handleOpenMenu = (node, point = {}) => {
    if (interactionLocked || !node) return;
    menuReturnFocusRef.current = point.returnFocus || document.activeElement;
    const { x, y } = clientPointToDesignBox(point.clientX, point.clientY, frameRef.current);
    const patchable = canPatchTask(node);
    setMenu({
      node,
      x,
      y,
      capabilities: {
        canPatch: patchable,
        done: isDoneNode(node),
        canRename: canRenameNode(node),
        renameDisabled: Boolean(node.sourceId) && !networkWritable,
        networkDisabled: !networkWritable,
        canFocus: node.id !== 'root',
        canCreateInside: !isLeafNode(node),
        canDelete: Boolean(node.raw?.local),
        canDiscuss: node.id !== 'root',
      },
    });
  };
  const handleCloseMenu = useCallback(() => closeMenu(true), [closeMenu]);

  const prepareDialog = (nextDialog) => {
    dialogReturnFocusRef.current = menuReturnFocusRef.current || document.activeElement;
    closeMenu(false);
    setDialogError('');
    setDialog(nextDialog);
  };
  const handleRenameRequest = (node) => prepareDialog({
    id: `rename-${node.id}`,
    mode: 'rename',
    node,
    title: `Переименовать «${node.title}»`,
    label: 'Название',
    placeholder: node.title,
    initialValue: node.title,
    confirmText: 'Сохранить',
  });
  const handleCreateInside = (node) => {
    const suggestion = localActions.getUniqueLocalTitle(node.id);
    if (!suggestion.ok) {
      closeMenu(true);
      addToast('error', suggestion.error);
      return;
    }
    prepareDialog({
      id: `create-${node.id}-${Date.now()}`,
      mode: 'create',
      node,
      title: `Новый объект внутри «${node.title}»`,
      label: 'Название',
      placeholder: suggestion.title,
      initialValue: suggestion.title,
      confirmText: 'Создать',
    });
  };
  const handleDeleteRequest = (node) => prepareDialog({
    id: `delete-${node.id}`,
    mode: 'confirm',
    node,
    title: 'Удалить объект?',
    message: `«${node.title}» и все его локальные вложенные объекты будут удалены. Это действие нельзя отменить.`,
    confirmText: 'Удалить',
  });
  const handleDialogCancel = () => {
    if (!dialogBusy) closeDialog(true);
  };

  const handleDialogSubmit = async (value) => {
    if (!dialog) return;
    setDialogError('');
    if (dialog.mode === 'confirm') {
      setDialogBusy(true);
      try {
        const deletedId = dialog.node.id;
        const result = localActions.deleteLocalObject(dialog.node);
        if (!result.ok) {
          setDialogError(result.error);
          addToast('error', result.error);
          return;
        }
        if (detailNodeId && result.deletedIds?.includes(detailNodeId)) closeDetails(false);
        setRoute((current) => {
          const deletedIndex = current.findIndex((frame) => result.deletedIds?.includes(frame.id));
          return deletedIndex > 0 ? current.slice(0, deletedIndex) : current;
        });
        addToast('success', `Объект «${dialog.node.title}» удалён.`);
        closeDialog(true);
        if (deletedId === currentFrame.id) setExpandedTaskId(null);
      } finally {
        setDialogBusy(false);
      }
      return;
    }

    const title = String(value || '').trim();
    const validation = localActions.validateSiblingTitle(dialog.node, title, dialog.mode === 'rename' ? dialog.node.id : null);
    if (!validation.ok) {
      setDialogError(validation.error);
      return;
    }

    setDialogBusy(true);
    try {
      if (dialog.mode === 'create') {
        const result = localActions.createLocalObject(dialog.node.id, validation.title);
        if (result.ok) {
          addToast('success', `Создано: «${result.title}».`);
          closeDialog(true);
        } else setDialogError(result.error);
        return;
      }
      if (dialog.node.sourceId) {
        const result = await actions.renameItem(dialog.node, validation.title);
        if (result?.ok) {
          addToast('success', 'Название обновлено в Notion.');
          closeDialog(true);
        } else setDialogError(result?.error || 'Не удалось переименовать.');
      } else {
        const result = localActions.renameLocal(dialog.node, validation.title);
        if (result.ok) {
          addToast('success', 'Название обновлено.');
          closeDialog(true);
        } else setDialogError(result.error);
      }
    } finally {
      setDialogBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && morph.isActive && !dialog) {
        event.preventDefault();
        closeWindow();
        return;
      }
      if (!(event.shiftKey && event.key === 'F10')) return;
      const activeRow = document.activeElement?.closest?.('[data-task-row-id]');
      if (!activeRow) return;
      const rowId = activeRow.getAttribute('data-task-row-id');
      const item = taskItems.find((entry) => entry.id === rowId);
      if (!item) return;
      event.preventDefault();
      const rect = activeRow.getBoundingClientRect();
      handleOpenMenu(item, {
        clientX: rect.left + 24,
        clientY: rect.top + rect.height / 2,
        returnFocus: document.activeElement,
      });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [taskItems, interactionLocked, networkWritable, morph.isActive, dialog, closeWindow]);

  const handleOpenMapNodeMenu = (nodeId, point) => {
    const node = visualBundle.rootMap ? findNode(visualBundle.rootMap, nodeId) : null;
    if (node) handleOpenMenu(node, point);
  };

  const menuActions = {
    onFocusNow: handleFocusNow,
    onFocusNext: handleFocusNext,
    onRename: handleRenameRequest,
    onOpenDetails: handleOpenDetails,
    onDone: handleDone,
    onRestore: handleRestore,
    onCreateInside: handleCreateInside,
    onDelete: handleDeleteRequest,
    onDiscussAi: handleDiscussWithAi,
  };

  return (
    <div className="lifemapV2">
      <div className="lifemapV2Backdrop">
        <SpaceBackground pose={morph.windowBackgroundPose || cameraFlight.pose} fullBleed />
      </div>
      <StageScaler>
        <div ref={frameRef} className={`lifemapV2Frame${dragging ? ' lifemapV2Dragging' : ''}`}>
          <div ref={cameraFlight.layerRef} className="lifemapV2CameraLayer">
            <MapViewport
              disabled={interactionLocked}
              viewport={getViewport(currentFrame.id)}
              onViewportChange={(next) => setViewport(currentFrame.id, next)}
              onDragStateChange={setDragging}
            >
              <OrbitSystem
                level={level}
                disabled={interactionLocked}
                onPlanetActivate={handlePlanetActivate}
                onCoreActivate={parentFrame ? handleBack : undefined}
                onOpenNodeMenu={handleOpenMapNodeMenu}
              />
            </MapViewport>
          </div>

          <div className="lifemapV2HudLayer">
            <TopHud
              showBackNav={showBackNav}
              locked={interactionLocked}
              onBack={handleBack}
              onHome={handleHome}
              statusLabel={statusInfo.label}
              statusTone={statusInfo.tone}
              statusTitle={snapshotState.error || undefined}
            />
            <MissionControl data={missionControlData} hidden={morph.hidesHud} />
            {!fixtureMode && (snapshotState.status === 'api offline' || latestMapMode === 'empty') ? (
              <section className="lifemapV2DataState" data-testid="lifemap-data-state" role="status">
                <b>
                  {snapshotState.isStale
                    ? 'Сохранённые данные'
                    : snapshotState.status === 'mock data'
                      ? 'Демо-данные отключены'
                      : 'Нет подключения к данным'}
                </b>
                <span>
                  {snapshotState.isStale
                    ? 'Показан последний валидный snapshot. Изменения временно недоступны.'
                    : snapshotState.status === 'mock data'
                      ? 'Backend вернул mock. Обычный режим его не показывает; для тестов используйте fixture=1.'
                    : snapshotState.status === 'api offline'
                      ? 'Демонстрационные объекты отключены. Проверьте API и повторите загрузку.'
                      : 'Источник подключён, но объектов для карты пока нет.'}
                </span>
                <button type="button" onClick={() => snapshotState.refresh().catch(() => {})}>Повторить</button>
              </section>
            ) : null}
            <div className="lifemapV2WorkTimerSlot" data-obscured={windowActive || Boolean(detailNode) || Boolean(dialog) ? 'true' : 'false'}>
              <WorkTimerWidget placement="v2" onSessionChange={handleWorkSessionChange} />
            </div>
            <TaskWorkspace
              node={currentTaskNode}
              items={taskItems}
              hidden={!showWorkspace}
              expandedId={expandedTaskId}
              onToggleExpand={handleToggleExpand}
              busyById={actions.busyById}
              networkDisabled={!networkWritable}
              reorderBusy={actions.isBusy('__reorder__')}
              onSaveNote={handleSaveNote}
              onDone={handleDone}
              onRestore={handleRestore}
              onOpenMenu={handleOpenMenu}
              onOpenNodeMenu={handleOpenMenu}
              onOpenDetails={handleOpenDetails}
              onReorder={handleReorder}
              onDiscussAi={handleDiscussWithAi}
            />

            <LauncherPill
              x={pill.x}
              y={pill.y}
              hidden={windowActive}
              activeTarget={windowActive ? morph.target : null}
              skinGhost={pillGhost}
              labelGhost={pillLabelGhost}
              locked={busy || windowActive}
              dragging={pillDragging}
              stageScaleRef={stageScaleRef}
              pillRef={pillRef}
              inboxSegRef={inboxSegRef}
              aiSegRef={aiSegRef}
              onDragMove={setPill}
              onDragStart={() => setPillDragging(true)}
              onDragEnd={handlePillDragEnd}
              onOpenInbox={() => openWindow('inbox')}
              onOpenAssistant={() => openWindow('assistant')}
            />

            <div
              ref={morph.morphRef}
              className="lifemapV2MorphFrame"
              data-morph-state={morph.state}
              data-morph-target={morph.target || ''}
              data-morph-profile={fixtureMode && morph.inspectionProfile ? JSON.stringify(morph.inspectionProfile) : undefined}
              aria-hidden="true"
            />
            {morph.target === 'inbox' && morph.isActive ? (
              <div
                ref={morph.windowMountRef}
                className="lifemapV2WindowMount"
                data-morph-state={morph.state}
                style={windowRectStyle('inbox')}
              >
                <InboxWindow
                  state={morph.state}
                  contentVisible={morph.contentVisible}
                  onClose={closeWindow}
                  fallbackSignals={inboxFallbackSignals}
                  snapshot={snapshotState.snapshot}
                  activeFocus={activeFocus}
                  onDiscussSignal={handleDiscussWithAi}
                  networkWritable={networkWritable}
                  onRefreshSnapshot={snapshotState.refresh}
                  inboxRefreshRevision={inboxRefreshRevision}
                />
              </div>
            ) : null}
            {morph.target === 'assistant' && morph.isActive ? (
              <div
                ref={morph.windowMountRef}
                className="lifemapV2WindowMount"
                data-morph-state={morph.state}
                style={windowRectStyle('assistant')}
              >
                <AssistantWindow
                  state={morph.state}
                  contentVisible={morph.contentVisible}
                  onClose={closeWindow}
                  bootTarget={assistantBoot}
                  currentMap={currentTaskNode || level}
                  activeFocus={activeFocus}
                  snapshot={snapshotState.snapshot}
                  networkWritable={networkWritable}
                  onRefreshSnapshot={snapshotState.refresh}
                  onInboxDataStale={bumpInboxRefreshRevision}
                />
              </div>
            ) : null}

            {!windowActive ? (
              <TaskDetailPanel
                node={detailNode}
                patchable={detailNode ? canPatchTask(detailNode) : false}
                busy={detailNode ? actions.isBusy(detailNode.sourceId) : false}
                networkDisabled={!networkWritable}
                onClose={handleCloseDetails}
                onDone={handleDone}
                onRestore={handleRestore}
                onDiscussAi={handleDiscussWithAi}
              />
            ) : null}
            <ContextMenuV2 menu={menu} onClose={handleCloseMenu} actions={menuActions} />
            <ToastStack toasts={toasts} onDismiss={dismissToast} />
          </div>

          <TextInputDialogV2
            dialog={dialog}
            busy={dialogBusy}
            error={dialogError}
            onSubmit={handleDialogSubmit}
            onCancel={handleDialogCancel}
          />

          {debugMode ? (
            <button
              type="button"
              className="lifemapV2DebugBack"
              disabled={interactionLocked || !parentFrame}
              onClick={handleBack}
            >
              DEBUG · Back
            </button>
          ) : null}
        </div>
      </StageScaler>
    </div>
  );
}
