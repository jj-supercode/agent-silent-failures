import { ensureModelFiles } from '../src/harness/embedder/model-files.ts';

console.log(`embedding model ready in ${await ensureModelFiles()}`);
