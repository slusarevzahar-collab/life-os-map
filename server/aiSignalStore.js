import { Client } from '@notionhq/client';
import { createSignal } from './notionAdapter.js';

function textValue(value = '') {
  return { rich_text: [{ text: { content: String(value).slice(0, 1900) } }] };
}

export async function createAiSignal(args) {
  const result = await createSignal(args);
  if (!args.payload?.assistantNote || !result?.id) return result;
  const notion = new Client({ auth: args.notionToken });
  try {
    await notion.pages.update({
      page_id: result.id,
      properties: { 'Assistant note': textValue(args.payload.assistantNote) },
    });
    return { ...result, assistantNoteStored: true };
  } catch {
    return { ...result, assistantNoteStored: false };
  }
}
