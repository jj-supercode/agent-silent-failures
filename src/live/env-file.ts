import { fileURLToPath } from 'node:url';

/**
 * The repository's `.env`, the only file live mode reads its key from. Resolved two levels up from this module;
 * Mastra's dev bundle (`.mastra/output/`) sits at the same depth below the root, so the path holds in Studio too.
 */
export const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url));
