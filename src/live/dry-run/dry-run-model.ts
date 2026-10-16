import type { LanguageModelV4 } from '@ai-sdk/provider';

import { createScriptedModel, type AgentPolicy, type ScenarioContext } from '../../harness/index.ts';
import { modelIdSchema } from '../../trace/index.ts';
import { DryRunOutsideRunError } from './errors.ts';

export const dryRunModelId = modelIdSchema.parse('dry-run-scripted-policy');

/**
 * The live code path without a provider: every call is served by the configuration's own scripted policy for the
 * run in scope, so a dry run produces the same turns, and the same traces, as the scripted bed for that run.
 */
export const createDryRunModel = (
    policy: AgentPolicy,
    currentScenario: () => ScenarioContext | null,
): LanguageModelV4 => {
    const scriptedForCurrentRun = () => {
        const scenario = currentScenario();
        if (scenario === null) {
            throw new DryRunOutsideRunError();
        }
        return createScriptedModel(policy, scenario);
    };
    return {
        specificationVersion: 'v4',
        provider: 'dry-run',
        modelId: dryRunModelId,
        supportedUrls: {},
        doGenerate: (options) => scriptedForCurrentRun().doGenerate(options),
        doStream: (options) => scriptedForCurrentRun().doStream(options),
    };
};
