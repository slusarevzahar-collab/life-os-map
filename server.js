import { createLifeMapApp } from './server/lifemapStart.js';

const { start } = createLifeMapApp();

start().catch((error) => {
  console.error('LifeMap startup failed:', error.message);
  process.exitCode = 1;
});
