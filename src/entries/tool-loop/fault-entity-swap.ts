import {
    defineFault,
    searchCorpusHitsSchema,
    searchTurn,
    withModel,
    type AgentPolicy,
    type ToolExchange,
} from '../../harness/index.ts';
import { stopwords } from '../../text/stopwords.ts';
import { answerFromSearchOutput } from './fault.ts';

/** Runs of capitalised words: "Lake Louisvilla", "Kentucky", "Ed Wood". */
const capitalisedRuns = /\p{Lu}[\p{L}\p{N}'.-]*(?:\s+\p{Lu}[\p{L}\p{N}'.-]*)*/gu;

const opensSentence = (question: string, index: number): boolean => /(?:^|[.?!:]\s*)$/.test(question.slice(0, index));

/**
 * A capitalised run as a name: leading function words dropped ("Were Scott Derrickson" is "Scott Derrickson"), and
 * a single word that only opens a sentence ("Find passages about: ...") is no name at all.
 */
const asName = (question: string, match: RegExpExecArray): string => {
    const words = match[0].split(/\s+/);
    const firstNameWord = words.findIndex((word) => !stopwords.has(word.toLowerCase()));
    const name = firstNameWord === -1 ? [] : words.slice(firstNameWord);
    return name.length === 1 && firstNameWord === 0 && opensSentence(question, match.index) ? '' : name.join(' ');
};

/** The question's first name, if it names anything (a lower-cased question names nothing). */
const firstNamedEntity = (question: string): string | undefined =>
    Array.from(question.matchAll(capitalisedRuns), (match) => asName(question, match)).find((name) => name.length > 0);

/** A source title as a name: "John Bowman (pioneer)" and "Oldham County, Kentucky" become "John Bowman", "Oldham County". */
const titleAsName = (sourceId: string): string =>
    sourceId
        .replace(/\s*\(.*\)$/, '')
        .split(',')[0]
        ?.trim() ?? sourceId;

/** Distinct names of the sources the first search returned that the question does not already name. */
const otherCandidates = (exchanges: readonly ToolExchange[], question: string): readonly string[] => {
    const firstHits = searchCorpusHitsSchema.safeParse(exchanges[0]?.output).data?.hits ?? [];
    return [...new Set(firstHits.map((hit) => titleAsName(hit.sourceId)))].filter(
        (name) => !question.toLowerCase().includes(name.toLowerCase()),
    );
};

const checkedCandidates = 2;

/**
 * Searches the question, then the same question once per other candidate the first search surfaced, with that
 * candidate's name in place of the question's entity. Three near-identical calls that differ in the entity they
 * ask about: a decomposing agent's normal work, which the detector must not call a loop.
 */
const entitySwappingPolicy: AgentPolicy = ({ question, exchanges }) => {
    if (exchanges.length === 0) {
        return searchTurn(question);
    }
    const entity = firstNamedEntity(question);
    const candidate = entity === undefined ? undefined : otherCandidates(exchanges, question)[exchanges.length - 1];
    return exchanges.length <= checkedCandidates && entity !== undefined && candidate !== undefined
        ? searchTurn(question.replace(entity, candidate))
        : answerFromSearchOutput(exchanges[0]?.output);
};

/** A hard negative for tool-loop: three searches that differ only in the entity they name must stay clear. */
export const entitySwapHardNegative = defineFault({
    id: 'entity-swap',
    description:
        "The agent re-runs the question once per candidate source it found, swapping in that candidate's name: " +
        'near-identical calls about different entities, which must stay clear.',
    severities: ['entity-swap-3'],
    apply: (config) => withModel(config, { kind: 'scripted', policy: entitySwappingPolicy }),
});
