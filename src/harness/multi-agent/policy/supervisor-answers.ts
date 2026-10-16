import { isAbstention } from '../../../text/abstention.ts';
import { leadSentence } from '../../policy/lead-sentence.ts';
import { abstentionAnswer } from '../../policy/answer-from-hits.ts';
import type { Draw } from '../../policy/model.ts';
import { pickWithDraw } from '../../policy/seeded-draw.ts';
import type { DelegationExchange } from './delegation-exchanges.ts';

type AnswerTemplate = (replies: readonly string[]) => string;

/** How the clean supervisor synthesises: every reply in full, or the lead sentence of each. */
const answerTemplates: readonly [AnswerTemplate, ...AnswerTemplate[]] = [
    (replies) => replies.join(' '),
    (replies) => replies.map(leadSentence).join(' '),
];

/** A reply worth building on: not empty and not an abstention. */
export const isUsableReply = (exchange: DelegationExchange): boolean =>
    exchange.replyText.trim().length > 0 && !isAbstention(exchange.replyText);

/** Answers from the usable replies only; with none, the supervisor abstains like its workers. */
export const synthesiseAnswer = (exchanges: readonly DelegationExchange[], draw: Draw): string => {
    const usableReplies = exchanges.filter(isUsableReply).map((exchange) => exchange.replyText.trim());
    return usableReplies.length === 0
        ? abstentionAnswer
        : pickWithDraw(answerTemplates, draw('answer-template'))(usableReplies);
};
