import { parseArgs } from 'node:util';

import { z } from 'zod';

import { catalogEntries } from '../../catalog/index.ts';
import { entryIdSchema } from '../../entries/index.ts';
import type { HarnessSettings } from '../../harness/index.ts';
import { embeddingArgOptions, embeddingSettingsFromArgs } from './embedding-settings.ts';

const knownEntryIds: ReadonlySet<string> = new Set(catalogEntries.map((entry) => entry.id));

const bedOptionsSchema = z
    .object({
        split: z.enum(['dev', 'held-out', 'all']),
        entryId: entryIdSchema
            .refine((id) => knownEntryIds.has(id), {
                message: `--entry must be one of: ${[...knownEntryIds].join(', ')}`,
            })
            .nullable(),
        writeResults: z.boolean(),
        reportJsonPath: z.string().min(1).nullable(),
        details: z.boolean(),
    })
    .refine((options) => !options.writeResults || (options.split === 'all' && options.entryId === null), {
        message: '--write-results rewrites the committed report, so it needs --split all and no --entry',
    });
export type BedOptions = z.infer<typeof bedOptionsSchema> & { readonly settings: Partial<HarnessSettings> };

export const bedUsage =
    'pnpm bed [--split dev|held-out|all] [--entry <id>] [--write-results] [--report-json <path>] [--details] ' +
    '[--embedding-batch-size <n>] [--cold] [--json | --plain]';

/** Reads `pnpm bed` arguments (see `bedUsage`); throws on an unknown flag or value. Nothing is written unless asked for. */
export const bedOptionsFromArgs = (args: readonly string[]): BedOptions => {
    const { values } = parseArgs({
        args: [...args],
        strict: true,
        options: {
            split: { type: 'string', default: 'all' },
            entry: { type: 'string' },
            'write-results': { type: 'boolean', default: false },
            'report-json': { type: 'string' },
            details: { type: 'boolean', default: false },
            ...embeddingArgOptions,
        },
    });
    return {
        ...bedOptionsSchema.parse({
            split: values.split,
            entryId: values.entry ?? null,
            writeResults: values['write-results'],
            reportJsonPath: values['report-json'] ?? null,
            details: values.details,
        }),
        settings: embeddingSettingsFromArgs({
            'embedding-batch-size': values['embedding-batch-size'],
            cold: values.cold,
        }),
    };
};
