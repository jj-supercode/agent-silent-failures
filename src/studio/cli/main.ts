import { serve } from './serve.ts';
import { parseStudioLaunch } from './studio-arguments.ts';
import { decideStudioStart } from './studio-start.ts';

/**
 * `pnpm studio` and `pnpm studio:live`: lists the fault presets, or checks the chosen one and serves the wrapped
 * `mastra dev` with it in the environment, where the Studio project reads it. Returns the exit code.
 */
const launchStudio = async (argv: readonly string[]): Promise<number> => {
    const start = decideStudioStart(parseStudioLaunch(argv), process.env);
    switch (start.kind) {
        case 'print':
            console.log(start.text);
            return 0;
        case 'refused':
            console.error(`Refused: ${start.reason}.`);
            return start.exitCode;
        case 'serve':
            return serve(start.command, start.environment);
        default:
            return start satisfies never;
    }
};

process.exitCode = await launchStudio(process.argv.slice(2));
