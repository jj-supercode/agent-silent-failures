import { describe, expect, test } from 'vitest';

import { defaultStudioMaxUsd, maxUsdVariable, parseStudioLiveOptions } from './studio-live-options.ts';

describe('parseStudioLiveOptions', () => {
    test('an unset cap is the default of USD 1', () => {
        expect(parseStudioLiveOptions({})).toEqual({ kind: 'parsed', options: { maxUsd: defaultStudioMaxUsd } });
        expect(defaultStudioMaxUsd).toBe(1);
    });

    test('reads the cap in US dollars from the environment', () => {
        expect(parseStudioLiveOptions({ [maxUsdVariable]: '0.25' })).toEqual({
            kind: 'parsed',
            options: { maxUsd: 0.25 },
        });
    });

    test.each(['0', '-1', 'one dollar', '', 'Infinity'])('refuses the cap %j', (value) => {
        expect(parseStudioLiveOptions({ [maxUsdVariable]: value })).toEqual({
            kind: 'invalid',
            reason: `${maxUsdVariable} must be a positive number of US dollars`,
        });
    });
});
