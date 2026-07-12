import chunk1 from './space-bg-chunks/chunk1.js';
import chunk2 from './space-bg-chunks/chunk2.js';
import chunk3 from './space-bg-chunks/chunk3.js';
import chunk4 from './space-bg-chunks/chunk4.js';

const base64 = [chunk1, chunk2, chunk3, chunk4].join('');

export default `data:image/webp;base64,${base64}`;
