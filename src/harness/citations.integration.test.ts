import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, toSourceDocuments, type CorpusQuestion } from '../corpus/index.ts';
import { loadRunView, type RunView } from '../trace/index.ts';
import { resolveCitations } from './citations.ts';
import { defaultHarnessConfig, withModel } from './config.ts';
import { createHarness, type Harness } from './harness.ts';
import { composeAnswer, searchTurn } from './policy/answer-from-hits.ts';
import type { AgentPolicy } from './policy/model.ts';
import { harnessRetrievalTools } from './retrieval-tools.ts';
import { searchCorpusHitsSchema } from './search/model.ts';

const seed = 5;
const searchesPerRun = 2;

/** Searches the question twice, then cites the top row of each search. */
const searchTwicePolicy: AgentPolicy = ({ question, exchanges }) =>
    exchanges.length < searchesPerRun
        ? searchTurn(question)
        : {
              kind: 'answer',
              text: exchanges
                  .map((exchange) => composeAnswer(searchCorpusHitsSchema.parse(exchange.output).hits.slice(0, 1)))
                  .join(' '),
          };

const firstQuestion = async (): Promise<CorpusQuestion> => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new CorpusLoadError(loaded.failure);
    }
    const [question] = loaded.questions;
    if (question === undefined) {
        throw new Error('the committed corpus is empty');
    }
    return question;
};

describe('citation labels on the offline stack', () => {
    let harness: Harness | undefined;
    let view: RunView | undefined;

    beforeAll(async () => {
        const question = await firstQuestion();
        const created = await createHarness({
            config: withModel(defaultHarnessConfig, { kind: 'scripted', policy: searchTwicePolicy }),
            documents: toSourceDocuments([question]),
        });
        if (created.kind === 'failed') {
            throw new Error(JSON.stringify(created.failure));
        }
        harness = created.harness;
        const outcome = await harness.runScenario({ question, seed });
        if (outcome.kind === 'failed') {
            throw new Error(outcome.reason);
        }
        const loaded = await loadRunView(harness.mastra, outcome.run.traceId, {
            retrievalTools: harnessRetrievalTools,
        });
        if (loaded.kind !== 'loaded') {
            throw new Error(`run view did not load: ${loaded.kind}`);
        }
        view = loaded.view;
    });

    afterAll(async () => {
        await harness?.[Symbol.asyncDispose]();
    });

    test('a second search in the same run continues the numbering, so every cited label names one row', () => {
        const topK = defaultHarnessConfig.settings.retrieval.topK;
        const citations = view === undefined ? [] : resolveCitations(view, topK);
        expect(citations.map((citation) => citation.label)).toEqual(['S1', `S${topK + 1}`]);
        expect(citations.every((citation) => citation.hit !== null)).toBe(true);
    });
});
