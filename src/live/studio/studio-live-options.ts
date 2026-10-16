import { z } from 'zod';

import { usdSchema, type Usd } from '../budget/model.ts';

/** The environment variable that sets the session cap; Studio passes no flags through to the project. */
export const maxUsdVariable = 'STUDIO_LIVE_MAX_USD';

/** About a thousand questions at the recorded cost per question; small enough to leave running unattended. */
export const defaultStudioMaxUsd = usdSchema.parse(1);

export type StudioLiveOptions = { readonly maxUsd: Usd };

export type StudioLiveOptionsResult =
    | { readonly kind: 'parsed'; readonly options: StudioLiveOptions }
    | { readonly kind: 'invalid'; readonly reason: string };

const studioLiveEnvironmentSchema = z.object({
    [maxUsdVariable]: z.coerce.number().positive().pipe(usdSchema).optional(),
});

/** Reads the session cap from the environment; an unset cap is the default, an unreadable one is refused. */
export const parseStudioLiveOptions = (
    environment: Readonly<Record<string, string | undefined>>,
): StudioLiveOptionsResult => {
    const parsed = studioLiveEnvironmentSchema.safeParse({ [maxUsdVariable]: environment[maxUsdVariable] });
    return parsed.success
        ? { kind: 'parsed', options: { maxUsd: parsed.data[maxUsdVariable] ?? defaultStudioMaxUsd } }
        : { kind: 'invalid', reason: `${maxUsdVariable} must be a positive number of US dollars` };
};
