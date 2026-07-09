import fs from 'node:fs';
import path from 'node:path';

const LOCAL_INBOX_PATH = path.resolve(process.cwd(), '.data', 'telegram-inbox.jsonl');
const TEXT_DOCUMENT_LIMIT_BYTES = 512 * 1024;
const SIGNAL_TEXT_LIMIT = 8000;

function ensureLocalInboxDir() { fs.mkdirSync(path.dirname(LOCAL_INBOX_PATH), { recursive: true }); }
function compactText(value = '', limit = 1200) { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text.length <= limit ? text : `${text.slice(0, limit - 1).trim()}…`; }
function compactMultiline(value = '', limit = SIGNAL_TEXT_LIMIT) { const text = String(value || '').replace(/\r\n/g, '\n').trim(); return text.length <= limit ? text : `${text.slice(0, limit - 1).trim()}…`; }
function firstLine(value = '') { return String(value || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || ''; }
function shortTitle(value = '', fallback = 'Telegram signal') { const raw = firstLine(value) || fallback; const clean = raw.replace(/^https?:\/\/\S+$/i, 'Ссылка из Telegram'); return compactText(clean, 72); }
function messageFromUpdate(update = {}) { return update.message || update.edited_message || update.channel_post || update.edited_channel_post || null; }
function textFromMessage(message = {}) { return message.text || message.caption || message.poll?.question || message.document?.file_name || message.photo?.length && 'Фото из Telegram' || message.video && 'Видео из Telegram' || message.voice && 'Голосовое сообщение из Telegram' || message.audio?.title || ''; }
function heuristicText(value = '') { return String(value || '').split(/\r?\n/).filter((line) => !/^\s*[“”"'`>]*\s*(system|developer|assistant)\s*:/i.test(line)).join('\n'); }

function collectEntityUrls(message = {}) {
  const source = message.text || message.caption || '';
  const entities = [...(message.entities || []), ...(message.caption_entities || [])];
  const urls = [];
  entities.forEach((entity) => {
    if (entity.url) urls.push(entity.url);
    if (entity.type === 'url' && Number.isFinite(entity.offset) && Number.isFinite(entity.length)) urls.push(source.slice(entity.offset, entity.offset + entity.length));
  });
  const rawUrls = source.match(/https?:\/\/\S+/gi) || [];
  return [...new Set([...urls, ...rawUrls].map((url) => url.replace(/[),.;]+$/, '')))].filter(Boolean);
}

function publicTelegramLink(chat = {}, messageId) {
  if (!messageId) return '';
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  const chatId = String(chat.id || '');
  if (chatId.startsWith('-100')) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  return '';
}

function forwardedOrigin(message = {}) {
  const origin = message.forward_origin;
  if (origin?.type === 'channel' && origin.chat && origin.message_id) return { url: publicTelegramLink(origin.chat, origin.message_id), source: origin.chat.username ? `@${origin.chat.username}` : origin.chat.title || 'Telegram channel', chatId: origin.chat.id, messageId: origin.message_id, type: origin.type };
  if (origin?.type === 'chat' && origin.sender_chat && origin.message_id) return { url: publicTelegramLink(origin.sender_chat, origin.message_id), source: origin.sender_chat.username ? `@${origin.sender_chat.username}` : origin.sender_chat.title || 'Telegram chat', chatId: origin.sender_chat.id, messageId: origin.message_id, type: origin.type };
  if (message.forward_from_chat && message.forward_from_message_id) return { url: publicTelegramLink(message.forward_from_chat, message.forward_from_message_id), source: message.forward_from_chat.username ? `@${message.forward_from_chat.username}` : message.forward_from_chat.title || 'Telegram channel', chatId: message.forward_from_chat.id, messageId: message.forward_from_message_id, type: 'legacy_forward' };
  return null;
}

function directMessageLink(message = {}) { if (!message.chat || !message.message_id || !['channel', 'supergroup'].includes(message.chat.type)) return ''; return publicTelegramLink(message.chat, message.message_id); }
function sourceLinkFor(message = {}, urls = []) {
  const origin = forwardedOrigin(message);
  const telegramPostUrl = origin?.url || directMessageLink(message);
  const sourceText = String(message.text || message.caption || '').trim();
  const embeddedSourceUrl = urls.length === 1 && sourceText.length <= Math.max(240, String(urls[0] || '').length + 120) ? urls[0] : '';
  return { sourceUrl: telegramPostUrl || embeddedSourceUrl || '', telegramPostUrl, forwardedFrom: origin, entityUrls: urls };
}

function mediaItemFromMessage(message = {}) {
  const common = { messageId: message.message_id || '' };
  if (message.document) return { kind: 'document', fileId: message.document.file_id || '', fileUniqueId: message.document.file_unique_id || '', fileName: message.document.file_name || '', mimeType: message.document.mime_type || '', fileSize: Number(message.document.file_size || 0), ...common };
  if (message.video) return { kind: 'video', fileId: message.video.file_id || '', fileUniqueId: message.video.file_unique_id || '', fileName: message.video.file_name || '', mimeType: message.video.mime_type || 'video/mp4', fileSize: Number(message.video.file_size || 0), width: Number(message.video.width || 0), height: Number(message.video.height || 0), duration: Number(message.video.duration || 0), ...common };
  if (message.animation) return { kind: 'animation', fileId: message.animation.file_id || '', fileUniqueId: message.animation.file_unique_id || '', fileName: message.animation.file_name || '', mimeType: message.animation.mime_type || '', fileSize: Number(message.animation.file_size || 0), width: Number(message.animation.width || 0), height: Number(message.animation.height || 0), duration: Number(message.animation.duration || 0), ...common };
  if (Array.isArray(message.photo) && message.photo.length) {
    const photo = message.photo.at(-1) || message.photo[0];
    return { kind: 'photo', fileId: photo.file_id || '', fileUniqueId: photo.file_unique_id || '', fileName: '', mimeType: 'image/jpeg', fileSize: Number(photo.file_size || 0), width: Number(photo.width || 0), height: Number(photo.height || 0), ...common };
  }
  if (message.audio) return { kind: 'audio', fileId: message.audio.file_id || '', fileUniqueId: message.audio.file_unique_id || '', fileName: message.audio.file_name || message.audio.title || '', mimeType: message.audio.mime_type || '', fileSize: Number(message.audio.file_size || 0), duration: Number(message.audio.duration || 0), ...common };
  if (message.voice) return { kind: 'voice', fileId: message.voice.file_id || '', fileUniqueId: message.voice.file_unique_id || '', fileName: '', mimeType: message.voice.mime_type || '', fileSize: Number(message.voice.file_size || 0), duration: Number(message.voice.duration || 0), ...common };
  if (message.video_note) return { kind: 'video_note', fileId: message.video_note.file_id || '', fileUniqueId: message.video_note.file_unique_id || '', fileName: '', mimeType: 'video/mp4', fileSize: Number(message.video_note.file_size || 0), duration: Number(message.video_note.duration || 0), ...common };
  return null;
}

function projectTagsFor(text = '') {
  const lower = text.toLowerCase();
  const tags = [];
  if (/lifemap|life os|live os|навигатор|карта/i.test(lower)) tags.push('LifeMap');
  if (/sleda|следа|следы/i.test(lower)) tags.push('Sleda.net');
  if (/telegram|bot|бот|inbox|инбокс/i.test(lower)) tags.push('LM Inbox');
  if (/4life|transfer factor|трансфер фактор/i.test(lower)) tags.push('4Life');
  if (/yandex|яндекс|самокат|чардж|энерджайзер/i.test(lower)) tags.push('Yandex Chargers');
  if (/ai|нейро|нейросет|agent|агент|автоматизац/i.test(lower)) tags.push('AI Tools');
  return [...new Set(tags)].slice(0, 5);
}

function inferType(text = '', urls = []) {
  const lower = text.toLowerCase();
  if (/\.md|prompt|промпт|claude\.md|review\.md|commit\.md|publish\.md/i.test(lower)) return 'Telegram';
  if (urls.length && text.length < 180) return 'Link';
  if (/идея|можно сделать|придумал|concept|mvp|продукт/i.test(lower)) return 'Idea';
  if (/задача|нужно|сделать|проверь|исправь|добавь/i.test(lower)) return 'Task candidate';
  if (/инструмент|tool|сервис|app|приложение|api/i.test(lower)) return 'Tool';
  return 'Telegram';
}

function inferPriority(text = '') { if (/срочно|важно|приоритет|сегодня|urgent|asap/i.test(text)) return 'High'; if (/потом|когда-нибудь|не срочно|архив/i.test(text)) return 'Low'; return 'Normal'; }
function sourceLabel(message = {}) { const origin = forwardedOrigin(message); if (origin?.source) return origin.source; const chat = message.chat || {}; if (chat.username) return `@${chat.username}`; if (chat.title) return chat.title; if (message.from?.username) return `@${message.from.username}`; const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' '); return name || String(chat.id || message.from?.id || 'Telegram'); }

function textDocumentCandidate(document = {}) {
  const name = String(document.file_name || document.fileName || '').toLowerCase();
  const mime = String(document.mime_type || document.mimeType || '').toLowerCase();
  const size = Number(document.file_size || document.fileSize || 0);
  if (size && size > TEXT_DOCUMENT_LIMIT_BYTES) return false;
  return /\.(md|txt|json|csv|html?|xml|yaml|yml)$/i.test(name) || mime.startsWith('text/') || ['application/json', 'application/xml', 'application/x-yaml'].includes(mime);
}

export function buildSignalFromTelegramUpdate(update = {}) {
  const message = messageFromUpdate(update);
  if (!message) return null;
  const content = textFromMessage(message);
  const urls = collectEntityUrls(message);
  const linkInfo = sourceLinkFor(message, urls);
  const originalText = String(content || '').trim();
  const title = shortTitle(originalText || linkInfo.sourceUrl, 'Telegram signal');
  const capturedAt = message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString();
  const source = sourceLabel(message);
  const summary = originalText ? compactMultiline(originalText) : compactText(`Входящий объект из Telegram: ${title}`, 900);
  const safeHeuristicText = heuristicText(`${title}\n${summary}`);
  const relatedProjects = projectTagsFor(safeHeuristicText);
  const possibleUse = relatedProjects.length ? `Связать с: ${relatedProjects.join(', ')}. Разобрать и решить, это задача, идея, материал или контекст.` : 'Разобрать: это задача, идея, материал, ссылка или контекст для будущей работы.';
  const mediaGroupId = String(message.media_group_id || '');
  const mediaItem = mediaItemFromMessage(message);
  const media = mediaItem ? [{ ...mediaItem, sourceUrl: linkInfo.sourceUrl }] : [];
  const chatId = message.chat?.id || message.from?.id || 'chat';
  return {
    id: mediaGroupId ? `telegram-${chatId}-group-${mediaGroupId}` : `telegram-${chatId}-${message.message_id || update.update_id}`,
    title,
    type: inferType(safeHeuristicText, urls),
    status: 'New',
    priority: inferPriority(safeHeuristicText),
    relatedProjects,
    summary,
    nextAction: 'Разобрать входящий сигнал и решить, превращать ли его в задачу, заметку или проектный материал.',
    possibleUse,
    sourceUrl: linkInfo.sourceUrl,
    capturedAt,
    source,
    rawText: originalText,
    attachment: mediaItem ? { mediaGroupId, chatId: String(chatId), sourceUrl: linkInfo.sourceUrl, media } : null,
    telegram: {
      updateId: update.update_id,
      messageId: message.message_id,
      chatId: message.chat?.id,
      chatType: message.chat?.type,
      userId: message.from?.id,
      username: message.from?.username || message.chat?.username || '',
      source,
      sourceUrl: linkInfo.sourceUrl,
      telegramPostUrl: linkInfo.telegramPostUrl,
      forwardedFrom: linkInfo.forwardedFrom,
      entityUrls: linkInfo.entityUrls,
      mediaGroupId,
      media,
      attachment: mediaItem ? { mediaGroupId, chatId: String(chatId), sourceUrl: linkInfo.sourceUrl, media } : null,
      document: message.document ? mediaItem : null,
    },
  };
}

export async function enrichSignalWithTelegramDocument({ signal, botToken }) {
  const document = signal?.telegram?.document;
  if (!signal || !botToken || !document?.fileId || !textDocumentCandidate(document)) return signal;
  try {
    const file = await telegramApi(botToken, 'getFile', { file_id: document.fileId });
    const filePath = file?.result?.file_path;
    if (!filePath) return signal;
    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
    const text = await response.text();
    const cleanText = compactMultiline(text);
    if (!cleanText) return signal;
    const enrichedDocument = { ...document, textCaptured: true, textLength: text.length };
    const media = (signal.telegram?.media || []).map((item) => item.fileId === document.fileId ? enrichedDocument : item);
    const title = document.fileName || signal.title || 'Telegram document';
    const summary = compactMultiline(`${title}\n\n${cleanText}`);
    const safeHeuristicText = heuristicText(`${title}\n${summary}`);
    const relatedProjects = projectTagsFor(safeHeuristicText);
    return {
      ...signal,
      title,
      type: inferType(safeHeuristicText, signal.telegram?.entityUrls || []),
      priority: inferPriority(safeHeuristicText),
      relatedProjects: relatedProjects.length ? relatedProjects : signal.relatedProjects,
      summary,
      rawText: cleanText,
      possibleUse: relatedProjects.length ? `Связать с: ${relatedProjects.join(', ')}. Это контекстный документ к входящему посту; решить, прикрепить его к основному сигналу или вынести в библиотеку.` : 'Контекстный документ из Telegram. Решить, к какому основному посту или проекту его прикрепить.',
      attachment: { ...(signal.attachment || {}), media },
      telegram: { ...signal.telegram, media, document: enrichedDocument, attachment: { ...(signal.telegram?.attachment || {}), media } },
    };
  } catch (error) {
    const failedDocument = { ...document, textCaptured: false, textError: error.message };
    const media = (signal.telegram?.media || []).map((item) => item.fileId === document.fileId ? failedDocument : item);
    return { ...signal, possibleUse: `${signal.possibleUse || ''} Не удалось подтянуть текст документа: ${error.message}`.trim(), attachment: { ...(signal.attachment || {}), media }, telegram: { ...signal.telegram, media, document: failedDocument, attachment: { ...(signal.telegram?.attachment || {}), media } } };
  }
}

export function allowedTelegramUser(signal, allowedUserIds = '') {
  const list = String(allowedUserIds || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!list.length) return true;
  const userId = String(signal?.telegram?.userId || '');
  const chatId = String(signal?.telegram?.chatId || '');
  return list.includes(userId) || list.includes(chatId);
}

export function appendLocalSignal(signal) { ensureLocalInboxDir(); fs.appendFileSync(LOCAL_INBOX_PATH, `${JSON.stringify({ ...signal, local: true, storedAt: new Date().toISOString() })}\n`, 'utf8'); }
export function readLocalSignals(limit = 50) { if (!fs.existsSync(LOCAL_INBOX_PATH)) return []; const lines = fs.readFileSync(LOCAL_INBOX_PATH, 'utf8').split(/\r?\n/).filter(Boolean); return lines.slice(-limit).reverse().map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); }

export async function telegramApi(botToken, method, payload = {}) {
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is missing.');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}

export async function sendTelegramMessage({ botToken, chatId, text }) { if (!botToken || !chatId || !text) return null; return telegramApi(botToken, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true }); }
export async function setTelegramWebhook({ botToken, webhookUrl, secretToken }) { if (!webhookUrl) throw new Error('Webhook URL is missing.'); return telegramApi(botToken, 'setWebhook', { url: webhookUrl, secret_token: secretToken || undefined, allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'] }); }
export async function getTelegramWebhookInfo(botToken) { return telegramApi(botToken, 'getWebhookInfo', {}); }
