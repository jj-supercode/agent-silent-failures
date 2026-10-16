import {
    checkerToolName,
    checkPrompt,
    createMultiAgentPolicy,
    defineFault,
    delegate,
    delegationExchanges,
    parseTaskMessage,
    researcherToolName,
    researchPromptTemplates,
    reworded,
    synthesiseAnswer,
    withModel,
    type AgentPolicy,
    type Conversation,
    type HarnessConfig,
} from '../../harness/index.ts';

type FirstSubjectPrompts = { readonly research: string; readonly check: string };

/** The research and check requests about the task's first subject; without a task brief, the message itself. */
const firstSubjectPrompts = (conversation: Conversation): FirstSubjectPrompts => {
    const subject = parseTaskMessage(conversation.question)?.subjects[0];
    return subject === undefined
        ? { research: conversation.question, check: conversation.question }
        : { research: researchPromptTemplates[0](subject, conversation.question), check: checkPrompt(subject) };
};

/** Sends the first subject's research task `times` times, alternating two wordings, ignoring every reply. */
const redelegatingSupervisor =
    (times: number): AgentPolicy =>
    (conversation, draw) => {
        const exchanges = delegationExchanges(conversation);
        return exchanges.length < times
            ? delegate(researcherToolName, reworded(firstSubjectPrompts(conversation).research, exchanges.length))
            : { kind: 'answer', text: synthesiseAnswer(exchanges.slice(-1), draw) };
    };

/** Researcher, checker, researcher, checker ... with unchanged prompts for `rounds` rounds, then an answer. */
const bouncingSupervisor =
    (rounds: number): AgentPolicy =>
    (conversation, draw) => {
        const exchanges = delegationExchanges(conversation);
        if (exchanges.length >= rounds * 2) {
            return { kind: 'answer', text: synthesiseAnswer(exchanges.slice(-2), draw) };
        }
        const prompts = firstSubjectPrompts(conversation);
        return exchanges.length % 2 === 0
            ? delegate(researcherToolName, prompts.research)
            : delegate(checkerToolName, prompts.check);
    };

const severities = ['redelegate-3', 'redelegate-4', 'redelegate-6', 'bounce-2-rounds'] as const;

const supervisorFor = (severity: (typeof severities)[number]): AgentPolicy => {
    switch (severity) {
        case 'redelegate-3':
            return redelegatingSupervisor(3);
        case 'redelegate-4':
            return redelegatingSupervisor(4);
        case 'redelegate-6':
            return redelegatingSupervisor(6);
        case 'bounce-2-rounds':
            return bouncingSupervisor(2);
        default:
            return severity satisfies never;
    }
};

const apply = (config: HarnessConfig, severity: (typeof severities)[number]): HarnessConfig =>
    withModel(config, { kind: 'scripted', policy: createMultiAgentPolicy({ supervisor: supervisorFor(severity) }) });

/**
 * The supervisor ignores returned work: it re-sends the same research task, or bounces the same subject between
 * researcher and checker. Workers stay clean. Runs on `createMultiAgentHarness`.
 */
export const supervisorNoAckFault = defineFault({
    id: 'supervisor-no-ack',
    description: 'The supervisor re-sends a task it already got an answer for, or bounces it between two workers.',
    severities,
    apply,
});
