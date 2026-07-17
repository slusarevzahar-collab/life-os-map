// LifeMap UI V2 — InboxWindow (Stage 5B1).
// LIVE window: real signals, statuses, reprocess job, AI resource meter.
// Keeps the Stage 3 morph shell contract exactly: role=dialog, aria-modal,
// Escape closes, focus wrap, data-state / data-content-visible, geometry
// applied by the shell mount. Data comes from useInboxData (runtime
// contracts only); presentation mapping from inboxUiAdapter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInboxData } from '../data/useInboxData.js';
import {
  INBOX_TABS,
  aggregateAiResource,
  assetToAssistantTarget,
  flattenAssets,
  formatTime,
  processedSignal,
  relevanceForAsset,
  relevanceForSignal,
  signalToAssistantTarget,
  tabCounts,
  uniqueAssetCategories,
} from '../adapters/inboxUiAdapter.js';
import { InboxTabs } from '../inbox/InboxTabs.jsx';
import { InboxSignalRow } from '../inbox/InboxSignalRow.jsx';
import { InboxAssetRow } from '../inbox/InboxAssetRow.jsx';
import { InboxPromptDialog } from '../inbox/InboxPromptDialog.jsx';

export function InboxWindow({
  state,
  contentVisible,
  onClose,
  fallbackSignals = [],
  snapshot = {},
  activeFocus = null,
  onDiscussSignal,
  networkWritable = true,
  onRefreshSnapshot,
  inboxRefreshRevision = 0,
}) {
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const interactive = state === 'open';

  const inbox = useInboxData({ active: true, fallbackSignals, networkWritable, onRefreshSnapshot, inboxRefreshRevision });
  const [tab, setTab] = useState('new');
  const [category, setCategory] = useState('all');
  const [expandedKey, setExpandedKey] = useState('');
  const [promptAsset, setPromptAsset] = useState(null);
  const [promptReturnFocus, setPromptReturnFocus] = useState(null);

  useEffect(() => {
    if (state === 'open') closeRef.current?.focus();
  }, [state]);

  useEffect(() => { setExpandedKey(''); setCategory('all'); }, [tab]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (promptAsset) { setPromptAsset(null); setPromptReturnFocus(null); }
      else onClose?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = rootRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const rankedSignals = useMemo(() => inbox.signals
    .map((signal) => ({ ...signal, relevance: relevanceForSignal(signal, snapshot, activeFocus) }))
    .sort((a, b) => b.relevance.score - a.relevance.score), [inbox.signals, snapshot, activeFocus]);

  const allAssets = useMemo(() => flattenAssets(rankedSignals)
    .map((asset) => ({ ...asset, relevance: relevanceForAsset(asset, snapshot, activeFocus) }))
    .sort((a, b) => b.relevance.score - a.relevance.score), [rankedSignals, snapshot, activeFocus]);

  const counts = useMemo(
    () => tabCounts(rankedSignals, allAssets, inbox.localStatus),
    [rankedSignals, allAssets, inbox.localStatus]
  );

  const currentTab = INBOX_TABS.find((item) => item.id === tab) || INBOX_TABS[0];
  const assetMode = Boolean(currentTab.kinds);
  const tabAssets = assetMode ? allAssets.filter((asset) => currentTab.kinds.includes(asset.kind)) : [];
  const categories = assetMode ? uniqueAssetCategories(tabAssets) : [];
  const visibleAssets = assetMode
    ? (category === 'all' ? tabAssets : tabAssets.filter((asset) => asset.category === category))
    : [];
  const visibleSignals = rankedSignals.filter((signal) => tab === 'done'
    ? processedSignal(inbox.localStatus[signal.id] || signal.status)
    : !processedSignal(inbox.localStatus[signal.id] || signal.status));

  const unprocessedCount = rankedSignals.filter((signal) => signal.needsReprocessing === true).length;
  const job = inbox.job;
  const jobDone = Number(job?.processed || 0) + Number(job?.failed || 0);
  const jobTotal = Number(job?.total || 0);
  const resource = aggregateAiResource(inbox.aiStatus);
  const resourceLabel = resource.known ? `${resource.percent}%` : `≈ ${resource.percent}%`;

  const reprocessLabel = job?.status === 'waiting_rate_limit'
    ? `Пауза до ${formatTime(job.resumeAfter) || 'сброса квоты'}`
    : inbox.reprocessing
      ? `Обработка ${jobDone}/${jobTotal || '…'}`
      : `Разобрать всё${unprocessedCount ? ` · ${unprocessedCount}` : ''}`;

  const discussSignal = (signal) => {
    onDiscussSignal?.(signalToAssistantTarget(signal), { mode: 'signal' });
  };
  const discussAsset = (asset) => {
    onDiscussSignal?.(assetToAssistantTarget(asset), { mode: 'asset', mapTitle: asset.sourceSignal?.title || '' });
  };

  return (
    <div
      id="lifemap-v2-inbox-window"
      ref={rootRef}
      className="lifemapV2Window lifemapV2InboxWindow"
      data-state={state}
      data-content-visible={contentVisible ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-label="LM Inbox"
      aria-hidden={interactive ? undefined : 'true'}
      onKeyDown={handleKeyDown}
    >
      <div className="lifemapV2WindowBody" style={{ opacity: contentVisible ? 1 : 0 }}>
        <header className="lifemapV2WindowHead">
          <div>
            <div className="lifemapV2WindowEyebrow">AI INBOX</div>
            <h2 className="lifemapV2WindowTitle">Библиотека сигналов</h2>
          </div>
          <div className="lifemapV2WindowHeadActions">
            {(unprocessedCount > 0 || inbox.reprocessing) ? (
              <button
                type="button"
                className="lifemapV2InboxReprocess"
                disabled={inbox.reprocessing || !networkWritable}
                title={networkWritable ? undefined : 'Недоступно: показаны последние известные данные без записи в API.'}
                tabIndex={interactive ? 0 : -1}
                onClick={() => inbox.reprocess(unprocessedCount)}
              >
                {reprocessLabel}
              </button>
            ) : null}
            <button
              type="button"
              ref={closeRef}
              className="lifemapV2WindowClose"
              onClick={onClose}
              aria-label="Закрыть Inbox"
              tabIndex={interactive ? 0 : -1}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="lifemapV2InboxResource">
          <div className="lifemapV2InboxResourceRow">
            <span>Ресурс AI</span>
            <span className="lifemapV2InboxResourcePct">{resourceLabel}</span>
          </div>
          <div className="lifemapV2InboxResourceTrack">
            <div className="lifemapV2InboxResourceFill" style={{ width: `${resource.percent}%` }} />
          </div>
        </div>

        <InboxTabs tab={tab} counts={counts} onSelect={setTab} interactive={interactive} />

        {assetMode && categories.length ? (
          <div className="lifemapV2InboxCategoryRow" role="group" aria-label="Категория">
            <button
              type="button"
              className={category === 'all' ? 'lifemapV2InboxCategoryBtnActive' : 'lifemapV2InboxCategoryBtn'}
              tabIndex={interactive ? 0 : -1}
              onClick={() => setCategory('all')}
            >
              Все <span>{tabAssets.length}</span>
            </button>
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                className={category === name ? 'lifemapV2InboxCategoryBtnActive' : 'lifemapV2InboxCategoryBtn'}
                tabIndex={interactive ? 0 : -1}
                onClick={() => setCategory(name)}
              >
                {name} <span>{tabAssets.filter((asset) => asset.category === name).length}</span>
              </button>
            ))}
          </div>
        ) : null}

        {inbox.reprocessing && jobTotal > 0 ? (
          <div className="lifemapV2InboxJobProgress" role="progressbar" aria-valuemin={0} aria-valuemax={jobTotal} aria-valuenow={jobDone}>
            <span style={{ width: `${Math.min(100, (jobDone / jobTotal) * 100)}%` }} />
          </div>
        ) : null}
        {!networkWritable ? (
          <div className="lifemapV2InboxOfflineLine" role="status">
            Показаны последние известные данные. Статусы и переразбор недоступны до восстановления записи в API.
          </div>
        ) : null}
        {inbox.notice ? <div className="lifemapV2InboxNotice" role="status">{inbox.notice}</div> : null}
        {inbox.error ? <div className="lifemapV2InboxErrorLine" role="alert">{inbox.error}</div> : null}

        <div className="lifemapV2InboxRows" aria-busy={inbox.loading ? 'true' : undefined}>
          {inbox.loading ? (
            <div className="lifemapV2InboxEmpty"><b>Загружаю LM Inbox…</b></div>
          ) : assetMode ? (
            visibleAssets.length ? visibleAssets.map((asset) => (
              <InboxAssetRow
                key={asset.key}
                asset={asset}
                expanded={expandedKey === asset.key}
                entering={inbox.enteringIds.has(asset.sourceSignal?.id)}
                interactive={interactive}
                onToggle={() => setExpandedKey((key) => key === asset.key ? '' : asset.key)}
                onOpenPrompt={(payload) => { setPromptAsset(payload.asset); setPromptReturnFocus(payload.returnFocus || null); }}
                onDiscuss={discussAsset}
              />
            )) : (
              <div className="lifemapV2InboxEmpty">
                <b>Здесь пока пусто</b>
                <p>{unprocessedCount ? 'Переразбор ещё идёт или часть старых сигналов пока не обработана.' : 'В этой категории пока нет элементов.'}</p>
              </div>
            )
          ) : (
            visibleSignals.length ? visibleSignals.map((signal) => (
              <InboxSignalRow
                key={signal.id}
                signal={signal}
                expanded={expandedKey === signal.id}
                statusOverride={inbox.localStatus[signal.id]}
                busy={inbox.busySignalId === signal.id}
                entering={inbox.enteringIds.has(signal.id)}
                interactive={interactive}
                networkWritable={networkWritable}
                onToggle={() => setExpandedKey((key) => key === signal.id ? '' : signal.id)}
                onStatus={inbox.updateStatus}
                onDiscuss={discussSignal}
              />
            )) : (
              <div className="lifemapV2InboxEmpty">
                <b>Здесь пока пусто</b>
                <p>{tab === 'done' ? 'Разобранные сигналы появятся здесь.' : 'Новые сигналы из Telegram появятся во входящих.'}</p>
              </div>
            )
          )}
        </div>
      </div>

      <InboxPromptDialog
        asset={promptAsset}
        returnFocus={promptReturnFocus}
        onClose={() => { setPromptAsset(null); setPromptReturnFocus(null); }}
      />
    </div>
  );
}
