import {
    cleanSupervisorPolicy,
    createMultiAgentPolicy,
    defineFault,
    delegationExchanges,
    parseTaskMessage,
    priorClaim,
    promptSubject,
    researcherToolName,
    synthesiseAnswer,
    withModel,
    type AgentPolicy,
    type HarnessConfig,
} from '../../harness/index.ts';

/** Delegates exactly like the clean supervisor; only the final answer is rewritten by `answer`. */
const rewritingAnswer =
    (answer: AgentPolicy): AgentPolicy =>
    (conversation, draw) => {
        const turn = cleanSupervisorPolicy(conversation, draw);
        return turn.kind === 'answer' ? answer(conversation, draw) : turn;
    };

/** Answers with a claim from the prior about the first subject; every worker reply is ignored. */
const answerFromPrior: AgentPolicy = (conversation, draw) => {
    const brief = parseTaskMessage(conversation.question);
    return {
        kind: 'answer',
        text: brief === null ? synthesiseAnswer([], draw) : priorClaim(brief.subjects[0], draw),
    };
};

/** Uses the research on the first subject and replaces everything about the second with a claim from the prior. */
const overrideSecondSubject: AgentPolicy = (conversation, draw) => {
    const brief = parseTaskMessage(conversation.question);
    if (brief === null) {
        return { kind: 'answer', text: synthesiseAnswer(delegationExchanges(conversation), draw) };
    }
    const [kept, overridden] = brief.subjects;
    const keptResearch = delegationExchanges(conversation).filter(
        (exchange) =>
            exchange.toolName === researcherToolName && promptSubject(exchange.prompt, brief.subjects) === kept,
    );
    return { kind: 'answer', text: `${synthesiseAnswer(keptResearch, draw)} ${priorClaim(overridden, draw)}` };
};

const severities = ['answer-from-prior', 'override-one-worker'] as const;

const answerFor = (severity: (typeof severities)[number]): AgentPolicy => {
    switch (severity) {
        case 'answer-from-prior':
            return answerFromPrior;
        case 'override-one-worker':
            return overrideSecondSubject;
        default:
            return severity satisfies never;
    }
};

const apply = (config: HarnessConfig, severity: (typeof severities)[number]): HarnessConfig =>
    withModel(config, {
        kind: 'scripted',
        policy: createMultiAgentPolicy({ supervisor: rewritingAnswer(answerFor(severity)) }),
    });

/**
 * The supervisor delegates normally, then answers from its prior: entirely, or for the second subject only.
 * The claims name places and years the corpus does not hold. Runs on `createMultiAgentHarness`.
 */
export const supervisorIgnoresWorkersFault = defineFault({
    id: 'supervisor-ignores-workers',
    description: 'The supervisor answers from its own prior instead of the facts its workers returned.',
    severities,
    apply,
});
