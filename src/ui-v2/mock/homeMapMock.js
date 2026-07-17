// LifeMap UI V2 — Stage 1 mock data (home level only).
// Intentionally isolated: no import of API/Notion/localStorage/snapshot code.
// Progress values are chosen deliberately to exercise 0% / partial / 100% rendering
// in ProgressArc. ids reuse the real sphere-* naming for later continuity, but this
// file is not read by, and does not affect, the existing data model.
export const homeMapMock = [
  { id: 'sphere-projects', title: 'Проекты', metric: '21 active', progress: 62, x: 640, y: 150, size: 120, variant: 'default' },
  { id: 'sphere-goals', title: 'Цели', metric: 'Готово', progress: 100, x: 890, y: 400, size: 120, variant: 'default' },
  { id: 'sphere-backlog', title: 'Идеи / потом', metric: '12 later', progress: 0, x: 390, y: 400, size: 120, variant: 'muted' },
];
