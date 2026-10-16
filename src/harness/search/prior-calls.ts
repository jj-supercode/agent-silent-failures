import { z } from 'zod';

const toolInvocationPartSchema = z.object({
    type: z.literal('tool-invocation'),
    toolInvocation: z.object({ toolName: z.string(), state: z.string() }),
});
const messageSchema = z.object({ content: z.object({ parts: z.array(z.unknown()).optional() }) });

type ToolInvocation = z.infer<typeof toolInvocationPartSchema>['toolInvocation'];

const invocationsOf = (messages: readonly unknown[], toolName: string): readonly ToolInvocation[] =>
    messages
        .flatMap((message) => messageSchema.safeParse(message).data?.content.parts ?? [])
        .flatMap((part) => toolInvocationPartSchema.safeParse(part).data?.toolInvocation ?? [])
        .filter((invocation) => invocation.toolName === toolName);

/**
 * Counts completed calls to `toolName` in the run's own message history (Mastra's `getMessages()` in the tool
 * context). Derived from the conversation rather than a counter, so it holds for scripted and live models alike.
 */
export const countCompletedToolCalls = (messages: readonly unknown[], toolName: string): number =>
    invocationsOf(messages, toolName).filter((invocation) => invocation.state === 'result').length;
