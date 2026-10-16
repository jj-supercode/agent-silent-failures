// Imports the built package by its own name, as an npm consumer would: exports map, dist JS and .d.ts.
import assert from 'node:assert/strict';

import {
    createEntryScorer,
    createSwallowedToolErrorScorer,
    defineRunEntry,
    entryIdSchema,
    isAbstention,
    toolLoopEntry,
    type AnswerPhrasePattern,
    type Verdict,
} from 'agent-silent-failures';
import {
    decodeHitList,
    spanRecordListSchema,
    toRunView,
    toRunViews,
    toolNameSchema,
    type RunView,
} from 'agent-silent-failures/trace';
import { unitIntervalSchema } from 'agent-silent-failures/trace/model';

const retrievalTool = toolNameSchema.parse('searchCorpus');

const detect = (view: RunView): Verdict =>
    view.retrievals.length > 0
        ? { kind: 'fired', severity: unitIntervalSchema.parse(1), evidence: { spanIds: [], summary: 'retrieved' } }
        : { kind: 'clear', evidence: { summary: 'no retrieval' } };

const entry = defineRunEntry({
    id: entryIdSchema.parse('package-smoke'),
    title: 'Package smoke',
    summary: 'Checks the published surface.',
    family: 'rag',
    status: 'experimental',
    thresholds: {},
    runViewOptions: { retrievalTools: new Map([[retrievalTool, decodeHitList]]) },
    detect,
});

const startedAt = '2026-10-14T00:00:00.000Z';
const spans = spanRecordListSchema.parse([
    {
        traceId: 't',
        spanId: 'root',
        name: 'agent run',
        spanType: 'agent_run',
        entityId: 'agent',
        startedAt,
        output: { text: 'ok' },
    },
    {
        traceId: 't',
        spanId: 'call',
        parentSpanId: 'root',
        name: 'tool',
        spanType: 'tool_call',
        entityId: 'searchCorpus',
        startedAt,
        output: { hits: [] },
    },
]);
const mapped = toRunView(spans, entry.runViewOptions);

assert.equal(mapped.kind, 'run');
assert.equal(mapped.kind === 'run' && entry.detect(mapped.view).kind, 'fired');
assert.equal(createEntryScorer(entry).id, 'package-smoke');

// Threshold overrides are typed by the entry's own names.
assert.equal(createEntryScorer(toolLoopEntry, { thresholds: { MIN_REPEATS: 5 } }).id, 'tool-loop');
// @ts-expect-error MIN_REPEAT is not a tool-loop threshold
createEntryScorer(toolLoopEntry, { thresholds: { MIN_REPEAT: 5 } });

// An application's own failure wording reaches swallowed-tool-error from the package root.
const catalogueOffline: AnswerPhrasePattern = { name: 'catalogue offline', pattern: /\bcatalogue is offline\b/ };
assert.equal(
    createSwallowedToolErrorScorer({ extraAcknowledgementPatterns: [catalogueOffline] }).id,
    'swallowed-tool-error',
);
assert.equal(isAbstention("I wasn't able to find that in the documents."), true);

// An agent called from a workflow step is stored under a workflow_run root and still maps to a run view.
const workflowSpans = spanRecordListSchema.parse([
    { traceId: 'w', spanId: 'workflow', name: 'workflow', spanType: 'workflow_run', entityId: 'flow', startedAt },
    { traceId: 'w', spanId: 'step', parentSpanId: 'workflow', name: 'step', spanType: 'workflow_step', startedAt },
    {
        traceId: 'w',
        spanId: 'agent',
        parentSpanId: 'step',
        name: 'agent run',
        spanType: 'agent_run',
        entityId: 'agent',
        startedAt,
        output: { text: 'ok' },
    },
]);
const workflowViews = toRunViews(workflowSpans, entry.runViewOptions);
assert.equal(workflowViews.kind === 'runs' && workflowViews.views[0].rootAgentRun.agentId, 'agent');
console.log('package smoke: the built package imports, type-checks and runs');
