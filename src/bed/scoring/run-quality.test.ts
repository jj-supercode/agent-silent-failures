import { describe, expect, test } from 'vitest';

import { sampleQuestion } from '../../corpus/testing.ts';
import {
    sampleAgentRunSpans,
    sampleHits,
    sampleRetrievalTools,
    sampleRetrievalToolName,
    descendingScore,
} from '../../trace/testing.ts';
import { toRunView, type RunView } from '../../trace/index.ts';
import { goldSentenceRecall } from './run-quality.ts';

const viewWithRows = (texts: readonly string[]): RunView => {
    const hits = sampleHits(texts.length, descendingScore).map((hit, index) => ({ ...hit, text: texts[index] ?? '' }));
    const mapped = toRunView(
        sampleAgentRunSpans({
            agentId: 'agent',
            outputText: 'answer',
            steps: [{ toolName: sampleRetrievalToolName, args: { query: 'q' }, result: { returned: { hits } } }],
        }),
        { retrievalTools: sampleRetrievalTools() },
    );
    if (mapped.kind !== 'run') {
        expect.unreachable(mapped.reason);
    }
    return mapped.view;
};

describe('goldSentenceRecall', () => {
    const question = sampleQuestion('q1', ['Alpha', 'Beta', 'Gamma']);

    test('is the share of gold sentences found in retrieved row text', () => {
        expect(
            goldSentenceRecall(question, viewWithRows(['Alpha is a place. It has a river.', 'Gamma is a place.'])),
        ).toBe(0.5);
    });

    test('is null when no retrieval returned rows', () => {
        const mapped = toRunView(sampleAgentRunSpans({ agentId: 'agent', outputText: 'answer', steps: [] }), {
            retrievalTools: sampleRetrievalTools(),
        });
        expect(mapped.kind === 'run' && goldSentenceRecall(question, mapped.view)).toBeNull();
    });
});
