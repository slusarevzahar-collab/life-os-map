function clampPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
}

function routePercent(provider = {}) {
  if (Number(provider.blockedForMs || 0) > 0) return 0;
  const values = [provider.quota?.requests?.percent, provider.quota?.tokens?.percent]
    .map(clampPercent)
    .filter((value) => value !== null);
  return values.length ? Math.min(...values) : null;
}

function aggregateAiResource(status = {}) {
  const providers = (status.providers || []).filter((provider) => provider.configured);
  if (!providers.length) return { percent: 0, known: true, ready: false };

  const measured = providers.map(routePercent).filter((value) => value !== null);
  const available = providers.filter((provider) => Number(provider.blockedForMs || 0) <= 0).length;
  const availabilityPercent = Math.round((available / providers.length) * 100);

  if (!measured.length) {
    return {
      percent: availabilityPercent,
      known: false,
      ready: available > 0,
    };
  }

  const measuredAverage = Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length);
  return {
    percent: Math.min(measuredAverage, availabilityPercent),
    known: true,
    ready: available > 0,
  };
}

export function CloudQuotaMeter({ status, compact = false }) {
  const resource = aggregateAiResource(status || {});
  const label = resource.known ? `${resource.percent}%` : `≈ ${resource.percent}%`;

  return (
    <section className={`cloudQuotaCard cloudQuotaSimple ${compact ? 'compact' : ''}`} aria-label={`Ресурс AI: ${label}`}>
      <div className="cloudQuotaSimpleHead">
        <span>Ресурс AI</span>
        <b className={resource.ready ? 'isReady' : 'isWaiting'}>{label}</b>
      </div>
      <div className="cloudQuotaTrack" title={resource.known ? `Оценка доступного ресурса AI: ${label}` : `Приблизительная доступность AI-пула: ${label}`}>
        <span style={{ width: `${resource.percent}%` }} />
      </div>
    </section>
  );
}
