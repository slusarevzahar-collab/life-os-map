// LifeMap UI V2 — Stage 2 mock route tree.
// Isolated from API, Notion, snapshot, and the legacy data model. It provides
// home, two sibling branches, a grandchild level, leaves, and lateral links.
export const mapTreeMock = {
  root: {
    id: 'root',
    title: 'LifeMap',
    sublabel: 'HOME',
    parentId: null,
    core: { title: 'LifeMap', sublabel: 'HOME', size: 196 },
    orbit: { size: 500 },
    planets: [
      { id: 'sphere-projects', title: 'Проекты', metric: '21 active', progress: 62, x: 640, y: 150, size: 120, variant: 'default' },
      { id: 'sphere-goals', title: 'Цели', metric: 'Готово', progress: 100, x: 890, y: 400, size: 120, variant: 'default' },
      { id: 'sphere-backlog', title: 'Идеи / потом', metric: '12 later', progress: 0, x: 390, y: 400, size: 120, variant: 'muted', navigable: false },
    ],
  },

  'sphere-projects': {
    id: 'sphere-projects',
    title: 'Проекты',
    sublabel: 'BRANCH',
    parentId: 'root',
    core: { title: 'Проекты', sublabel: 'BRANCH', size: 176 },
    orbit: { size: 440 },
    planets: [
      { id: 'project-lifemap', title: 'LifeMap', metric: '7 tasks', progress: 48, x: 640, y: 190, size: 116, variant: 'default' },
      { id: 'project-sleda', title: 'Sleda.net', metric: '3 tasks', progress: 20, x: 860, y: 400, size: 116, variant: 'default', navigable: false },
      { id: 'sphere-goals', title: 'Цели', metric: 'Готово', progress: 100, x: 420, y: 400, size: 92, variant: 'muted' },
    ],
  },

  'sphere-goals': {
    id: 'sphere-goals',
    title: 'Цели',
    sublabel: 'BRANCH',
    parentId: 'root',
    core: { title: 'Цели', sublabel: 'BRANCH', size: 176 },
    orbit: { size: 380 },
    planets: [
      { id: 'goal-health', title: 'Здоровье', metric: '2 цели', progress: 55, x: 640, y: 220, size: 110, variant: 'default', navigable: false },
      { id: 'goal-career', title: 'Карьера', metric: '1 цель', progress: 30, x: 860, y: 460, size: 110, variant: 'default', navigable: false },
      { id: 'sphere-projects', title: 'Проекты', metric: '21 active', progress: 62, x: 420, y: 460, size: 92, variant: 'muted' },
    ],
  },

  'project-lifemap': {
    id: 'project-lifemap',
    title: 'LifeMap',
    sublabel: 'BRANCH',
    parentId: 'sphere-projects',
    core: { title: 'LifeMap', sublabel: 'BRANCH', size: 160 },
    orbit: { size: 340 },
    planets: [
      { id: 'task-provider', title: 'AI provider + fallback', metric: 'в работе', progress: 40, x: 640, y: 250, size: 104, variant: 'default', navigable: false },
      { id: 'task-navigator', title: 'Навигатор: стабилизация', metric: 'Done', progress: 100, x: 870, y: 470, size: 104, variant: 'default', navigable: false },
    ],
  },
};
