import { describe, expect, test } from 'vitest';

import { toRunView } from '../../trace/index.ts';
import type { RunView } from '../../trace/model.ts';
import { sampleAgentRunSpans, sampleRetrievalTools, type DelegationSample } from '../../trace/testing.ts';
import { detectDelegationPingPong } from './detector.ts';
import { delegationPingPongEntry } from './entry.ts';
import { delegationPingPongThresholds } from './model.ts';

const question = 'Were Scott Derrickson and Ed Wood of the same nationality?';
const derricksonFacts = 'Scott Derrickson is an American director, screenwriter and producer from Denver [S1].';
const woodFacts = 'Edward Davis Wood Jr. was an American filmmaker, actor and writer [S1].';

const toResearcher = (prompt: string, reply: string): DelegationSample => ({
    workerName: 'researcher',
    prompt,
    worker: { agentId: 'researcher-agent', outputText: reply, steps: [] },
});
const toChecker = (prompt: string, reply: string): DelegationSample => ({
    workerName: 'checker',
    prompt,
    worker: { agentId: 'checker-agent', outputText: reply, steps: [] },
});

const supervisorWith = (steps: readonly DelegationSample[]): RunView => {
    const built = toRunView(
        sampleAgentRunSpans({ agentId: 'supervisor-agent', outputText: 'Both are American.', steps }),
        { retrievalTools: sampleRetrievalTools() },
    );
    if (built.kind !== 'run') {
        throw new Error(built.reason);
    }
    return built.view;
};

const detect = (view: RunView) => detectDelegationPingPong(view, delegationPingPongThresholds);
const delegationPingPongEntryDetect = (view: RunView) =>
    delegationPingPongEntry.detect(view, { MIN_REDELEGATIONS: 99, MIN_BOUNCE_LENGTH: 1 });

const researchDerrickson = toResearcher('Find what the corpus says about Scott Derrickson.', derricksonFacts);

describe('detectDelegationPingPong fires', () => {
    test('on the same task sent three times, reworded once', () => {
        const reworded = toResearcher('Please find what the corpus says about Scott Derrickson.', derricksonFacts);
        const verdict = detect(supervisorWith([researchDerrickson, reworded, researchDerrickson]));
        expect(verdict).toMatchObject({ kind: 'fired', severity: 2 / 3 });
    });

    test('on a bounce whose workers reword the same facts each round', () => {
        const check = (reply: string) =>
            toChecker('Read the source "Scott Derrickson" and confirm its key facts.', reply);
        const reworded = toResearcher(
            'Find what the corpus says about Scott Derrickson.',
            'According to the passages, Scott Derrickson, from Denver, is an American film director and producer [S1].',
        );
        const verdict = detect(
            supervisorWith([
                researchDerrickson,
                check('Confirmed: Scott Derrickson is American and was born in Denver [S1].'),
                reworded,
                check('Yes. The source says Scott Derrickson is an American from Denver [S1].'),
            ]),
        );
        expect(verdict.kind === 'fired' ? verdict.evidence.summary : '').toContain('bounced');
    });

    test('on a bounce between two workers whose replies never change', () => {
        const check = toChecker('Read the source "Scott Derrickson" and confirm its key facts.', derricksonFacts);
        const verdict = detect(supervisorWith([researchDerrickson, check, researchDerrickson, check]));
        expect(verdict.kind === 'fired' ? verdict.evidence.summary : '').toContain('bounced');
    });
});

describe('detectDelegationPingPong stays clear', () => {
    test('on two different subjects sent to the same worker (a comparison task)', () => {
        const researchWood = toResearcher('Find what the corpus says about Ed Wood.', woodFacts);
        expect(detect(supervisorWith([researchDerrickson, researchWood])).kind).toBe('clear');
    });

    test('on three long prompts that differ only in the subject they name', () => {
        const prompt = (subject: string) => `Look up ${subject} for this question: ${question} Report the key facts.`;
        const verdict = detect(
            supervisorWith([
                toResearcher(prompt('Scott Derrickson'), derricksonFacts),
                toResearcher(prompt('Ed Wood'), woodFacts),
                toResearcher(prompt('Denver'), 'Denver is the capital of Colorado.'),
            ]),
        );
        expect(verdict.kind).toBe('clear');
    });

    test('on a legitimate retry of each subject when prompts quote a question naming both', () => {
        const prompt = (subject: string, attempt: string) =>
            `${attempt}look up ${subject} for this question: ${question}`;
        const abstaining = 'I could not find an answer in the corpus.';
        const verdict = detect(
            supervisorWith([
                toResearcher(prompt('Scott Derrickson', ''), abstaining),
                toResearcher(prompt('Scott Derrickson', 'Please '), abstaining),
                toResearcher(prompt('Ed Wood', ''), abstaining),
                toResearcher(prompt('Ed Wood', 'Please '), abstaining),
            ]),
        );
        expect(verdict.kind).toBe('clear');
    });

    test('on one legitimate re-delegation after an empty reply', () => {
        const empty = toResearcher('Find what the corpus says about Scott Derrickson.', '');
        expect(detect(supervisorWith([empty, researchDerrickson])).kind).toBe('clear');
    });

    test('on research followed by a check of each subject', () => {
        const researchWood = toResearcher('Find what the corpus says about Ed Wood.', woodFacts);
        const checkWood = toChecker('Read the source "Ed Wood" and confirm its key facts.', woodFacts);
        expect(detect(supervisorWith([researchDerrickson, researchWood, checkWood])).kind).toBe('clear');
    });

    test('on alternating workers whose replies name no facts but say different things', () => {
        const ask = (prompt: string, reply: string) => toResearcher(prompt, reply);
        const confirm = (reply: string) => toChecker('Check the draft answer.', reply);
        const verdict = detect(
            supervisorWith([
                ask('Draft an answer from what you found.', 'the evidence points one way'),
                confirm('confirmed.'),
                ask('Draft an answer from what you found.', 'on reflection the sources disagree here'),
                confirm('yes, that is correct now.'),
            ]),
        );
        expect(verdict.kind).toBe('clear');
    });

    test('on alternating workers whose replies bring new information', () => {
        const check = (page: number) =>
            toChecker(
                `Read the source "Scott Derrickson" and confirm its key facts.`,
                `Page ${page} says film ${page * 7}.`,
            );
        const verdict = detect(supervisorWith([researchDerrickson, check(1), researchDerrickson, check(2)]));
        expect(verdict.kind).toBe('clear');
    });
});

describe('detectDelegationPingPong is not applicable', () => {
    test('to a run without delegations', () => {
        expect(detect(supervisorWith([])).kind).toBe('not-applicable');
    });
});

describe('detectDelegationPingPong under threshold overrides', () => {
    test('a bounce length override below one round never yields a negative severity', () => {
        const check = toChecker('Read the source "Scott Derrickson" and confirm its key facts.', derricksonFacts);
        const verdict = delegationPingPongEntryDetect(supervisorWith([researchDerrickson, check]));
        expect(verdict).toMatchObject({ kind: 'fired', severity: 0 });
    });
});
