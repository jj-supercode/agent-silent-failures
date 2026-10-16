import {
    answerFromHitsPolicy,
    pickWithDraw,
    searchCorpusHitsSchema,
    searchCorpusToolId,
    type AgentPolicy,
    type Conversation,
} from '../../harness/index.ts';
import { withoutQuestionMark } from '../../text/questions.ts';

/** Confident answers a model writes from its own memory; two cite a label that no returned row carries. */
const answersFromMemory: readonly [(question: string) => string, ...((question: string) => string)[]] = [
    (question) => `From what is known about it, ${withoutQuestionMark(question)}: yes [S1].`,
    () => 'The answer is the first one named in the question [S1].',
    (question) => `The commonly reported answer to "${withoutQuestionMark(question)}" is the earlier of the two.`,
];

const lastSearchCameBackEmpty = (conversation: Conversation): boolean => {
    const lastSearch = conversation.exchanges.filter((exchange) => exchange.toolName === searchCorpusToolId).at(-1);
    const rows = searchCorpusHitsSchema.safeParse(lastSearch?.output);
    return lastSearch !== undefined && !lastSearch.failed && rows.success && rows.data.hits.length === 0;
};

/**
 * The clean policy, except that after a search returns no rows it answers from memory instead of abstaining: the
 * behaviour "Sufficient Context" (arXiv 2411.06037) reports for models that do not abstain.
 */
export const answerFromMemoryOnEmptyPolicy: AgentPolicy = (conversation, draw) =>
    lastSearchCameBackEmpty(conversation)
        ? { kind: 'answer', text: pickWithDraw(answersFromMemory, draw('memory-answer'))(conversation.question) }
        : answerFromHitsPolicy(conversation, draw);
