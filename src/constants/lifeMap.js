export const FOCUS_STORAGE_KEY = 'lifeMapFocusQueueV3';
export const TITLE_ALIASES_KEY = 'lifeMapTitleAliasesV2';
export const CUSTOM_OBJECTS_KEY = 'lifeMapCustomObjectsV1';
export const DRAG_THRESHOLD = 8;

export const RENAMABLE_KINDS = new Set([
  'task',
  'goal',
  'project',
  'lifeArea',
  'signal',
  'dream',
  'sphere',
  'custom',
]);

export const mapVariants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.06 },
};
