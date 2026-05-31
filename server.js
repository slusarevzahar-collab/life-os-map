import express from 'express';

const app = express();
const port = process.env.API_PORT || 3001;

const snapshot = {
  meta: {
    source: 'mock-backend-snapshot',
    version: '0.1.0',
    updatedAt: new Date().toISOString(),
  },
  currentFocus: {
    id: 'task_life_os_map',
    title: 'Life OS Map',
    project: 'Life OS',
    status: 'in_progress',
    progress: 55,
    nextAction: 'Подключить карту к данным через backend snapshot.',
  },
  goals: [
    {
      id: 'goal_life_os_mvp',
      title: 'Собрать рабочую Life OS Map + AI Inbox MVP',
      horizon: '1 month',
      progress: 38,
      targetDate: '2026-06-30',
      status: 'active',
    },
    {
      id: 'goal_content_agent',
      title: 'Собрать Content Agent workflow',
      horizon: '1 month',
      progress: 22,
      targetDate: '2026-06-20',
      status: 'next',
    },
  ],
  tasks: [
    {
      id: 'task_life_os_map',
      title: 'Подготовить Notion data adapter для Life OS Map',
      project: 'Life OS',
      status: 'in_progress',
      progress: 55,
      priority: 1,
      dueDate: '2026-06-04',
      goalId: 'goal_life_os_mvp',
      nextAction: 'Заменить mock data на backend response.',
    },
    {
      id: 'task_mobile_ux',
      title: 'Переработать мобильный UX в dashboard + mini-map',
      project: 'Life OS',
      status: 'next',
      progress: 0,
      priority: 2,
      dueDate: '2026-06-07',
      goalId: 'goal_life_os_mvp',
      nextAction: 'Сделать мобильный режим не копией canvas, а рабочей панелью.',
    },
    {
      id: 'task_ai_inbox',
      title: 'AI Inbox: Telegram → Make → Notion MVP',
      project: 'AI Inbox',
      status: 'next',
      progress: 35,
      priority: 3,
      dueDate: '2026-06-05',
      goalId: 'goal_life_os_mvp',
      nextAction: 'Проверить создание записей из Telegram-бота.',
    },
  ],
  sessions: [
    {
      id: 'session_backend_api',
      taskId: 'task_life_os_map',
      project: 'Life OS',
      status: 'active',
      startedAt: null,
      durationMin: null,
      result: 'Создаём первый backend endpoint для snapshot.',
      nextStep: 'Позже заменить mock snapshot на чтение Notion DB.',
    },
  ],
  planning: {
    onTrack: 2,
    next: 2,
    waiting: 1,
    overdue: 0,
  },
};

app.get('/api/life-os/snapshot', (_req, res) => {
  res.json({
    ...snapshot,
    meta: {
      ...snapshot.meta,
      updatedAt: new Date().toISOString(),
    },
  });
});

app.listen(port, () => {
  console.log(`Life OS API listening on http://localhost:${port}`);
});
