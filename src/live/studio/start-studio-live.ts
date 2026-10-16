import type { LanguageModelV4 } from '@ai-sdk/provider';

import { loadAnthropicModels } from '../anthropic-model.ts';
import { envFilePath } from '../env-file.ts';
import { MissingApiKeyError } from '../errors.ts';
import { guardStudioModel } from './studio-budget.ts';
import type { StudioSpend } from './studio-spend.ts';
import { parseStudioLiveOptions, type StudioLiveOptions } from './studio-live-options.ts';

export type StudioLiveStart =
    | { readonly kind: 'ready'; readonly model: LanguageModelV4; readonly options: StudioLiveOptions }
    | { readonly kind: 'invalid-options'; readonly reason: string }
    | { readonly kind: 'no-key'; readonly reason: string };

/**
 * The guarded Claude model for `pnpm studio:live`: reads the session cap from the environment, then the key through
 * the live module's only key reader. Nothing is sent here; a missing key or an unreadable cap is a refusal value.
 */
export const startStudioLive = async (
    environment: Readonly<Record<string, string | undefined>>,
    onSpend: (spend: StudioSpend) => void,
): Promise<StudioLiveStart> => {
    const parsed = parseStudioLiveOptions(environment);
    if (parsed.kind === 'invalid') {
        return { kind: 'invalid-options', reason: parsed.reason };
    }
    try {
        const { agent } = await loadAnthropicModels(envFilePath);
        return {
            kind: 'ready',
            model: guardStudioModel(agent, { cap: parsed.options.maxUsd, onSpend }),
            options: parsed.options,
        };
    } catch (error) {
        if (error instanceof MissingApiKeyError) {
            return { kind: 'no-key', reason: error.message };
        }
        throw error;
    }
};
