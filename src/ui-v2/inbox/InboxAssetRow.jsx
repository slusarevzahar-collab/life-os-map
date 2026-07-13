// LifeMap UI V2 — InboxAssetRow (Stage 5B1).
// One extracted asset row (Prompt / Tool / Workflow / Idea / Material / Task).
import { formatDate, inferredAttachment } from '../adapters/inboxUiAdapter.js';

function openExternal(url = '') {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function RelevancePill({ relevance }) {
  if (!relevance) return null;
  return (
    <span className={`lifemapV2InboxRel lifemapV2InboxRel--${relevance.level}`} title={relevance.reasons.join(' · ')}>
      {relevance.score}
    </span>
  );
}

export function InboxAssetRow({ asset, expanded, entering, interactive, onToggle, onOpenPrompt, onDiscuss }) {
  const source = asset.sourceSignal || {};
  const directUrl = asset.url || source.sourceUrl || '';
  const attachment = inferredAttachment(source);

  return (
    <article className={`lifemapV2InboxRow lifemapV2InboxRowLive${expanded ? ' lifemapV2InboxRowOpen' : ''}${entering ? ' lifemapV2InboxRowEntering' : ''}`}>
      <button
        type="button"
        className="lifemapV2InboxRowMainBtn"
        tabIndex={interactive ? 0 : -1}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="lifemapV2InboxTag">{asset.category || 'Другое'}</span>
        <span className="lifemapV2InboxRowMain">
          <span className="lifemapV2InboxRowTitle">{asset.title || 'Без названия'}</span>
          <span className="lifemapV2InboxRowMeta">{asset.description || source.title || asset.kind}{attachment ? ` · ${attachment.fileName}` : ''}</span>
        </span>
        <RelevancePill relevance={asset.relevance} />
      </button>

      {expanded ? (
        <div className="lifemapV2InboxRowDetails">
          {asset.relevance ? (
            <div className="lifemapV2InboxDetailBlock">
              <small>Актуальность · {asset.relevance.score}/100</small>
              <p>{asset.relevance.reasons.join(' · ')}</p>
            </div>
          ) : null}
          {asset.description ? <div className="lifemapV2InboxDetailBlock"><small>Что это</small><p>{asset.description}</p></div> : null}
          {asset.suggestedUse ? <div className="lifemapV2InboxDetailBlock"><small>Где применить</small><p>{asset.suggestedUse}</p></div> : null}
          <div className="lifemapV2InboxRowSource">Источник: {source.title || 'исходный сигнал'}{source.capturedAt ? ` · ${formatDate(source.capturedAt)}` : ''}</div>
          <div className="lifemapV2InboxRowActions">
            {asset.kind === 'Prompt' && asset.content ? (
              <button
                className="lifemapV2InboxPrimaryBtn"
                type="button"
                tabIndex={interactive ? 0 : -1}
                onClick={(event) => onOpenPrompt({ asset, returnFocus: event.currentTarget })}
              >
                Посмотреть промпт
              </button>
            ) : null}
            {directUrl ? (
              <button type="button" tabIndex={interactive ? 0 : -1} onClick={() => openExternal(directUrl)}>{asset.url ? 'Открыть ресурс' : 'Исходный пост'}</button>
            ) : null}
            <button type="button" tabIndex={interactive ? 0 : -1} onClick={() => onDiscuss(asset)}>Чат с AI</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
