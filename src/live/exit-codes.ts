import { commonExitCodes, type ExitCodeRegistry } from '../command-output/index.ts';

/** Exit codes of `pnpm demo:live`; the `pnpm studio:live` preflight reuses the ones that apply to it. */
export const liveExitCodeRegistry = {
    done: { code: 0, meaning: 'every planned run was attempted; a failed run is recorded with its reason' },
    ...commonExitCodes,
    overBudget: { code: 3, meaning: 'the pre-flight worst case is above --max-usd; nothing was sent' },
    stoppedEarly: { code: 4, meaning: 'the session stopped early; everything recorded is replayable and resumable' },
    fixturesExist: { code: 5, meaning: 'the target directory already holds a recording; nothing was sent' },
    missingApiKey: { code: 6, meaning: 'no ANTHROPIC_API_KEY in .env; nothing was sent' },
    resumeRefused: { code: 7, meaning: 'the recording cannot be resumed with this checkout; nothing was sent' },
    corpusUnreadable: { code: 8, meaning: 'the committed question corpus could not be read; nothing was sent' },
} as const satisfies ExitCodeRegistry;

/** The bare codes, for code that only compares them. */
export const liveExitCodes = {
    done: liveExitCodeRegistry.done.code,
    invalidArguments: liveExitCodeRegistry.invalidArguments.code,
    overBudget: liveExitCodeRegistry.overBudget.code,
    stoppedEarly: liveExitCodeRegistry.stoppedEarly.code,
    fixturesExist: liveExitCodeRegistry.fixturesExist.code,
    missingApiKey: liveExitCodeRegistry.missingApiKey.code,
    resumeRefused: liveExitCodeRegistry.resumeRefused.code,
} as const;
