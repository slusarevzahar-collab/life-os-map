// LifeMap UI V2 — InboxSignalRow (Stage 5B1).
// One live signal row: expand, status actions (Разобрано/Архив/Вернуть),
// source link, attachment download, "Чат с AI" handoff.
import { attachmentDownloadUrl } from '../../lib/lifeMapRuntime.js';
import {
  attachmentLabel,
  formatBytes,
  formatDate,
  inferredAttachment,
  processedSignal,
} from '../adapters/inboxUiAdapter.js';

function openExternal(url = '') {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function downloadAttachment(signal) {
  const attachment = inferredAttachment(signal);
  if (!attachment || attachment.inferred || !signal.attachment?.fileId) {
    if (signal.sourceUrl) openExternal(signal.sourceUrl);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = attachmentDownloadUrl(signal.id);
  anchor.download = attachment.fileName || 'attachment';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function RelevancePill({ relevance }) {
  if (!relevance) return null;
  return (
    <span className={`lifemapV2InboxRel lifemapV2InboxRel--${relevance.level}`} title={relevance.reasons.join(' · ')}>
      {relevance.score}
    </span>
  );
}

function AttachmentBlock({ signal, interactive }) {
  const attachment = inferredAttachment(signal);
  if (!attachment) return null;
  const canDirectDownload = Boolean(signal.attachment?.fileId);
  return (
    <div className="lifemapV2InboxAttach">
      <span className="lifemapV2InboxAttachIcon" aria-hidden="true">FILE</span>
      <span className="lifemapV2InboxAttachMeta">
        <b>{attachment.fileName}</b>
        <small>{[attachment.mimeType, formatBytes(attachment.fileSize)].filter(Boolean).join(' · ') || (canDirectDownload ? 'Файл из Telegram' : 'Файл в исходном сообщении')}</small>
      </span>
      <button type="button" tabIndex={interactive ? 0 : -1} onClick={() => downloadAttachment(signal)}>
        {canDirectDownload ? attachmentLabel(attachment) : 'Открыть источник'}
      </button>
    </div>
  );
}

export function InboxSignalRow({ signal, expanded, statusOverride, busy, entering, interactive, networkWritable = true, onToggle, onStatus, onDiscuss }) {
  const status = statusOverride || signal.status || 'Inbox';
  const processed = processedSignal(status);
  const attachment = inferredAttachment(signal);
  const mutationsDisabled = busy || !networkWritable;

  return (
    <article className={`lifemapV2InboxRow lifemapV2InboxRowLive${expanded ? ' lifemapV2InboxRowOpen' : ''}${entering ? ' lifemapV2InboxRowEntering' : ''}`}>
      <button
        type="button"
        className="lifemapV2InboxRowMainBtn"
        tabIndex={interactive ? 0 : -1}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="lifemapV2InboxTag">{signal.type || 'Signal'}</span>
        <span className="lifemapV2InboxRowMain">
          <span className="lifemapV2InboxRowTitle">{signal.title}</span>
          <span className="lifemapV2InboxRowMeta">{[signal.priority, formatDate(signal.capturedAt), attachment?.fileName].filter(Boolean).join(' · ')}</span>
        </span>
        <RelevancePill relevance={signal.relevance} />
      </button>

      {expanded ? (
        <div className="lifemapV2InboxRowDetails">
          {signal.relevance ? (
            <div className="lifemapV2InboxDetailBlock">
              <small>Актуальность · {signal.relevance.score}/100</small>
              <p>{signal.relevance.reasons.join(' · ')}</p>
            </div>
          ) : null}
          {signal.summary ? <div className="lifemapV2InboxDetailBlock"><small>Исходный материал</small><p>{signal.summary}</p></div> : null}
          {signal.assistantNote ? <div className="lifemapV2InboxDetailBlock"><small>Комментарий AI</small><p>{signal.assistantNote}</p></div> : null}
          {signal.possibleUse ? <div className="lifemapV2InboxDetailBlock"><small>Применение</small><p>{signal.possibleUse}</p></div> : null}
          <AttachmentBlock signal={signal} interactive={interactive} />
          <div className="lifemapV2InboxRowActions">
            {signal.sourceUrl ? (
              <button type="button" tabIndex={interactive ? 0 : -1} onClick={() => openExternal(signal.sourceUrl)}>Открыть источник</button>
            ) : null}
            <button type="button" tabIndex={interactive ? 0 : -1} onClick={() => onDiscuss(signal)}>Чат с AI</button>
            {processed ? (
              <button type="button" disabled={mutationsDisabled} tabIndex={interactive ? 0 : -1} onClick={() => onStatus(signal, 'New')}>{busy ? '…' : 'Вернуть'}</button>
            ) : (
              <>
                <button className="lifemapV2InboxPrimaryBtn" type="button" disabled={mutationsDisabled} tabIndex={interactive ? 0 : -1} onClick={() => onStatus(signal, 'Reviewed')}>{busy ? '…' : 'Разобрано'}</button>
                <button type="button" disabled={mutationsDisabled} tabIndex={interactive ? 0 : -1} onClick={() => onStatus(signal, 'Archived')}>Архив</button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
