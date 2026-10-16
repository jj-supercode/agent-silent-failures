import type { Mastra } from '@mastra/core/mastra';

import { traceIdSchema } from '../../trace/index.ts';
import type { ScenarioOutcome } from '../run-scenario.ts';
import { toRequestContext, type ScenarioContext } from '../scenario.ts';
import { awaitStoredTrace } from '../stored-trace.ts';
import { supervisorKey, type SupervisorTask } from './model.ts';
import { renderTaskMessage } from './task-message.ts';

export type TaskRequest = {
    readonly task: SupervisorTask;
    readonly seed: number;
};

/** Runs the supervisor on one task under a seeded scenario and returns once its trace is stored and readable. */
export const createTaskRunner =
    (mastra: Mastra) =>
    async ({ task, seed }: TaskRequest): Promise<ScenarioOutcome> => {
        const scenario: ScenarioContext = { questionId: task.questionId, seed };
        const result = await mastra
            .getAgent(supervisorKey)
            .generate(renderTaskMessage(task), { requestContext: toRequestContext(scenario) });
        const traceId = traceIdSchema.safeParse(result.traceId);
        if (!traceId.success) {
            return { kind: 'failed', scenario, reason: 'the supervisor run returned no trace id' };
        }
        return (await awaitStoredTrace(mastra, traceId.data))
            ? { kind: 'completed', run: { traceId: traceId.data, scenario, answerText: result.text } }
            : { kind: 'failed', scenario, reason: `trace ${traceId.data} never reached storage` };
    };
