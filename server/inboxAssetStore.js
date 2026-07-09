import { Client } from '@notionhq/client';
import { AI_POLICY_VERSION } from './lifemapAiPolicy.js';

const DIRECT_DOWNLOAD_MAX_BYTES = 15 * 1024 * 1024;
const ASSET_TYPE_MAP = {
  Prompt: 'Prompt',
  Tool: 'Tool link',
  Workflow: 'Workflow',
  Task: 'Task',
  Research: 'Source',
  Idea: 'Idea',
  Reference: 'Source',
  News: 'Source',
  Instruction: 'Instruction',
  File: 'Source',
  Other: 'Source',
};

function plainText(items = []) {
  return Array.isArray(items) ? items.map((item) => item?.plain_text || '').join('').trim() : '';
}

function titleText(property) {
  return plainText(property?.title || []);
}

function richText(property) {
  return plainText(property?.rich_text || []);
}

function selectName(property) {
  return property?.select?.name || property?.status?.name || '';
}

function multiSelectNames(property) {
  return Array.isArray(property?.multi_select) ? property.multi_select.map((item) => item.name) : [];
}

function urlValue(property) {
  return property?.url || '';
}

function dateStart(property) {
  return property?.date?.start || null;
}

function titleProperty(value = '') {
  return { title: [{ text: { content: String(value || 'Untitled signal').slice(0, 1900) } }] };
}

function textProperty(value = '') {
  const content = String(value || '');
  if (!content) return { rich_text: [] };
  const chunks = [];
  for (let index = 0; index < content.length; index += 1900) chunks.push(content.slice(index, index + 1900));
  return { rich_text: chunks.map((chunk) => ({ text: { content: chunk } })) };
}

function multiSelectProperty(values = []) {
  const unique = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
  return unique.length ? { multi_select: unique.map((name) => ({ name })) } : { multi_select: [] };
}

function selectProperty(value = '') {
  return value ? { select: { name: String(value) } } : undefined;
}

function safeParseJson(value = '', fallback = null) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function safeParseAssets(value = '') {
  const parsed = safeParseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function serializeAssets(assets = []) {
  return JSON.stringify(Array.isArray(assets) ? assets : []);
}

function normalizeMediaItem(item = {}) {
  if (!item || typeof item !== 'object') return null;
  const kind = String(item.kind || item.type || (item.fileName || item.file_name ? 'document' : 'file')).toLowerCase();
  return {
    kind,
    fileId: item.fileId || item.file_id || '',
    fileUniqueId: item.fileUniqueId || item.file_unique_id || '',
    fileName: item.fileName || item.file_name || '',
    mimeType: item.mimeType || item.mime_type || '',
    fileSize: Number(item.fileSize || item.file_size || 0),
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    duration: Number(item.duration || 0),
    messageId: item.messageId || item.message_id || '',
    sourceUrl: item.sourceUrl || '',
    textCaptured: item.textCaptured === true,
  };
}

function mediaIdentity(item = {}) {
  return String(item.fileUniqueId || item.fileId || `${item.kind}:${item.fileName}:${item.messageId}:${item.sourceUrl}`);
}

function mergeMediaItems(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((item) => {
    const normalized = normalizeMediaItem(item);
    if (!normalized) return;
    const key = mediaIdentity(normalized);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  });
  return merged;
}

function downloadableDocument(media = []) {
  return media.find((item) => {
    if (!item?.fileId || !item?.fileName) return false;
    if (['photo', 'video', 'animation', 'voice', 'video_note'].includes(item.kind)) return false;
    return !item.fileSize || item.fileSize <= DIRECT_DOWNLOAD_MAX_BYTES;
  }) || null;
}

function normalizeAttachment(analysis = {}) {
  const telegram = analysis.telegram || {};
  const direct = telegram.attachment || analysis.attachment || telegram.document || null;
  const directMedia = Array.isArray(direct?.media) ? direct.media : [];
  const telegramMedia = Array.isArray(telegram.media) ? telegram.media : [];
  const singleDirect = direct && !Array.isArray(direct?.media) ? [direct] : [];
  const media = mergeMediaItems(directMedia, telegramMedia, singleDirect);
  if (!direct && !media.length && !telegram.mediaGroupId) return null;
  const document = downloadableDocument(media);
  return {
    mediaGroupId: direct?.mediaGroupId || telegram.mediaGroupId || '',
    chatId: String(direct?.chatId || telegram.chatId || ''),
    sourceUrl: direct?.sourceUrl || telegram.sourceUrl || analysis.sourceUrl || '',
    media,
    fileId: document?.fileId || '',
    fileUniqueId: document?.fileUniqueId || '',
    fileName: document?.fileName || '',
    mimeType: document?.mimeType || '',
    fileSize: Number(document?.fileSize || 0),
    textCaptured: document?.textCaptured === true,
    directDownloadMaxBytes: DIRECT_DOWNLOAD_MAX_BYTES,
  };
}

function mergeAttachmentMetadata(existing = null, incoming = null) {
  if (!existing && !incoming) return null;
  const left = existing || {};
  const right = incoming || {};
  const media = mergeMediaItems(left.media || [], right.media || [], left.fileId ? [left] : [], right.fileId ? [right] : []);
  const document = downloadableDocument(media);
  return {
    mediaGroupId: right.mediaGroupId || left.mediaGroupId || '',
    chatId: String(right.chatId || left.chatId || ''),
    sourceUrl: right.sourceUrl || left.sourceUrl || '',
    media,
    fileId: document?.fileId || '',
    fileUniqueId: document?.fileUniqueId || '',
    fileName: document?.fileName || '',
    mimeType: document?.mimeType || '',
    fileSize: Number(document?.fileSize || 0),
    textCaptured: document?.textCaptured === true,
    directDownloadMaxBytes: DIRECT_DOWNLOAD_MAX_BYTES,
  };
}

function assetTypes(assets = []) {
  return [...new Set((Array.isArray(assets) ? assets : []).map((asset) => ASSET_TYPE_MAP[asset?.kind]).filter(Boolean))];
}

function mapSignalPage(page) {
  const props = page.properties || {};
  const storedAiProcessingVersion = richText(props['AI processing version']);
  const currentAnalysis = storedAiProcessingVersion === AI_POLICY_VERSION;
  const assets = safeParseAssets(richText(props['Extracted assets']));
  const assistantNote = richText(props['Assistant note']);
  return {
    id: page.id,
    title: titleText(props.Signal) || 'Untitled signal',
    type: selectName(props.Type),
    status: selectName(props.Status),
    priority: selectName(props.Priority),
    relatedProjects: multiSelectNames(props['Related projects']),
    summary: richText(props.Summary),
    originalText: richText(props['Original text']),
    assistantNote,
    possibleUse: richText(props['Possible use']),
    nextAction: richText(props['Next action']),
    sourceUrl: urlValue(props['Source URL']),
    capturedAt: dateStart(props['Date captured']),
    assets,
    aiProcessingVersion: storedAiProcessingVersion,
    storedAiProcessingVersion,
    isCurrentProcessingVersion: currentAnalysis,
    staleProcessingVersion: Boolean(storedAiProcessingVersion && !currentAnalysis),
    needsReprocessing: !storedAiProcessingVersion && !assets.length && !assistantNote,
    attachment: safeParseJson(richText(props['Attachment metadata']), null),
    assetTypes: multiSelectNames(props['Asset type']),
  };
}

async function queryRawInboxSignalRecords(notion, signalsDbId) {
  const results = [];
  let cursor;
  do {
    const response = await notion.databases.query({ database_id: signalsDbId, page_size: 100, start_cursor: cursor });
    results.push(...response.results.map(mapSignalPage));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

function mediaKindFromSignal(signal = {}) {
  const title = String(signal.title || '').toLowerCase();
  if (/фото из telegram|photo from telegram|^фото$/.test(title)) return 'photo';
  if (/видео из telegram|video from telegram|^видео$/.test(title)) return 'video';
  if (/голосовое сообщение/.test(title)) return 'voice';
  if (/аудио/.test(title)) return 'audio';
  if (/\.(pdf|docx?|xlsx?|pptx?|zip|txt|md|csv|json)$/i.test(title)) return 'document';
  return '';
}

function mediaOnlySignal(signal = {}) {
  const kind = mediaKindFromSignal(signal);
  if (kind) return true;
  const media = signal.attachment?.media || [];
  const text = String(signal.originalText || signal.summary || '').trim().toLowerCase();
  if (!media.length) return false;
  return !text || /^(фото из telegram|видео из telegram|голосовое сообщение из telegram)$/i.test(text);
}

function telegramSourceParts(value = '') {
  try {
    const url = new URL(value);
    if (!/(^|\.)t\.me$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'c' && parts.length >= 3) return { family: `c/${parts[1]}`, messageId: Number(parts[2]) || 0 };
    if (parts.length >= 2) return { family: parts[0].toLowerCase(), messageId: Number(parts[1]) || 0 };
  } catch {}
  return null;
}

function placeholderMediaFromSignal(signal = {}) {
  const kind = mediaKindFromSignal(signal);
  if (!kind) return [];
  return [{ kind, messageId: telegramSourceParts(signal.sourceUrl)?.messageId || '', sourceUrl: signal.sourceUrl || '' }];
}

function mergeRecordBundle(parent, child) {
  const parentAttachment = parent.attachment || null;
  const childAttachment = child.attachment || (placeholderMediaFromSignal(child).length ? { media: placeholderMediaFromSignal(child) } : null);
  const attachment = mergeAttachmentMetadata(parentAttachment, childAttachment);
  const assetMap = new Map();
  [...(parent.assets || []), ...(child.assets || [])].forEach((asset) => {
    const key = [asset.kind, asset.category, asset.title, asset.url, asset.content].join('|').toLowerCase();
    if (!assetMap.has(key)) assetMap.set(key, asset);
  });
  return {
    ...parent,
    sourceUrl: parent.sourceUrl || child.sourceUrl,
    attachment,
    assets: [...assetMap.values()],
    aiProcessingVersion: parent.aiProcessingVersion || child.aiProcessingVersion,
    storedAiProcessingVersion: parent.storedAiProcessingVersion || child.storedAiProcessingVersion,
    bundleCount: Number(parent.bundleCount || 1) + 1,
    bundledSignalIds: [...new Set([...(parent.bundledSignalIds || []), child.id])],
  };
}

function bundleLegacyMediaRecords(records = []) {
  const clones = records.map((record) => ({ ...record, assets: [...(record.assets || [])] }));
  const byId = new Map(clones.map((record) => [record.id, record]));
  const removed = new Set();
  const explicitGroups = new Map();

  clones.forEach((record) => {
    const groupId = String(record.attachment?.mediaGroupId || '').trim();
    if (!groupId) return;
    const key = `${record.attachment?.chatId || ''}:${groupId}`;
    if (!explicitGroups.has(key)) explicitGroups.set(key, []);
    explicitGroups.get(key).push(record);
  });

  explicitGroups.forEach((group) => {
    if (group.length < 2) return;
    const ordered = [...group].sort((a, b) => String(a.capturedAt || '').localeCompare(String(b.capturedAt || '')));
    const parent = ordered.find((record) => !mediaOnlySignal(record)) || ordered[0];
    let merged = parent;
    ordered.forEach((record) => {
      if (record.id === parent.id) return;
      merged = mergeRecordBundle(merged, record);
      removed.add(record.id);
    });
    byId.set(parent.id, merged);
  });

  const ordered = clones
    .filter((record) => !removed.has(record.id))
    .sort((a, b) => String(a.capturedAt || '').localeCompare(String(b.capturedAt || '')));

  ordered.forEach((child) => {
    if (removed.has(child.id) || !mediaOnlySignal(child) || child.attachment?.mediaGroupId) return;
    const childSource = telegramSourceParts(child.sourceUrl);
    if (!childSource) return;
    const childTime = new Date(child.capturedAt || 0).getTime();
    let best = null;
    let bestScore = Infinity;

    ordered.forEach((candidate) => {
      if (candidate.id === child.id || removed.has(candidate.id) || mediaOnlySignal(candidate)) return;
      const source = telegramSourceParts(candidate.sourceUrl);
      if (!source || source.family !== childSource.family) return;
      const time = new Date(candidate.capturedAt || 0).getTime();
      const seconds = Math.abs(childTime - time) / 1000;
      const messageGap = childSource.messageId && source.messageId ? Math.abs(childSource.messageId - source.messageId) : 999;
      if (seconds > 30 || messageGap > 20) return;
      const score = seconds + messageGap * 0.5;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    if (!best) return;
    const currentParent = byId.get(best.id) || best;
    byId.set(best.id, mergeRecordBundle(currentParent, child));
    removed.add(child.id);
  });

  return [...byId.values()]
    .filter((record) => !removed.has(record.id))
    .sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')));
}

export async function listInboxSignalRecords({ notionToken, signalsDbId }) {
  if (!notionToken || !signalsDbId) return [];
  const notion = new Client({ auth: notionToken });
  const records = await queryRawInboxSignalRecords(notion, signalsDbId);
  return bundleLegacyMediaRecords(records);
}

export async function getInboxSignalRecord({ notionToken, signalsDbId, signalId }) {
  if (!notionToken || !signalsDbId || !signalId) return null;
  const notion = new Client({ auth: notionToken });
  const page = await notion.pages.retrieve({ page_id: signalId });
  return mapSignalPage(page);
}

export async function findInboxSignalByMediaGroup({ notionToken, signalsDbId, mediaGroupId, chatId = '' }) {
  if (!notionToken || !signalsDbId || !mediaGroupId) return null;
  const notion = new Client({ auth: notionToken });
  const records = await queryRawInboxSignalRecords(notion, signalsDbId);
  return records.find((record) => {
    const attachment = record.attachment || {};
    return String(attachment.mediaGroupId || '') === String(mediaGroupId) && (!chatId || !attachment.chatId || String(attachment.chatId) === String(chatId));
  }) || null;
}

export async function mergeInboxSignalMedia({ notionToken, signalId, signal = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalId) throw new Error('Signal id is missing.');
  const notion = new Client({ auth: notionToken });
  const page = await notion.pages.retrieve({ page_id: signalId });
  const existing = mapSignalPage(page);
  const incomingAttachment = normalizeAttachment(signal);
  const attachment = mergeAttachmentMetadata(existing.attachment, incomingAttachment);
  const properties = {};
  if (attachment) properties['Attachment metadata'] = textProperty(JSON.stringify(attachment));

  const incomingText = String(signal.rawText || '').trim();
  const genericMediaText = /^(Фото из Telegram|Видео из Telegram|Голосовое сообщение из Telegram)$/i.test(incomingText);
  if (incomingText && !genericMediaText) {
    const combined = existing.originalText && !existing.originalText.includes(incomingText)
      ? `${existing.originalText}\n\n${incomingText}`
      : existing.originalText || incomingText;
    properties['Original text'] = textProperty(combined);
    if (!existing.summary || mediaOnlySignal(existing)) properties.Summary = textProperty(combined);
  }
  if (!existing.sourceUrl && signal.sourceUrl) properties['Source URL'] = { url: String(signal.sourceUrl) };

  if (Object.keys(properties).length) await notion.pages.update({ page_id: signalId, properties });
  return { id: signalId, updated: true, attachment };
}

export async function persistSignalAnalysis({ notionToken, signalId, analysis = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalId) throw new Error('Signal id is missing.');
  const notion = new Client({ auth: notionToken });
  const assets = Array.isArray(analysis.assets) ? analysis.assets : [];
  const processingVersion = analysis.aiProcessing?.policyVersion || analysis.policyVersion || '';
  const page = await notion.pages.retrieve({ page_id: signalId });
  const existing = mapSignalPage(page);
  const attachment = mergeAttachmentMetadata(existing.attachment, normalizeAttachment(analysis));
  const properties = {
    Summary: textProperty(analysis.summary || ''),
    'Assistant note': textProperty(analysis.assistantNote || ''),
    'Possible use': textProperty(analysis.possibleUse || ''),
    'Next action': textProperty(analysis.nextAction || ''),
    'Extracted assets': textProperty(serializeAssets(assets)),
    'Asset type': multiSelectProperty(assetTypes(assets)),
  };
  if (analysis.rawText) properties['Original text'] = textProperty(analysis.rawText);
  if (analysis.title) properties.Signal = titleProperty(analysis.title);
  if (processingVersion) properties['AI processing version'] = textProperty(processingVersion);
  if (analysis.type) properties.Type = selectProperty(analysis.type);
  if (analysis.priority) properties.Priority = selectProperty(analysis.priority);
  if (Array.isArray(analysis.relatedProjects)) properties['Related projects'] = multiSelectProperty(analysis.relatedProjects);
  if (attachment) properties['Attachment metadata'] = textProperty(JSON.stringify(attachment));
  await notion.pages.update({ page_id: signalId, properties });
  return { id: signalId, updated: true, assets: assets.length };
}

export async function updateInboxSignalStatus({ notionToken, signalId, status, nextAction = '' }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalId) throw new Error('Signal id is missing.');
  const normalizedStatus = status === 'New' ? 'Inbox' : status === 'Reviewed' ? 'Processed' : status || 'Inbox';
  const notion = new Client({ auth: notionToken });
  await notion.pages.update({
    page_id: signalId,
    properties: {
      Status: selectProperty(normalizedStatus),
      'Next action': textProperty(nextAction || ''),
    },
  });
  return { id: signalId, updated: true, status: normalizedStatus };
}
