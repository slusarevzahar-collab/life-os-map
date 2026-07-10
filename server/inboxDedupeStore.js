import { Client } from '@notionhq/client';

function statusName(property) {
  return property?.select?.name || property?.status?.name || '';
}

export async function findInboxSignalBySourceUrl({ notionToken, signalsDbId, sourceUrl }) {
  const url = String(sourceUrl || '').trim();
  if (!notionToken || !signalsDbId || !url) return null;

  const notion = new Client({ auth: notionToken });
  const response = await notion.databases.query({
    database_id: signalsDbId,
    page_size: 10,
    filter: {
      property: 'Source URL',
      url: { equals: url },
    },
  });

  const pages = Array.isArray(response.results) ? response.results : [];
  const preferred = pages.find((page) => !/archived|архив/i.test(statusName(page.properties?.Status))) || pages[0];
  if (!preferred) return null;

  return {
    id: preferred.id,
    status: statusName(preferred.properties?.Status),
    sourceUrl: url,
    matches: pages.length,
  };
}
