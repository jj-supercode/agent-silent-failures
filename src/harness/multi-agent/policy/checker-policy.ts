import { abstentionAnswer } from '../../policy/answer-from-hits.ts';
import type { AgentPolicy, PolicyTurn } from '../../policy/model.ts';
import { checkedSubject } from '../delegation-prompts.ts';
import { readSourceToolId, sourcePageSchema } from '../read-source-tool.ts';

/** The checker reads at most this many pages of a source, so a long source never exhausts its step budget. */
export const maxCheckedPages = 3;

/**
 * The clean checker: reads the requested source page by page (the same tool, only `page` changing: a legitimate
 * repeated call) until it ends or the page cap, then reports what it read. An unknown source ends the reading.
 */
export const checkerPolicy: AgentPolicy = (conversation) => {
    const subject = checkedSubject(conversation.question);
    if (subject === null) {
        return { kind: 'answer', text: abstentionAnswer };
    }
    const pages = conversation.exchanges
        .filter((exchange) => exchange.toolName === readSourceToolId)
        .flatMap((exchange) => sourcePageSchema.safeParse(exchange.output).data ?? []);
    const lastPage = pages.at(-1);
    const readMore: PolicyTurn = {
        kind: 'call-tool',
        toolName: readSourceToolId,
        args: { sourceId: subject, page: pages.length + 1 },
    };
    if (conversation.exchanges.length === 0 || (lastPage?.hasMore === true && pages.length < maxCheckedPages)) {
        return readMore;
    }
    return pages.length === 0
        ? { kind: 'answer', text: abstentionAnswer }
        : { kind: 'answer', text: pages.map((page) => page.text).join(' ') };
};
