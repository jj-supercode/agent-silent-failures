import { faultIdSchema, severityIdSchema, variationIdSchema } from '../catalog/index.ts';
import { questionIdSchema } from '../corpus/index.ts';
import { entryIdSchema, type EntryId, type Verdict } from '../entries/index.ts';
import { unitIntervalSchema } from '../trace/index.ts';
import {
    familyIdSchema,
    runIdSchema,
    type EntryVerdict,
    type FaultExpressionStatus,
    type ScoredCondition,
    type ScoredRun,
    type SweepPoint,
} from './model.ts';

/** Sample generators for bed unit tests. */
export const sampleEntryId = entryIdSchema.parse('sample-entry');
export const otherEntryId = entryIdSchema.parse('other-entry');

export const firedVerdict: Verdict = {
    kind: 'fired',
    severity: unitIntervalSchema.parse(1),
    evidence: { spanIds: [], summary: 'fired' },
};
export const clearVerdict: Verdict = { kind: 'clear', evidence: { summary: 'clear' } };
export const notApplicableVerdict: Verdict = { kind: 'not-applicable', reason: 'nothing to judge' };

export const cleanCondition = (variation = 'baseline', hardNegativeFor: readonly EntryId[] = []): ScoredCondition => ({
    kind: 'clean',
    variation: variationIdSchema.parse(variation),
    hardNegativeFor,
});

export const faultedCondition = (
    entryId: EntryId,
    faultId = 'sample-fault',
    severity = 'level-1',
    expression: FaultExpressionStatus = 'expressed',
): ScoredCondition => ({
    kind: 'faulted',
    entryId,
    faultId: faultIdSchema.parse(faultId),
    severity: severityIdSchema.parse(severity),
    expression,
});

export const entryVerdict = (entryId: EntryId, verdict: Verdict, sweep: readonly SweepPoint[] = []): EntryVerdict => ({
    entryId,
    verdict,
    sweep,
});

type SampleRun = {
    readonly condition: ScoredCondition;
    readonly verdicts: readonly EntryVerdict[];
    readonly split?: ScoredRun['split'];
    readonly observation?: ScoredRun['observation'];
};

/** Summaries never read run ids, so samples share one. */
const sampleRun = ({ condition, verdicts, split = 'held-out', observation }: SampleRun): ScoredRun => {
    return {
        runId: runIdSchema.parse('sample-run'),
        source: 'scripted',
        split,
        family: familyIdSchema.parse('h1'),
        questionId: questionIdSchema.parse('q1'),
        harness: 'single-agent',
        observation: observation ?? {
            kind: 'agent-run',
            quality: { goldAnswerFound: true, goldSentenceRecall: unitIntervalSchema.parse(1) },
        },
        condition,
        verdicts,
    };
};

/** `count` copies of one sample run. */
export const sampleRuns = (count: number, run: SampleRun): readonly ScoredRun[] =>
    Array.from({ length: count }, () => sampleRun(run));
