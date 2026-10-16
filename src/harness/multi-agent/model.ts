import type { QuestionId } from '../../corpus/index.ts';
import { agentIdSchema, agentKeySchema, toolNameSchema, type SourceId } from '../../trace/index.ts';

export const supervisorKey = agentKeySchema.parse('supervisor');
export const supervisorId = agentIdSchema.parse('supervisor-agent');
export const researcherKey = agentKeySchema.parse('researcher');
export const researcherId = agentIdSchema.parse('researcher-agent');
export const checkerKey = agentKeySchema.parse('checker');
export const checkerId = agentIdSchema.parse('checker-agent');

/** Mastra offers a sub-agent registered under `<key>` to its supervisor as the tool `agent-<key>`. */
export const researcherToolName = toolNameSchema.parse(`agent-${researcherKey}`);
export const checkerToolName = toolNameSchema.parse(`agent-${checkerKey}`);

/**
 * One multi-agent task, derived from a corpus question and its two gold sources. Comparison and bridge questions
 * are handled alike: research both subjects, sometimes check the second one, answer.
 */
export type SupervisorTask = {
    readonly questionId: QuestionId;
    readonly question: string;
    readonly subjects: readonly [SourceId, SourceId];
};
