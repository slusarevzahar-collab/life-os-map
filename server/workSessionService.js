import { dateKeyAt, durationSeconds, localDayBoundaryAfter, summarizeWorkSessions, validTimezone } from './workTime.js';

function compactId(value, limit = 200) {
  const text = String(value || '').trim();
  return text ? text.slice(0, limit) : null;
}

function requestedStart(value, fallback) {
  const requested = new Date(value);
  if (!Number.isFinite(requested.getTime())) return fallback;
  return Math.abs(fallback.getTime() - requested.getTime()) <= 5 * 60 * 1000 ? requested : fallback;
}

function safeSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(365 * 24 * 60 * 60, Math.max(0, Math.floor(seconds))) : 0;
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

function dailyOrder(a, b) {
  return String(a?.createdAt || a?.startedAt || '').localeCompare(String(b?.createdAt || b?.startedAt || ''));
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

  async function allSessions() {
    return (await storeCall(() => store.list({ userId }))).map(preciseActiveSession);
  }

  async function dailySessions(dateKey) {
    return (await allSessions()).filter((session) => session.dateKey === dateKey).sort(dailyOrder);
  }

  async function canonicalDailySession(dateKey) {
    const sessions = await dailySessions(dateKey);
    const canonical = sessions[0] || null;
    if (canonical && typeof store.archive === 'function') {
      for (const duplicate of sessions.slice(1)) await storeCall(() => store.archive(duplicate.id));
    }
    return canonical;
  }

  async function activeSessions() {
    return (await storeCall(() => store.list({ status: 'Active', userId }))).filter(activeSession)
      .map(preciseActiveSession)
      .sort((a, b) => String(b.dateKey || '').localeCompare(String(a.dateKey || '')) || dailyOrder(a, b));
  }

  async function reconcileActive(sessions, canonical = sessions[0]) {
    for (const duplicate of sessions.filter((session) => session.id !== canonical?.id)) {
      if (duplicate.dateKey && duplicate.dateKey === canonical?.dateKey && typeof store.archive === 'function') {
        await storeCall(() => store.archive(duplicate.id));
        continue;
      }
      const endedAt = now().toISOString();
      const segmentSeconds = durationSeconds(duplicate.startedAt, endedAt);
      await storeCall(() => store.update(duplicate.id, {
        status: 'Interrupted',
        endedAt,
        durationSeconds: safeSeconds(duplicate.durationSeconds) + segmentSeconds,
        timerSeconds: safeSeconds(duplicate.initialSeconds) + segmentSeconds,
      }));
    }
    return canonical || null;
  }

  async function activateDailySession({ dateKey, startedAt, timezone, initialSeconds, context = {} }) {
    const existing = await canonicalDailySession(dateKey);
    const patch = {
      status: 'Active',
      endedAt: null,
      startedAtExact: startedAt,
      initialSeconds: safeSeconds(initialSeconds),
      timerSeconds: safeSeconds(initialSeconds),
    };
    if (existing) {
      const updated = await storeCall(() => store.update(existing.id, patch));
      return { session: preciseActiveSession(updated), created: false };
    }

    const createdSession = await storeCall(() => store.create({
      userId: compactId(userId),
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      initialSeconds: safeSeconds(initialSeconds),
      timerSeconds: safeSeconds(initialSeconds),
      status: 'Active',
      dateKey,
      timezone,
      source: 'lifemap',
      projectId: compactId(context.projectId),
      project: compactId(context.project) || 'LifeMap',
      taskId: compactId(context.taskId),
      title: compactId(context.title) || `LifeMap work session · ${dateKey}`,
    }));

    await settle();
    const canonical = await canonicalDailySession(dateKey) || createdSession;
    if (canonical.id !== createdSession.id) {
      const updated = await storeCall(() => store.update(canonical.id, patch));
      return { session: preciseActiveSession(updated), created: false };
    }
    return { session: preciseActiveSession(createdSession), created: true };
  }

  async function rolloverActiveSession(inputSession) {
    let session = preciseActiveSession(inputSession);
    if (!activeSession(session)) return session;
    const timezone = validTimezone(session.timezone || 'UTC');
    const targetDateKey = dateKeyAt(now(), timezone);
    let sessionDateKey = session.dateKey || dateKeyAt(session.startedAt, timezone);

    while (sessionDateKey < targetDateKey) {
      const boundary = localDayBoundaryAfter(session.startedAt, timezone);
      const segmentSeconds = durationSeconds(session.startedAt, boundary);
      const dailyTotal = safeSeconds(session.durationSeconds) + segmentSeconds;
      const timerAtBoundary = safeSeconds(session.initialSeconds) + segmentSeconds;
      await storeCall(() => store.update(session.id, {
        status: 'Finished',
        endedAt: boundary,
        durationSeconds: dailyTotal,
        timerSeconds: timerAtBoundary,
      }));

      const nextDateKey = dateKeyAt(boundary, timezone);
      const next = await activateDailySession({
        dateKey: nextDateKey,
        startedAt: boundary,
        timezone,
        initialSeconds: timerAtBoundary,
        context: session,
      });
      logger.info?.('work_session_day_rolled_over', { from: sessionDateKey, to: nextDateKey, previousSessionId: session.id, sessionId: next.session.id });
      session = next.session;
      sessionDateKey = nextDateKey;
    }
    return session;
  }

  async function getActive({ logRestore = false } = {}) {
    const sessions = await activeSessions();
    let session = sessions.length > 1 ? await reconcileActive(sessions) : (sessions[0] || null);
    if (session) session = await rolloverActiveSession(session);
    if (session && logRestore) logger.info?.('work_session_restored', { sessionId: session.id });
    return session;
  }

  async function getLastCompleted() {
    return (await allSessions()).filter(completedSession)
      .sort((a, b) => completionTime(b) - completionTime(a))[0] || null;
  }

  async function start(input = {}) {
    return exclusive(async () => {
      const existing = await getActive();
      if (existing) return { session: existing, created: false };

      const started = requestedStart(input.startedAt, now());
      const timezone = validTimezone(input.timezone || 'UTC');
      const dateKey = dateKeyAt(started, timezone);
      const result = await activateDailySession({
        dateKey,
        startedAt: started.toISOString(),
        timezone,
        initialSeconds: safeSeconds(input.initialSeconds),
        context: input,
      });
      if (result.created) logger.info?.('work_session_started', { sessionId: result.session.id, dateKey });
      else logger.info?.('work_session_resumed', { sessionId: result.session.id, dateKey });
      return result;
    });
  }

  async function pause(input = {}) {
    return exclusive(async () => {
      let session = input.sessionId ? preciseActiveSession(await storeCall(() => store.get(compactId(input.sessionId)))) : null;
      if (!activeSession(session)) session = await getActive();
      if (!session) return { session: null, completed: false };
      session = await rolloverActiveSession(session);
      const endedAt = now().toISOString();
      const segmentSeconds = durationSeconds(session.startedAt, endedAt);
      const dailyTotal = safeSeconds(session.durationSeconds) + segmentSeconds;
      const timerSeconds = safeSeconds(session.initialSeconds) + segmentSeconds;
      const updated = await storeCall(() => store.update(session.id, {
        status: 'Finished',
        endedAt,
        durationSeconds: dailyTotal,
        timerSeconds,
      }));
      logger.info?.('work_session_paused', { sessionId: session.id, durationSeconds: dailyTotal, timerSeconds });
      return { session: updated, completed: true };
    });
  }

  async function rollover(input = {}) {
    return exclusive(async () => {
      let session = input.sessionId ? preciseActiveSession(await storeCall(() => store.get(compactId(input.sessionId)))) : null;
      if (!activeSession(session)) session = await getActive();
      if (!session) return { session: null, rolledOver: false };
      const previousId = session.id;
      const current = await rolloverActiveSession(session);
      return { session: current, rolledOver: current?.id !== previousId };
    });
  }

  async function stats(options = {}) {
    const sessions = await allSessions();
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

  return { start, pause, rollover, getActive, getLastCompleted, stats, context };
}
