import type { LanguageModelV4 } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';

import type { HarnessConfig } from '../harness/index.ts';
import type { ModelId } from '../trace/index.ts';
import type { AnthropicModels } from './anthropic-model.ts';
import { budgetGuardMiddleware } from './budget/budget-guard.ts';
import type { SpendLedger } from './budget/session-ledger.ts';
import type { CallLimits, ModelPrice } from './budget/model.ts';
import { agentModelPrice, judgeModelPrice } from './budget/pricing.ts';
import { createContainmentJudgeModel, containmentJudgeModelId } from './dry-run/containment-judge-model.ts';
import { createDryRunModel, dryRunModelId } from './dry-run/dry-run-model.ts';
import { NotScriptedConfigError } from './dry-run/errors.ts';
import { estimatedUsageMiddleware } from './dry-run/estimated-usage.ts';
import type { LiveMode } from './live-options.ts';
import { currentRunScope } from './run-scope.ts';

/** The models of one session, before the budget guard: a live provider or the dry-run stand-ins. */
export type SessionModels = {
    readonly mode: LiveMode;
    readonly agentModelId: ModelId;
    readonly judgeModelId: ModelId | null;
    /** The agent model for one harness configuration (a dry run replays that configuration's scripted policy). */
    readonly agentModelFor: (config: HarnessConfig) => LanguageModelV4;
    readonly judgeModel: LanguageModelV4 | null;
};

const scriptedPolicyOf = (config: HarnessConfig) => {
    const { model } = config.mechanisms;
    if (model.kind !== 'scripted') {
        throw new NotScriptedConfigError();
    }
    return model.policy;
};

type SessionModelIds = Pick<SessionModels, 'agentModelId' | 'judgeModelId'>;

/** The model ids a session of this mode records under, known before any provider is loaded. */
export const sessionModelIds = (mode: LiveMode, judge: boolean): SessionModelIds => {
    switch (mode) {
        case 'dry-run':
            return { agentModelId: dryRunModelId, judgeModelId: judge ? containmentJudgeModelId : null };
        case 'live':
            return { agentModelId: agentModelPrice.modelId, judgeModelId: judge ? judgeModelPrice.modelId : null };
        default:
            return mode satisfies never;
    }
};

/** Scripted policies behind the usage estimate, so the guard and the spend summary see realistic token counts. */
export const dryRunModels = (judge: boolean): SessionModels => ({
    mode: 'dry-run',
    ...sessionModelIds('dry-run', judge),
    agentModelFor: (config) =>
        wrapLanguageModel({
            model: createDryRunModel(scriptedPolicyOf(config), () => currentRunScope()?.scenario ?? null),
            middleware: estimatedUsageMiddleware,
        }),
    judgeModel: judge
        ? wrapLanguageModel({ model: createContainmentJudgeModel(), middleware: estimatedUsageMiddleware })
        : null,
});

export const liveModels = (anthropic: AnthropicModels, judge: boolean): SessionModels => ({
    mode: 'live',
    ...sessionModelIds('live', judge),
    agentModelFor: () => anthropic.agent,
    judgeModel: judge ? anthropic.judge : null,
});

/** Puts a model behind the session's budget guard; calls charge the run in scope at the given price. */
export const guarded = (model: LanguageModelV4, ledger: SpendLedger, price: ModelPrice, limits: CallLimits) =>
    wrapLanguageModel({
        model,
        middleware: budgetGuardMiddleware({
            ledger,
            price,
            limits,
            currentRun: () => currentRunScope()?.budget ?? null,
        }),
    });
