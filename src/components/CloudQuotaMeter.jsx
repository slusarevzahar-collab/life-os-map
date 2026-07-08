function compactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '—';
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(number));
}

function shortModel(value = '') {
  const text = String(value || '');
  if (!text) return 'ожидание первого запроса';
  const tail = text.split('/').pop() || text;
  return tail.replace(/-instruct$/i, '').replace(/-versatile$/i, '');
}

function MetricBar({ label, metric, suffix }) {
  if (!metric) {
    return (
      <div className="cloudQuotaMetric isUnknown">
        <div><span>{label}</span><b>нет данных</b></div>
        <div className="cloudQuotaTrack"><span style={{ width: '0%' }} /></div>
      </div>
    );
  }
  const percent = Math.max(0, Math.min(100, Number(metric.percent || 0)));
  return (
    <div className="cloudQuotaMetric" title={`${metric.remaining} из ${metric.limit}${metric.reset ? ` · сброс ${metric.reset}` : ''}`}>
      <div><span>{label}</span><b>{compactNumber(metric.remaining)} / {compactNumber(metric.limit)}{suffix ? ` ${suffix}` : ''}</b></div>
      <div className="cloudQuotaTrack"><span style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

export function CloudQuotaMeter({ status, profile = 'chat', compact = false }) {
  const quota = status?.quotaProfiles?.[profile] || null;
  const configuredRoutes = Number(quota?.configuredRoutes || 0);
  const availableRoutes = Number(quota?.availableRoutes || 0);
  const hasTelemetry = Boolean(quota?.requests || quota?.tokens);
  const title = profile === 'inbox' ? 'Ресурс AI Inbox' : 'Ресурс Assistant';

  return (
    <section className={`cloudQuotaCard ${compact ? 'compact' : ''}`}>
      <div className="cloudQuotaHead">
        <div><small>{title}</small><b>{hasTelemetry ? shortModel(quota.lastModel) : 'Облачный пул'}</b></div>
        <span className={availableRoutes ? 'isReady' : 'isWaiting'}>{availableRoutes}/{configuredRoutes || 0}</span>
      </div>
      <div className="cloudQuotaMetrics">
        <MetricBar label="Запросы / день" metric={quota?.requests} />
        <MetricBar label="Токены / мин" metric={quota?.tokens} />
      </div>
      <p>{hasTelemetry
        ? `Показатели активного маршрута · ${availableRoutes} из ${configuredRoutes} маршрутов доступны`
        : configuredRoutes
          ? 'Точные шкалы появятся после первого ответа модели; доступность маршрутов уже отслеживается.'
          : 'Облачные маршруты пока не настроены.'}</p>
    </section>
  );
}
