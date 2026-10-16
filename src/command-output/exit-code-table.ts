import { commonExitCodes } from './exit-codes.ts';
import type { ExitCodeRegistry } from './model.ts';

/** Commands that share one registry, such as `pnpm demo` and `pnpm bed`. */
export type DocumentedExitCodes = { readonly commands: readonly string[]; readonly registry: ExitCodeRegistry };

const commonCodes: ReadonlySet<number> = new Set(Object.values(commonExitCodes).map((exit) => exit.code));

const commandCell = (commands: readonly string[]): string => commands.map((command) => `\`${command}\``).join(', ');

/** The README's exit-code table: each command's own codes, then the codes every command shares. */
export const exitCodeTableMarkdown = (documented: readonly DocumentedExitCodes[]): string =>
    [
        '| Command | Code | Meaning |',
        '| --- | --- | --- |',
        ...documented.flatMap(({ commands, registry }) =>
            Object.values(registry)
                .filter((exit) => !commonCodes.has(exit.code))
                .toSorted((left, right) => left.code - right.code)
                .map((exit) => `| ${commandCell(commands)} | ${exit.code} | ${exit.meaning} |`),
        ),
        ...Object.values(commonExitCodes).map((exit) => `| every command | ${exit.code} | ${exit.meaning} |`),
    ].join('\n');
