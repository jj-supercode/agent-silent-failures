import { isAbstention, type AnswerPhrasePattern } from '../../text/abstention.ts';
import { retrievalsAmong } from '../../text/count-phrases.ts';
import {
    unitIntervalSchema,
    type RetrievalCall,
    type RetrievalHit,
    type RunView,
    type SpanId,
} from '../../trace/model.ts';
import type { Detector, EmptyRetrievalAnsweredThresholds, Verdict } from './model.ts';

type RowRetrieval = { readonly spanId: SpanId; readonly hits: readonly RetrievalHit[] };

const rowRetrievals = (retrievals: readonly RetrievalCall[]): readonly RowRetrieval[] =>
    retrievals.flatMap((call) =>
        call.retrieved.kind === 'rows' ? [{ spanId: call.spanId, hits: call.retrieved.hits }] : [],
    );

/** Answers longer than this are quoted up to it, with an ellipsis marking the cut. */
const quotedAnswerLength = 120;

const quoted = (answer: string): string =>
    answer.length <= quotedAnswerLength ? `"${answer}"` : `"${answer.slice(0, quotedAnswerLength).trimEnd()}…"`;

const judgeAnswer = (view: RunView, empty: readonly RowRetrieval[], abstains: (text: string) => boolean): Verdict => {
    const answer = view.rootAgentRun.outputText.trim();
    if (answer === '') {
        return { kind: 'clear', evidence: { summary: 'every retrieval came back empty and the agent gave no answer' } };
    }
    if (abstains(answer)) {
        return { kind: 'clear', evidence: { summary: 'every retrieval came back empty and the agent abstained' } };
    }
    return {
        kind: 'fired',
        severity: unitIntervalSchema.parse(1),
        evidence: {
            spanIds: [...empty.map((retrieval) => retrieval.spanId), view.rootAgentRun.spanId],
            summary: `${empty.length === 1 ? 'the only retrieval' : `all ${empty.length} retrievals`} came back empty, yet the agent answered: ${quoted(answer)}`,
        },
    };
};

/**
 * Fires when every retrieval in the run found nothing and the agent still answered instead of abstaining.
 * `extraAbstentionPatterns` extends the shared abstention phrases with an agent's own declining sentence.
 */
export const createEmptyRetrievalAnsweredDetector =
    (extraAbstentionPatterns: readonly AnswerPhrasePattern[]): Detector<RunView, EmptyRetrievalAnsweredThresholds> =>
    (view, { MAX_HITS_FOR_EMPTY }) => {
        if (view.retrievals.length === 0) {
            return { kind: 'not-applicable', reason: 'the run made no retrieval call' };
        }
        const withRows = rowRetrievals(view.retrievals);
        if (withRows.length === 0) {
            return { kind: 'not-applicable', reason: 'no retrieval returned a row list (only errors or other shapes)' };
        }
        // Zero rows is always empty, whatever value a sensitivity sweep gives the threshold.
        const found = withRows.filter((retrieval) => retrieval.hits.length > Math.max(0, MAX_HITS_FOR_EMPTY.value));
        if (found.length > 0) {
            const rowCount = found.reduce((sum, retrieval) => sum + retrieval.hits.length, 0);
            return {
                kind: 'clear',
                evidence: {
                    summary: `${retrievalsAmong(found.length, withRows.length)} found rows (${rowCount} in total)`,
                },
            };
        }
        return judgeAnswer(view, withRows, (text) => isAbstention(text, extraAbstentionPatterns));
    };
