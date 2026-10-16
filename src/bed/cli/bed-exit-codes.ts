import { commonExitCodes, type ExitCodeRegistry } from '../../command-output/index.ts';

/** Exit codes of `pnpm bed` and `pnpm demo` (a small bed). */
export const bedExitCodes = {
    allScored: { code: 0, meaning: 'every planned run was scored' },
    runsFailed: { code: 1, meaning: 'at least one run failed; each is reported, and no results file is written' },
    ...commonExitCodes,
    corpusUnreadable: { code: 3, meaning: 'the committed question corpus could not be read' },
} as const satisfies ExitCodeRegistry;
