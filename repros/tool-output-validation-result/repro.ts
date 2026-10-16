// A tool whose return value fails its own `outputSchema` (here a NaN score)
// is handed back to the model as a normal tool result `{ error: true, message: 'Tool output validation failed...' }`.
// `generate()` does not throw and does not report a tool error. This is the documented `outputValidation: 'strict'`
// default; the repro records how visible it is: console, tool span status, and the result the caller gets.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { captureConsole, firstLines } from '../shared/console-capture.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { spansOfType } from '../shared/trace-queries.ts';
import { scriptedModel, textTurn, toolCallTurn } from '../shared/scripted-model.ts';

const validationErrorResultSchema = z.object({ error: z.literal(true), message: z.string() });

const scoreDocument = createTool({
    id: 'scoreDocument',
    description: 'Scores a document',
    inputSchema: z.object({ documentId: z.string() }),
    outputSchema: z.object({ documentId: z.string(), score: z.number() }),
    execute: ({ documentId }) => Promise.resolve({ documentId, score: Number.NaN }),
});

const grader = new Agent({
    id: 'grader',
    name: 'grader',
    instructions: 'Score the document.',
    model: scriptedModel('grader-model', [
        toolCallTurn('call-1', 'scoreDocument', { documentId: 'doc-a' }),
        textTurn('The document scored well.'),
    ]),
    tools: { scoreDocument },
});

const { storage, observability } = observedStorage({ serviceName: 'repro-tool-output-validation' });
const mastra = new Mastra({ agents: { grader }, storage, observability });

const run = async () => {
    using output = captureConsole();
    const result = await mastra.getAgent('grader').generate('Score doc-a', { maxSteps: 3 });
    return { result, consoleLines: firstLines(output) };
};
const { result, consoleLines } = await run();
await flushTraces(mastra);

const trace = await requireStoredTrace(mastra, requireTraceId(result));
const [toolSpan] = spansOfType(trace, SpanType.TOOL_CALL);
const toolResultPayloads = result.toolResults.map((toolResult) => toolResult.payload.result);
const modelSawValidationError = toolResultPayloads.some(
    (payload) => validationErrorResultSchema.safeParse(payload).success,
);

await reportOutcome(
    'tool-output-validation-result',
    outcomeWhen(
        modelSawValidationError && result.text.length > 0,
        `tool output failing outputSchema reached the model as a tool result; generate() returned text ` +
            `"${result.text}" and ${consoleLines.length} console lines`,
        {
            finalText: result.text,
            finishReason: result.finishReason,
            toolResultPayloads,
            consoleLines,
            toolSpan: {
                errorInfo: toolSpan?.error ?? null,
                attributes: toolSpan?.attributes ?? null,
                output: toolSpan?.output ?? null,
            },
        },
    ),
);
