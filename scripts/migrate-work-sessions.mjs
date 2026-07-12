import { Client } from '@notionhq/client';
import { loadLocalEnv } from '../server/lifemapRuntime.js';

loadLocalEnv();
const notionToken = process.env.NOTION_TOKEN;
const sessionsDbId = process.env.NOTION_SESSIONS_DB_ID;
if (!notionToken || !sessionsDbId) {
  console.error('NOTION_TOKEN and NOTION_SESSIONS_DB_ID are required.');
  process.exitCode = 1;
} else {
  const notion = new Client({ auth: notionToken });
  await notion.databases.update({
    database_id: sessionsDbId,
    properties: {
      'Duration Seconds': { number: { format: 'number' } },
      'Initial Seconds': { number: { format: 'number' } },
      'Timer Seconds': { number: { format: 'number' } },
      'Started At Exact': { rich_text: {} },
      'Date Key': { rich_text: {} },
      Timezone: { rich_text: {} },
      Source: { select: { options: [{ name: 'lifemap', color: 'blue' }] } },
      'User ID': { rich_text: {} },
      'Project ID': { rich_text: {} },
      'Task ID': { rich_text: {} },
    },
  });
  console.log(`LifeMap Sessions schema migrated: ${sessionsDbId}`);
}
