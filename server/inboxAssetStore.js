import { Client } from '@notionhq/client';
import { AI_POLICY_VERSION } from './lifemapAiPolicy.js';

const ASSET_TYPE_MAP = {
  Prompt: 'Prompt',
  Tool: 'Tool link',
  Workflow: 'Workflow',
  Task: 'Task',
  Research: 'Source',
  Idea: 'Idea',
  Reference: 'Source',
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

function safeParseAssets(value = '') {
  if (Array.isArray(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeAssets(assets = []) {
  return JSON.stringify(Array.isArray(assets) ? assets : []);
}

function assetTypes(assets = []) {
  return [...new Set((Array.isArray(assets) ? assets : []).map((asset) => ASSET_TYPE_MAP[asset?.kind]).filter(Boolean))];
}

function mapSignalPage(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: titleText(props.Signal) || 'Untitled signal',
    type: selectName(props.Type),
    status: selectName(props.Status),
    priority: selectName(props.Priority),
    relatedProjects: multiSelectNames(props['Related projects']),
    summary: richText(props.Summary),
    assistantNote: richText(props['Assistant note']),
    possibleUse: richText(props['Possible use']),
    nextAction: richText(props['Next action']),
    sourceUrl: urlValue(props['Source URL']),
    capturedAt: dateStart(props['Date captured']),
    assets: safeParseAssets(richText(props['Extracted assets'])),
    aiProcessingVersion: richText(props['AI processing version']),
    assetTypes: multiSelectNames(props['Asset type']),
  };
}

export async function listInboxSignalRecords({ notionToken, signalsDbId }) {
  if (!notionToken || !signalsDbId) return [];
  const notion = new Client({ auth: notionToken });
  const results = [];
  let cursor;
  do {
    const response = await notion.databases.query({ database_id: signalsDbId, page_size: 100, start_cursor: cursor });
    results.push(...response.results.map(mapSignalPage));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results.sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')));
}

export async function persistSignalAnalysis({ notionToken, signalId, analysis = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalId) throw new Error('Signal id is missing.');
  const notion = new Client({ auth: notionToken });
  const assets = Array.isArray(analysis.assets) ? analysis.assets : [];
  const properties = {
    'Assistant note': textProperty(analysis.assistantNote || ''),
    'Possible use': textProperty(analysis.possibleUse || ''),
    'Next action': textProperty(analysis.nextAction || ''),
    'Extracted assets': textProperty(serializeAssets(assets)),
    'AI processing version': textProperty(analysis.aiProcessing?.policyVersion || AI_POLICY_VERSION),
    'Asset type': multiSelectProperty(assetTypes(assets)),
  };
  await notion.pages.update({ page_id: signalId, properties });
  return { id: signalId, updated: true, assets: assets.length };
}
