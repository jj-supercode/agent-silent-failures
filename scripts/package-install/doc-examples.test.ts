import { describe, expect, test } from 'vitest';

import { importedPackages, packageOf, typescriptBlocks } from './doc-examples.ts';

const page = [
    '# Title',
    '```ts',
    "import { Mastra } from '@mastra/core/mastra';",
    "import { toolLoopScorer } from 'agent-silent-failures';",
    "import { join } from 'node:path';",
    'export const mastra = new Mastra({ scorers: { toolLoopScorer } });',
    '```',
    '```bash',
    'pnpm demo',
    '```',
    '```ts',
    "import { z } from 'zod';",
    '```',
    '',
].join('\n');

describe('doc examples', () => {
    test('finds every ts block of a page, and only ts blocks', () => {
        expect(typescriptBlocks(page)).toHaveLength(2);
        expect(typescriptBlocks(page)[1]).toBe("import { z } from 'zod';\n");
    });

    test('names the packages a block imports, without built-ins', () => {
        expect(importedPackages(typescriptBlocks(page)[0] ?? '')).toEqual(['@mastra/core', 'agent-silent-failures']);
    });

    test('maps a deep import to its package', () => {
        expect([packageOf('@mastra/core/evals'), packageOf('agent-silent-failures/trace'), packageOf('zod')]).toEqual([
            '@mastra/core',
            'agent-silent-failures',
            'zod',
        ]);
    });
});
