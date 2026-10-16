import {
    composeAnswer,
    defineFault,
    searchBackendErrorPayload,
    searchCorpusHitsSchema,
    searchTurn,
    withModel,
    withSearchOutputWrapper,
    type AgentPolicy,
    type HarnessConfig,
    type PolicyTurn,
} from '../../harness/index.ts';
import { withoutQuestionMark } from '../../text/questions.ts';

type QueryNoise = (query: string) => string;

/** Formatting noise a model adds when it re-issues a call: case, spacing, punctuation. Never a new term. */
const queryNoise: readonly [QueryNoise, ...QueryNoise[]] = [
    (query) => query,
    (query) => query.toLowerCase(),
    (query) => withoutQuestionMark(query).replaceAll(' ', '  '),
    (query) => query.toUpperCase(),
];

const noisy = (query: string, attempt: number): string =>
    (queryNoise[attempt % queryNoise.length] ?? queryNoise[0])(query);

/** The second half of the question first: the same terms in another order. */
const reordered = (question: string): string => {
    const words = withoutQuestionMark(question).split(/\s+/);
    const middle = Math.ceil(words.length / 2);
    return [...words.slice(middle), ...words.slice(0, middle)].join(' ');
};

type Paraphrase = (question: string) => string;

/**
 * A re-issued search as a model rewords it: reordered, with one refinement term added that the first query did
 * not have. Each re-issue differs from the first query by exactly one term, so on a question of four or more
 * content terms it stays within `ARG_SIMILARITY` (0.8) of it, and on shorter questions it is a known miss.
 */
const paraphrases: readonly [Paraphrase, ...Paraphrase[]] = [
    (question) => question,
    (question) => `${reordered(question)} details`,
    (question) => `exact ${withoutQuestionMark(question)}`,
];

const reworded = (question: string, attempt: number): string =>
    (paraphrases[attempt % paraphrases.length] ?? paraphrases[0])(question);

/** An answer composed from the rows of one search's output; no rows give the abstention. */
export const answerFromSearchOutput = (output: unknown): PolicyTurn => ({
    kind: 'answer',
    text: composeAnswer(searchCorpusHitsSchema.safeParse(output).data?.hits ?? []),
});

/** Searches `repeats` times with `queryFor(question, attempt)`, then answers from the last rows. */
const repeatingSearchPolicy =
    (repeats: number, queryFor: (question: string, attempt: number) => string): AgentPolicy =>
    ({ question, exchanges }) => {
        const last = exchanges.at(-1);
        return exchanges.length < repeats || last === undefined
            ? searchTurn(queryFor(question, exchanges.length))
            : answerFromSearchOutput(last.output);
    };

/** The question split into its first and second half: two different searches. */
export const questionHalves = (question: string): readonly [string, string] => {
    const words = question.split(/\s+/);
    return [words.slice(0, words.length / 2).join(' '), words.slice(words.length / 2).join(' ')];
};

/** Two different halves of the question, searched alternately: A, B, A, B, then an answer. */
const alternatingSearchPolicy =
    (cycles: number): AgentPolicy =>
    ({ question, exchanges }) => {
        const halves = questionHalves(question);
        const last = exchanges.at(-1);
        return exchanges.length < cycles * 2 || last === undefined
            ? searchTurn(halves[exchanges.length % 2] ?? question)
            : answerFromSearchOutput(last.output);
    };

const severities = [
    'repeat-3',
    'repeat-5',
    'repeat-until-step-budget',
    'alternate-2-cycles',
    'paraphrase-3',
    'retry-failing-5',
] as const;

type Severity = (typeof severities)[number];

/** Retries of a failed call beyond the retry budget: five attempts are the first try, two retries and two more. */
const failingAttempts = 5;

const policyFor = (severity: Severity, config: HarnessConfig): AgentPolicy => {
    switch (severity) {
        case 'repeat-3':
            return repeatingSearchPolicy(3, noisy);
        case 'repeat-5':
            return repeatingSearchPolicy(5, noisy);
        case 'repeat-until-step-budget':
            return repeatingSearchPolicy(config.settings.agent.maxSteps, noisy);
        case 'alternate-2-cycles':
            return alternatingSearchPolicy(2);
        case 'paraphrase-3':
            return repeatingSearchPolicy(3, reworded);
        case 'retry-failing-5':
            return repeatingSearchPolicy(failingAttempts, noisy);
        default:
            return severity satisfies never;
    }
};

/** `retry-failing-5` loops on a search that always fails; every other severity loops on searches that succeed. */
const withSearchFailures = (severity: Severity, config: HarnessConfig): HarnessConfig =>
    severity === 'retry-failing-5' ? withSearchOutputWrapper(config, () => searchBackendErrorPayload) : config;

/**
 * The single-agent model re-issues its search instead of answering: the same question with formatting noise, the
 * question reworded with one added term per re-issue, or two queries in alternation, while every call succeeds; or
 * the same search five times against a backend that always fails, past any retry budget. Runs on `createHarness`.
 */
export const repeatedSearchFault = defineFault({
    id: 'repeated-search',
    description:
        'The agent re-issues the same search (formatting noise, or reworded with one added term), alternates two ' +
        'searches instead of answering, or keeps re-issuing a search that always fails.',
    severities,
    apply: (config, severity) =>
        withModel(withSearchFailures(severity, config), { kind: 'scripted', policy: policyFor(severity, config) }),
});
