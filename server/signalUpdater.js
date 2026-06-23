import { Client } from '@notionhq/client';

function textProperty(value = '') {
  const content = String(value || '');
  return content ? { rich_text: [{ text: { content } }] } : { rich_text: [] };
}

function titleProperty(value = '') {
  return { title: [{ text: { content: String(value || 'Untitled') } }] };
}

function selectProperty(value) {
  return value ? { select: { name: String(value) } } : undefined;
}

function multiSelectProperty(values = []) {
  const list = Array.isArray(values) ? values : String(values || '').split(',');
  const clean = list.map((name) => String(name || '').trim()).filter(Boolean);
  return clean.length ? { multi_select: clean.map((name) => ({ name })) } : undefined;
}

function urlProperty(value) {
  return value ? { url: String(value) } : undefined;
}

function cleanProperties(properties) {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

export async function updateSignalEvent({ notionToken, signalId, event = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalId) throw new Error('Signal id is missing.');
  const notion = new Client({ auth: notionToken });
  const properties = cleanProperties({
    Signal: hasOwn(event, 'title') ? titleProperty(event.title) : undefined,
    Type: hasOwn(event, 'type') ? selectProperty(event.type) : undefined,
    Status: hasOwn(event, 'status') ? selectProperty(event.status) : undefined,
    Priority: hasOwn(event, 'priority') ? selectProperty(event.priority) : undefined,
    'Related projects': hasOwn(event, 'relatedProjects') ? multiSelectProperty(event.relatedProjects) : undefined,
    Summary: hasOwn(event, 'summary') ? textProperty(event.summary) : undefined,
    'Next action': hasOwn(event, 'nextAction') ? textProperty(event.nextAction) : undefined,
    'Possible use': hasOwn(event, 'possibleUse') ? textProperty(event.possibleUse) : undefined,
    'Source URL': hasOwn(event, 'sourceUrl') ? urlProperty(event.sourceUrl) : undefined,
  });

  await notion.pages.update({ page_id: signalId, properties });
  return { id: signalId, updated: true };
}
