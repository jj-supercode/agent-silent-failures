import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, test } from 'vitest';

import { bedExitCodes } from '../../src/bed/index.ts';
import { eventSchemaVersion, exitCodeTableMarkdown, type DocumentedExitCodes } from '../../src/command-output/index.ts';
import { liveExitCodeRegistry } from '../../src/live/exit-codes.ts';
import { studioLivePreflightExitCodes } from '../../src/live/studio/studio-live-command.ts';
import { replayExitCodes } from '../../src/replay/replay-command.ts';
import { reprosExitCodes } from '../../repros/runner/repros-command.ts';
import { docsChartsExitCodes } from '../docs-charts/docs-charts-command.ts';
import { demonstrationExitCodes } from '../demonstration/demonstration-command.ts';
import { demonstrationLiveExitCodes } from '../demonstration/live-command.ts';
import { docsTablesExitCodes } from './docs-tables-command.ts';

const readmeUrl = new URL('../../README.md', import.meta.url);

const documentedExitCodes: readonly DocumentedExitCodes[] = [
    { commands: ['pnpm demo', 'pnpm bed'], registry: bedExitCodes },
    { commands: ['pnpm replay'], registry: replayExitCodes },
    { commands: ['pnpm repros'], registry: reprosExitCodes },
    { commands: ['pnpm docs:tables'], registry: docsTablesExitCodes },
    { commands: ['pnpm docs:charts'], registry: docsChartsExitCodes },
    { commands: ['pnpm demo:live'], registry: liveExitCodeRegistry },
    { commands: ['pnpm studio:live'], registry: studioLivePreflightExitCodes },
    { commands: ['pnpm demonstration'], registry: demonstrationExitCodes },
    { commands: ['pnpm demonstration:live'], registry: demonstrationLiveExitCodes },
];

/** The README text between `<!-- command-line:<name>:start -->` and its end marker. */
const readmeBlock = (readme: string, name: string): string => {
    const start = `<!-- command-line:${name}:start -->`;
    const end = `<!-- command-line:${name}:end -->`;
    return readme.slice(readme.indexOf(start) + start.length, readme.indexOf(end)).trim();
};

const formattedMarkdown = async (markdown: string): Promise<string> => {
    const path = readmeUrl.pathname;
    return (await format(markdown, { ...(await resolveConfig(path)), filepath: path })).trim();
};

describe('the README documents the command-line contract the code implements', () => {
    test('the exit-code table lists every code of every command, as the registries define them', async () => {
        const readme = await readFile(readmeUrl, 'utf8');
        expect(readmeBlock(readme, 'exit-codes')).toBe(
            await formattedMarkdown(exitCodeTableMarkdown(documentedExitCodes)),
        );
    });

    test('the README names the current JSON schema version', async () => {
        const readme = await readFile(readmeUrl, 'utf8');
        expect(readmeBlock(readme, 'schema-version')).toBe(`Current \`schemaVersion\`: \`${eventSchemaVersion}\`.`);
    });

    test.each(documentedExitCodes)('$commands: one meaning per exit code', ({ registry }) => {
        const codes = Object.values(registry).map((exit) => exit.code);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
