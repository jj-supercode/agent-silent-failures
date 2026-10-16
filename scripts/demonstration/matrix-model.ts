import type { LanguageModelV4 } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';

import { createMultiAgentPolicy } from '../../src/harness/index.ts';
import type { Usd } from '../../src/live/budget/model.ts';
import type { ModelId } from '../../src/trace/index.ts';
import { agentModelPrice } from '../../src/live/budget/pricing.ts';
import { dryRunModelId } from '../../src/live/dry-run/dry-run-model.ts';
import { estimatedUsageMiddleware } from '../../src/live/dry-run/estimated-usage.ts';
import { guardStudioModel } from '../../src/live/studio/studio-budget.ts';
import { parseStudioLiveOptions } from '../../src/live/studio/studio-live-options.ts';
import type { StudioSpend } from '../../src/live/studio/studio-spend.ts';
import type { ExitCode } from '../../src/command-output/index.ts';
import { scriptedThreadModel } from '../../src/studio/index.ts';
import { demonstrationLiveExitCodes } from './live-command.ts';

export type ReadyMatrixModel = {
    readonly kind: 'ready';
    readonly model: LanguageModelV4;
    readonly agentModel: ModelId;
    readonly cap: Usd;
};

/** The guarded agent model of a matrix session, or why it cannot start (nothing sent). */
export type MatrixModel =
    ReadyMatrixModel | { readonly kind: 'refused'; readonly reason: string; readonly exit: ExitCode };

type Environment = Readonly<Record<string, string | undefined>>;

/** The cleanly behaving scripted agents behind the guard, reporting estimated usage: the live path with no provider. */
export const dryRunModel = (environment: Environment, onSpend: (spend: StudioSpend) => void): MatrixModel => {
    const parsed = parseStudioLiveOptions(environment);
    if (parsed.kind === 'invalid') {
        return { kind: 'refused', reason: parsed.reason, exit: demonstrationLiveExitCodes.invalidArguments };
    }
    const standIn = wrapLanguageModel({
        model: scriptedThreadModel(createMultiAgentPolicy()),
        middleware: estimatedUsageMiddleware,
    });
    return {
        kind: 'ready',
        model: guardStudioModel(standIn, { cap: parsed.options.maxUsd, onSpend }),
        agentModel: dryRunModelId,
        cap: parsed.options.maxUsd,
    };
};

/** The only place the provider is reached, and only after a dry run has been ruled out. */
export const liveModel = async (
    environment: Environment,
    onSpend: (spend: StudioSpend) => void,
): Promise<MatrixModel> => {
    const { startStudioLive } = await import('../../src/live/studio/start-studio-live.ts');
    const started = await startStudioLive(environment, onSpend);
    switch (started.kind) {
        case 'ready':
            return {
                kind: 'ready',
                model: started.model,
                agentModel: agentModelPrice.modelId,
                cap: started.options.maxUsd,
            };
        case 'invalid-options':
            return { kind: 'refused', reason: started.reason, exit: demonstrationLiveExitCodes.invalidArguments };
        case 'no-key':
            return { kind: 'refused', reason: started.reason, exit: demonstrationLiveExitCodes.missingApiKey };
        default:
            return started satisfies never;
    }
};
