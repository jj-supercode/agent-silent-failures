import { describe, expect, test } from 'vitest';

import { defaultHarnessConfig, withSettings } from './config.ts';
import { defineFault } from './fault.ts';

describe('defineFault', () => {
    const topKBySeverity = { narrow: 1, wide: 8 } as const;
    const fault = defineFault({
        id: 'top-k',
        description: 'Changes how many rows a search returns.',
        severities: ['narrow', 'wide'],
        apply: (config, severity) =>
            withSettings(config, { retrieval: { ...config.settings.retrieval, topK: topKBySeverity[severity] } }),
    });

    test('yields one variant per severity, in order', () => {
        expect(fault.variants.map((variant) => variant.severity)).toEqual(['narrow', 'wide']);
    });

    test('each variant applies its severity to a configuration without touching the input', () => {
        const [narrow] = fault.variants;
        expect(narrow.apply(defaultHarnessConfig).settings.retrieval.topK).toBe(topKBySeverity.narrow);
        expect(defaultHarnessConfig.settings.retrieval.topK).not.toBe(topKBySeverity.narrow);
    });
});
