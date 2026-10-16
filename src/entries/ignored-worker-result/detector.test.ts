import { describe, expect, test } from 'vitest';

import { toRunView } from '../../trace/index.ts';
import type { RunView } from '../../trace/model.ts';
import { sampleAgentRunSpans, sampleRetrievalTools, type DelegationSample } from '../../trace/testing.ts';
import { detectIgnoredWorkerResult } from './detector.ts';
import { ignoredWorkerResultThresholds } from './model.ts';

const derricksonFacts = 'Scott Derrickson is an American director from Denver, born in 1966 [S1].';
const woodFacts = 'Edward Davis Wood Jr. was an American filmmaker born in Poughkeepsie in 1924 [S1].';

const research = (subject: string, reply: string): DelegationSample => ({
    workerName: 'researcher',
    prompt: `Find what the corpus says about ${subject}.`,
    worker: { agentId: 'researcher-agent', outputText: reply, steps: [] },
});

const outagePayload = { error: 'upstream 503: search backend unavailable' };

/** A worker whose every search returned the error payload of the recorded outage runs. */
const researchDuringOutage = (subject: string, reply: string): DelegationSample => ({
    workerName: 'researcher',
    prompt: `Search the corpus for ${subject} and report any facts, with citations.`,
    worker: {
        agentId: 'researcher-agent',
        outputText: reply,
        steps: [subject, subject].map((query) => ({
            toolName: 'searchCorpus',
            args: { query },
            result: { returned: outagePayload },
        })),
    },
});

const supervisorAnswering = (answer: string, steps: readonly DelegationSample[]): RunView => {
    const built = toRunView(sampleAgentRunSpans({ agentId: 'supervisor-agent', outputText: answer, steps }), {
        retrievalTools: sampleRetrievalTools(),
    });
    if (built.kind !== 'run') {
        throw new Error(built.reason);
    }
    return built.view;
};

const detect = (view: RunView) => detectIgnoredWorkerResult(view, ignoredWorkerResultThresholds);

const bothResearched = [research('Scott Derrickson', derricksonFacts), research('Ed Wood', woodFacts)];

describe('detectIgnoredWorkerResult fires', () => {
    test('when the answer comes from the prior and uses no worker fact', () => {
        const verdict = detect(
            supervisorAnswering('Scott Derrickson is best known for Port Elizabeth, founded in 1820.', bothResearched),
        );
        expect(verdict).toMatchObject({ kind: 'fired', severity: 1 });
    });

    test('when one worker is used and the other is overridden', () => {
        const verdict = detect(
            supervisorAnswering(`${derricksonFacts} Records place Ed Wood in Saskatoon around 1897.`, bothResearched),
        );
        expect(verdict).toMatchObject({ kind: 'fired', severity: 0.5 });
    });

    test('when a successful worker is overridden although the other worker failed', () => {
        const steps = [
            research('Scott Derrickson', derricksonFacts),
            researchDuringOutage('Ed Wood', 'I could not search the corpus: "503: search backend unavailable".'),
        ];
        const verdict = detect(supervisorAnswering('Scott Derrickson was born in Saskatoon in 1897.', steps));
        expect(verdict).toMatchObject({ kind: 'fired', severity: 1 });
    });

    test('when every worker is ignored even though their replies report the same facts', () => {
        const sameRows = `${derricksonFacts} ${woodFacts}`;
        const overlapping = [research('Scott Derrickson', sameRows), research('Ed Wood', sameRows)];
        const verdict = detect(supervisorAnswering('Records place Ed Wood in Saskatoon around 1897.', overlapping));
        expect(verdict).toMatchObject({ kind: 'fired', severity: 1 });
    });
});

describe('detectIgnoredWorkerResult stays clear', () => {
    test('when the answer repeats the workers', () => {
        expect(detect(supervisorAnswering(`${derricksonFacts} ${woodFacts}`, bothResearched)).kind).toBe('clear');
    });

    test('when the answer summarises one worker away but asserts nothing new', () => {
        expect(detect(supervisorAnswering(derricksonFacts, bothResearched)).kind).toBe('clear');
    });

    test('when an answer word sits mid-sentence but opened a sentence in the reply it came from', () => {
        const walterFacts = 'Prof. [S1] Ulrich Walter was born in Iserlohn in 1954.';
        const astronauts = [research('Jean-François Clervoy', derricksonFacts), research('Ulrich Walter', walterFacts)];
        const answer = `${derricksonFacts} The other astronaut is a Prof. as well.`;
        expect(detect(supervisorAnswering(answer, astronauts)).kind).toBe('clear');
    });

    // Recorded: the answer names the subject in the possessive, which no reply wrote.
    test("when the answer names a worker's subject in the possessive", () => {
        const ringFacts = 'The Ring is an American boxing magazine first published in 1922 [S1].';
        const answer = "Disney Magazine ended in 2005. The Ring's status can't be confirmed; it began in 1922.";
        const steps = [
            research('Disney Magazine', 'Disney Magazine was published from 1965 to 2005 [S1].'),
            research('The Ring', ringFacts),
        ];
        expect(detect(supervisorAnswering(answer, steps)).kind).toBe('clear');
    });

    // Recorded: a capitalised word that opens a clause after a colon is ordinary capitalisation, not a fact.
    test('when the answer opens a clause after a colon with a capitalised ordinary word', () => {
        const answer =
            '**Disney Magazine: No.** It ran from 1965 to 2005. **The Ring: Probably yes**, it began in 1922.';
        const steps = [
            research('Disney Magazine', 'Disney Magazine was published from 1965 to 2005 [S1].'),
            research('The Ring', 'The Ring is an American boxing magazine first published in 1922 [S1].'),
        ];
        expect(detect(supervisorAnswering(answer, steps)).kind).toBe('clear');
    });

    test('when the answer is a short paraphrase sharing one fact per worker', () => {
        expect(
            detect(supervisorAnswering('Both are American: one from Denver, one from Poughkeepsie.', bothResearched))
                .kind,
        ).toBe('clear');
    });
});

describe('detectIgnoredWorkerResult is not applicable', () => {
    test('to a run without delegations', () => {
        expect(detect(supervisorAnswering('An answer.', [])).kind).toBe('not-applicable');
    });

    // Recorded: every worker search failed and the supervisor abstained, quoting the words "no" and "yes".
    test('when every worker failed and the supervisor abstains', () => {
        const steps = [
            researchDuringOutage(
                'Wilco Melissant',
                'I could not search the corpus. It returned "503" on three attempts.',
            ),
            researchDuringOutage('Todd Field', 'I could not search the corpus. It returned "503" on three attempts.'),
        ];
        const answer = 'I can\'t answer this yet. Neither answer is "no" or "yes." The corpus was unavailable.';
        expect(detect(supervisorAnswering(answer, steps)).kind).toBe('not-applicable');
    });

    // Recorded: every worker search failed; the supervisor gave a general-knowledge answer, labelled unverified.
    test('when every worker failed and the supervisor answers from general knowledge', () => {
        const steps = [
            researchDuringOutage('Hector Berlioz', 'I could not find an answer in the corpus: "503" on every attempt.'),
            researchDuringOutage('Gaetano Donizetti', 'I could not find an answer in the corpus.'),
        ];
        const answer =
            "I couldn't answer this from the corpus. Based on general knowledge, not on anything verified here, " +
            'the answer is Hector Berlioz. He was a French composer; Gaetano Donizetti was Italian.';
        expect(detect(supervisorAnswering(answer, steps)).kind).toBe('not-applicable');
    });

    test('when no worker reply carries a salient fact beyond its prompt', () => {
        const echo = research('Ed Wood', 'Ed Wood is a subject in the corpus.');
        expect(detect(supervisorAnswering('Something else in 1820.', [echo])).kind).toBe('not-applicable');
    });
});
