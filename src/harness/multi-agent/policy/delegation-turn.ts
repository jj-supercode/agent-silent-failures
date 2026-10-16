import type { ToolName } from '../../../trace/index.ts';
import type { PolicyTurn } from '../../policy/model.ts';

/** The model turn that hands `prompt` to the sub-agent Mastra offers as the tool `toolName`. */
export const delegate = (toolName: ToolName, prompt: string): PolicyTurn => ({
    kind: 'call-tool',
    toolName,
    args: { prompt },
});
