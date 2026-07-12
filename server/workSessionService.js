import { dateKeyAt, durationSeconds, summarizeWorkSessions, validTimezone } from './workTime.js';

function compactId(value, limit = 200) {
  const text = String(value || '').trim();
  return text ? text.slice(0, limit) : null;
}

function requestedStart(value, fallback) {
  const requested = new Date(value);
  if (!Number.isFinite(requested.getTime())) return fallback;
  return Math.abs(fallback.getTime() - requested.getTime()) <= 5 * 60 * 1000 ? requested : fallback;
}

function activeSession(session) {
  return String(session?.status || '').toLowerCase() === 'active' && !(session.endedAt || session.finishedAt);
}

function preciseActiveSession(session) {
  if (session?.startedAtExact) return { ...session, startedAt: session.startedAtExact };
  if (!activeSession(session) || session?.source !== 'lifemap' || !session?.createdAt) return session;
  const createdAt = new Date(session.createdAt).getTime();
  const startedAt = new Date(session.startedAt).getTime();
  if (!Number.isFinite(createdAt) || (Number.isFinite(startedAt) && Math.abs(createdAt - startedAt) >= 120000)) return session;
  return { ...session, startedAt: new Date(createdAt).toISOString() };
}

function completedSession(session) {
  return String(session?.status || '').toLowerCase() === 'finished' && Number(session?.durationSeconds) >= 0;
}

function completionTime(session) {
  return new Date(session?.endedAt || session?.finishedAt || session?.updatedAt || session?.createdAt || 0).getTime() || 0;
}

export function createWorkSessionService({ store, now = () => new Date(), logger = console, userId = null, settle = () => new Promise((resolve) => setTimeout(resolve, 180)) } = {}) {
  if (!store) throw new Error('A work session store is required.');
  let mutationQueue = Promise.resolve();
  let syncFailed = false;
  const storeCall = async (operation) => {
    try {
      const result = await operation();
      if (syncFailed) logger.info?.('work_session_sync_recovered');
      syncFailed = false;
      return result;
    } catch (error) {
      syncFailed = true;
      logger.warn?.('work_session_sync_failed', { message: error.message });
      throw error;
    }
  };
  const exclusive = (operation) => {
    const next = mutationQueue.then(operation, operation);
    mutationQueue = next.catch(() => {});
    return next;
  };

  async function activeSessions() {
    return (await storeCall(() => store.list({ status: 'Active', userId }))).filter(activeSession)
      .map(preciseActiveSession)
      .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
  }

  async function reconcileActive(sessions, canonical = sessions[0]) {
    for (const duplicate of sessions.filter((session) => session.id !== canonical?.id)) {
      const endedAt = now().toISOString();
      await storeCall(() => store.update(duplicate.id, {
        status: 'Interrupted',
        endedAt,
        durationSeconds: durationSeconds(duplicate.startedAt, endedAt),
      }));
    }
    return canonical || null;
  }

  async function getActive({ logRestore = false } = {}) {
    const sessions = await activeSessions();
    const session = sessions.length > 1 ? await reconcileActive(sessions) : (sessions[0] || null);
    if (session && logRestore) logger.info?.('work_session_restored', { sessionId: session.id });
    return session;
  }

  async function getLastCompleted() {
    return (await storeCall(() => store.list({ userId }))).filter(completedSession)
      .sort((a, b) => completionTime(b) - completionTime(a))[0] || null;
  }

  async function start(input = {}) {
    return exclusive(async () => {
      const existing = await getActive();
      if (existing) return { session: existing, created: false };

      const started = requestedStart(input.startedAt, now());
      const timezone = validTimezone(input.timezone || 'UTC');
      const session = await storeCall(() => store.create({
        userId: compactId(userId),
        startedAt: started.toISOString(),
        endedAt: null,
        durationSeconds: null,
        status: 'Active',
        dateKey: dateKeyAt(started, timezone),
        timezone,
        source: 'lifemap',
        projectId: compactId(input.projectId),
        project: compactId(input.project) || 'LifeMap',
        taskId: compactId(input.taskId),
        title: compactId(input.title) || 'LifeMap work session',
      }));

      await settle();
      const allActive = await activeSessions();
      const canonical = await reconcileActive(allActive, allActive[0] || session);
      const created = canonical?.id === session.id;
      if (created) logger.info?.('work_session_started', { sessionId: session.id });
      return { session: canonical, created };
    });
  }

  async function pause(input = {}) {
    return exclusive(async () => {
      let session = input.sessionId ? preciseActiveSession(await storeCall(() => store.get(compactId(input.sessionId)))) : null;
      if (!activeSession(session)) session = await getActive();
      if (!session) return { session: null, completed: false };
      const endedAt = now().toISOString();
      const seconds = durationSeconds(session.startedAt, endedAt);
      const updated = await storeCall(() => store.update(session.id, {
        status: 'Finished',
        endedAt,
        durationSeconds: seconds,
      }));
      logger.info?.('work_session_paused', { sessionId: session.id, durationSeconds: seconds });
      return { session: updated, completed: true };
    });
  }

  async function stats(options = {}) {
    const sessions = (await storeCall(() => store.list({ userId }))).map(preciseActiveSession);
    return summarizeWorkSessions(sessions, { ...options, now: options.now || now() });
  }

  async function context({ timezone = 'UTC', days = 7 } = {}) {
    const safeDays = Math.min(90, Math.max(1, Number(days) || 7));
    const end = now();
    const start = new Date(end.getTime() - ((safeDays - 1) * 24 * 60 * 60 * 1000));
    const summary = await stats({ timezone, from: dateKeyAt(start, timezone), to: dateKeyAt(end, timezone), now: end });
    return {
      activeSession: await getActive(),
      today: summary.days.find((day) => day.dateKey === dateKeyAt(end, timezone)) || null,
      period: summary,
    };
  }

  return { start, pause, getActive, getLastCompleted, stats, context };
}
