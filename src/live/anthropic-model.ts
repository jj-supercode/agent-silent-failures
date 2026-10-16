import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import type { LanguageModelV4, LanguageModelV4Middleware, SharedV4ProviderOptions } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { z } from 'zod';

import { agentModelPrice, judgeModelPrice } from './budget/pricing.ts';
import { MissingApiKeyError } from './errors.ts';

/**
 * THE ONLY MODULE THAT TOUCHES THE API KEY OR THE PROVIDER. `src/live/main.ts` imports it dynamically, after it
 * has ruled out a dry run, and an import-graph test proves no offline entry point can reach it.
 */

const apiKeyEnvironmentSchema = z.object({ ANTHROPIC_API_KEY: z.string().min(1) });

/** Provider options as the call carries them (JSON); each constant below is also checked against the provider's own type. */
type AnthropicCallOptions = SharedV4ProviderOptions[string];

const withAnthropicOptions = (options: AnthropicCallOptions): LanguageModelV4Middleware => ({
    specificationVersion: 'v4',
    transformParams: ({ params }) =>
        Promise.resolve({
            ...params,
            providerOptions: {
                ...params.providerOptions,
                anthropic: { ...params.providerOptions?.anthropic, ...options },
            },
        }),
});

/**
 * Low effort keeps the agents' adaptive thinking short: they answer from a handful of passages, and the guard's
 * per-call output limit also bounds thinking tokens, which would otherwise crowd out the answer.
 */
const agentOptions = { effort: 'low' } as const satisfies AnthropicLanguageModelOptions & AnthropicCallOptions;

/**
 * The judge returns one small JSON verdict. Claude Sonnet 5.5 rejects disabled thinking and forced tool use, so
 * thinking is limited to `between_tools` (none before a plain answer) and the schema goes through the native output
 * format instead of a forced tool call; both keep the verdict within the judge's 400-token output limit.
 */
const judgeOptions = {
    thinking: { type: 'between_tools' },
    structuredOutputMode: 'outputFormat',
} as const satisfies AnthropicLanguageModelOptions & AnthropicCallOptions;

export type AnthropicModels = {
    readonly agent: LanguageModelV4;
    readonly judge: LanguageModelV4;
};

/**
 * Reads the key from the given env file without copying it into `process.env`, so no child process, logger or
 * stored RequestContext can see it, and builds the agent and judge models.
 */
const isMissingFile = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** The env file's text; a missing file is a missing key, reported as such rather than as a raw `ENOENT`. */
const readEnvFile = async (envFilePath: string): Promise<string> => {
    try {
        return await readFile(envFilePath, 'utf8');
    } catch (error) {
        throw isMissingFile(error) ? new MissingApiKeyError(envFilePath) : error;
    }
};

export const loadAnthropicModels = async (envFilePath: string): Promise<AnthropicModels> => {
    const environment = apiKeyEnvironmentSchema.safeParse(parseEnv(await readEnvFile(envFilePath)));
    if (!environment.success) {
        throw new MissingApiKeyError(envFilePath);
    }
    const anthropic = createAnthropic({ apiKey: environment.data.ANTHROPIC_API_KEY });
    return {
        agent: wrapLanguageModel({
            model: anthropic(agentModelPrice.modelId),
            middleware: withAnthropicOptions(agentOptions),
        }),
        judge: wrapLanguageModel({
            model: anthropic(judgeModelPrice.modelId),
            middleware: withAnthropicOptions(judgeOptions),
        }),
    };
};
