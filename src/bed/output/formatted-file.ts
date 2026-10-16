import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { format, resolveConfig } from 'prettier';

/** Generated files go through the project's own Prettier config, so `pnpm format:check` stays green. */
export const writeFormattedFile = async (path: string, content: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    const config = await resolveConfig(path);
    await writeFile(path, await format(content, { ...config, filepath: path }));
};
