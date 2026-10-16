import { abstentionAnswer } from './policy/answer-from-hits.ts';
import { searchCorpusToolId } from './search/search-corpus-tool.ts';

/** The RAG agent's clean instructions: answer only from the passages, cite them, abstain when they fall short. */
export const ragAgentInstructions = [
    `Answer the question using only passages returned by the ${searchCorpusToolId} tool.`,
    'Cite every passage you use with its label in square brackets, for example [S1].',
    `If the passages do not contain the answer, reply exactly: ${abstentionAnswer}`,
].join('\n');
