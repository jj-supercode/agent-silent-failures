import { z } from 'zod';

import { charCountSchema, chunkCountSchema, ingestionReportSchema, toolNameSchema } from './model.ts';

/**
 * The fields of each stored span payload that views read: the single definition both the view decoders and the
 * fixture recorder use. zod strips unknown keys, so each schema is also the recorder's allowlist for that payload; a
 * field a decoder starts reading is therefore kept in recorded traces by construction.
 */
export const spanPayloadSchemas = {
    agentRun: {
        /** Mastra 1.77 records no step budget; other frameworks may (see `AgentRun.maxSteps`). */
        attributes: z.object({ maxSteps: z.int().positive().optional() }),
        output: z.object({ text: z.string() }),
    },
    toolCall: {
        /** A thrown tool keeps its error name and message; the stack carries local paths and is never read. */
        error: z.object({ name: z.string().optional(), message: z.string() }),
    },
    /** A tool call named `agent-<key>`: Mastra's sub-agent tool. Its whole input and output are kept on record. */
    delegation: {
        input: z.object({ prompt: z.string() }),
        output: z.object({
            text: z.string(),
            subAgentToolResults: z
                .array(z.object({ toolName: toolNameSchema, args: z.unknown(), result: z.unknown() }))
                .optional()
                .transform((results) => results ?? []),
        }),
        /** Present when the sub-agent ran but its own spans were not exported. */
        subAgentOutput: z.object({ subAgentThreadId: z.string() }),
    },
    ragIngestion: {
        output: ingestionReportSchema,
    },
    ragAction: {
        attributes: z.object({
            action: z.literal('chunk'),
            strategy: z.string().optional(),
            chunkSize: charCountSchema.optional(),
            chunkOverlap: charCountSchema.optional(),
        }),
        output: z.object({ chunkCount: chunkCountSchema }),
    },
} as const;
