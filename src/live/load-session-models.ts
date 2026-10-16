import { envFilePath } from './env-file.ts';
import { MissingApiKeyError } from './errors.ts';
import type { LiveOptions } from './live-options.ts';
import { dryRunModels, liveModels, type SessionModels } from './session-models.ts';

/** The only place the provider is reached, and only after a dry run has been ruled out. */
const sessionModels = async (options: LiveOptions): Promise<SessionModels> => {
    if (options.mode === 'dry-run') {
        return dryRunModels(options.judge);
    }
    const { loadAnthropicModels } = await import('./anthropic-model.ts');
    return liveModels(await loadAnthropicModels(envFilePath), options.judge);
};

export type ModelsLoad =
    { readonly kind: 'loaded'; readonly models: SessionModels } | { readonly kind: 'no-key'; readonly reason: string };

/** A missing key is an expected refusal, not a crash; anything else still throws. */
export const loadSessionModels = async (options: LiveOptions): Promise<ModelsLoad> => {
    try {
        return { kind: 'loaded', models: await sessionModels(options) };
    } catch (error) {
        if (error instanceof MissingApiKeyError) {
            return { kind: 'no-key', reason: error.message };
        }
        throw error;
    }
};
