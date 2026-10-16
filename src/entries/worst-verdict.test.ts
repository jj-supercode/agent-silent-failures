import { describe, expect, test } from 'vitest';

import { spanIdSchema, unitIntervalSchema } from '../trace/index.ts';
import type { Verdict } from './contract.ts';
import { worstVerdict } from './worst-verdict.ts';

const fired = (severity: number, spanId: string): Verdict => ({
    kind: 'fired',
    severity: unitIntervalSchema.parse(severity),
    evidence: { spanIds: [spanIdSchema.parse(spanId)], summary: `${spanId} looped` },
});
const clear: Verdict = { kind: 'clear', evidence: { summary: 'no loop' } };
const notApplicable: Verdict = { kind: 'not-applicable', reason: 'no tool calls' };

describe('worstVerdict over the top-level agents of one workflow trace', () => {
    test('returns a single verdict unchanged', () => {
        expect(worstVerdict([clear])).toBe(clear);
    });

    test('fires when any agent fired, at the highest severity, with every fired agent as evidence', () => {
        expect(worstVerdict([clear, fired(0.25, 'first'), notApplicable, fired(0.75, 'second')])).toEqual({
            kind: 'fired',
            severity: 0.75,
            evidence: { spanIds: ['first', 'second'], summary: 'first looped; second looped' },
        });
    });

    test('is clear when no agent fired and at least one could be judged', () => {
        expect(worstVerdict([notApplicable, clear, clear])).toEqual(clear);
    });

    test('is not applicable only when no agent could be judged', () => {
        expect(worstVerdict([notApplicable, notApplicable])).toEqual(notApplicable);
    });
});
