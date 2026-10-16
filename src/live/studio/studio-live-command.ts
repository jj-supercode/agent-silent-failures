import {
    commonExitCodes,
    outputModeVariable,
    type CommandDefinition,
    type ExitCodeRegistry,
} from '../../command-output/index.ts';
import { liveExitCodeRegistry } from '../exit-codes.ts';
import { maxUsdVariable } from './studio-live-options.ts';

/** The codes `pnpm studio:live` can stop with before Studio starts; a missing key means what it means for demo:live. */
export const studioLivePreflightExitCodes = {
    ready: { code: 0, meaning: 'the key and the spend cap are valid; Studio starts' },
    ...commonExitCodes,
    missingApiKey: liveExitCodeRegistry.missingApiKey,
} as const satisfies ExitCodeRegistry;

/** `pnpm studio:live` hands its own arguments to the Studio launcher, so the preflight before it takes none. */
export const studioLivePreflightCommand = {
    name: 'studio:live',
    invocation: 'pnpm studio:live',
    summary: 'checks the key and the spend cap before Mastra Studio starts on Claude Haiku 5.5; sends nothing',
    usage: `${maxUsdVariable}=<usd> ${outputModeVariable}=human|plain|json pnpm studio:live`,
    options: [],
    exitCodes: studioLivePreflightExitCodes,
    parseOptions: (args) =>
        args.length === 0
            ? { kind: 'parsed', options: null }
            : { kind: 'invalid', reason: `the preflight takes no arguments, not: ${args.join(' ')}` },
} as const satisfies CommandDefinition<null>;
