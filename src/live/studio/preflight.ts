import { runCommand, stoppedReport, type CommandOutput, type CommandReport } from '../../command-output/index.ts';
import { studioSpendTerms } from './studio-budget.ts';
import { studioLivePreflightCommand, studioLivePreflightExitCodes } from './studio-live-command.ts';
import { maxUsdVariable } from './studio-live-options.ts';
import { formatStudioLiveTerms } from './studio-spend.ts';
import { startStudioLive, type StudioLiveStart } from './start-studio-live.ts';

type StudioLiveRefusal = Exclude<StudioLiveStart['kind'], 'ready'>;

const refusalExits = {
    'invalid-options': studioLivePreflightExitCodes.invalidArguments,
    'no-key': studioLivePreflightExitCodes.missingApiKey,
} as const satisfies Record<StudioLiveRefusal, unknown>;

const refusalFixes = {
    'invalid-options': `set ${maxUsdVariable} to a positive number of US dollars, or unset it for the default cap`,
    'no-key': 'copy .env.example to .env and set ANTHROPIC_API_KEY; pnpm studio runs key-free',
} as const satisfies Record<StudioLiveRefusal, string>;

/**
 * Runs before `mastra dev` in `pnpm studio:live`, so a missing key or an unreadable cap refuses the start with one
 * clear failure instead of a server that crashes on every reload. It loads the model the way Studio will and sends
 * nothing.
 */
const checkStudioLiveStart = async (_options: null, output: CommandOutput): Promise<CommandReport> => {
    const started = await startStudioLive(process.env, () => undefined);
    if (started.kind !== 'ready') {
        output.failure({
            subject: null,
            what: 'Studio refused to start',
            why: started.reason,
            fix: refusalFixes[started.kind],
        });
        return stoppedReport(refusalExits[started.kind], 'refused before Studio started; nothing was sent');
    }
    return stoppedReport(
        studioLivePreflightExitCodes.ready,
        formatStudioLiveTerms(studioSpendTerms(started.options.maxUsd), maxUsdVariable),
    );
};

process.exitCode = await runCommand(studioLivePreflightCommand, process.argv.slice(2), checkStudioLiveStart);
