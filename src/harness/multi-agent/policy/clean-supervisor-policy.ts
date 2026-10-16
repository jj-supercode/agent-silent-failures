import type { SourceId } from '../../../trace/index.ts';
import type { AgentPolicy, Draw, PolicyTurn } from '../../policy/model.ts';
import { pickWithDraw } from '../../policy/seeded-draw.ts';
import { checkPrompt, promptSubject, researchPromptTemplates, reworded } from '../delegation-prompts.ts';
import { checkerToolName, researcherToolName } from '../model.ts';
import { parseTaskMessage, type TaskBrief } from '../task-message.ts';
import { delegationExchanges, type DelegationExchange } from './delegation-exchanges.ts';
import { delegate } from './delegation-turn.ts';
import { isUsableReply, synthesiseAnswer } from './supervisor-answers.ts';

/** Share of tasks where the supervisor also has the checker read the second subject. */
export const checkShare = 0.5;

const researchOf = (exchanges: readonly DelegationExchange[], brief: TaskBrief, subject: SourceId) =>
    exchanges.filter(
        (exchange) =>
            exchange.toolName === researcherToolName && promptSubject(exchange.prompt, brief.subjects) === subject,
    );

/** A subject whose only research came back empty or abstaining gets one legitimate, reworded re-delegation. */
const retryTurn = (exchanges: readonly DelegationExchange[], brief: TaskBrief): PolicyTurn | null => {
    const failedOnce = brief.subjects
        .map((subject) => researchOf(exchanges, brief, subject))
        .find((attempts) => attempts.length === 1 && !attempts.some(isUsableReply));
    return failedOnce?.[0] === undefined ? null : delegate(researcherToolName, reworded(failedOnce[0].prompt, 1));
};

const researchTurn = (exchanges: readonly DelegationExchange[], brief: TaskBrief, draw: Draw): PolicyTurn | null => {
    const [first, second] = brief.subjects.filter((subject) => researchOf(exchanges, brief, subject).length === 0);
    if (first === undefined) {
        return null;
    }
    const subject = second === undefined ? first : pickWithDraw([first, second], draw('subject-order'));
    return delegate(
        researcherToolName,
        pickWithDraw(researchPromptTemplates, draw('research-prompt'))(subject, brief.question),
    );
};

/** Decided once, on the turn after both subjects are researched; afterwards a checker exchange exists or it answered. */
const checkTurn = (exchanges: readonly DelegationExchange[], brief: TaskBrief, draw: Draw): PolicyTurn | null =>
    exchanges.some((exchange) => exchange.toolName === checkerToolName) || draw('check') >= checkShare
        ? null
        : delegate(checkerToolName, checkPrompt(brief.subjects[1]));

const briefTurn = (exchanges: readonly DelegationExchange[], brief: TaskBrief, draw: Draw): PolicyTurn =>
    retryTurn(exchanges, brief) ??
    researchTurn(exchanges, brief, draw) ??
    checkTurn(exchanges, brief, draw) ?? { kind: 'answer', text: synthesiseAnswer(exchanges, draw) };

/** Without a task brief (e.g. a Studio chat message) the supervisor hands the whole message to the researcher once. */
const passThroughTurn = (exchanges: readonly DelegationExchange[], message: string, draw: Draw): PolicyTurn =>
    exchanges.length === 0
        ? delegate(researcherToolName, message)
        : { kind: 'answer', text: synthesiseAnswer(exchanges, draw) };

/**
 * The clean supervisor: researches each subject once in a seeded order and phrasing, re-delegates once when a
 * reply is empty or abstains, sometimes has the checker read the second subject, then answers from the replies.
 */
export const cleanSupervisorPolicy: AgentPolicy = (conversation, draw) => {
    const exchanges = delegationExchanges(conversation);
    const brief = parseTaskMessage(conversation.question);
    return brief === null ? passThroughTurn(exchanges, conversation.question, draw) : briefTurn(exchanges, brief, draw);
};
