// Agent, model and tool spans store a snapshot of the whole RequestContext, even with
// no `requestContextKeys` configured. The default sensitive-data filter redacts values only by key name, so a value
// under an innocuous key (an email, a connection string with a password) is persisted to trace storage verbatim.
// All values below are synthetic.
import { RequestContext } from '@mastra/core/request-context';
import { Mastra } from '@mastra/core/mastra';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { searchAgent } from '../shared/search-agent.ts';

const syntheticContext = {
    apiKey: 'synthetic-api-key-123',
    customerEmail: 'reader@example.com',
    tenantDatabaseUrl: 'postgres://app:synthetic-password@db.example.com/tenant',
} as const;

const requestContext = new RequestContext(Object.entries(syntheticContext));

const { storage, observability } = observedStorage({ serviceName: 'repro-request-context' });
const mastra = new Mastra({ agents: { researcher: searchAgent('researcher') }, storage, observability });

const result = await mastra.getAgent('researcher').generate('What did canaries do?', { maxSteps: 5, requestContext });
await flushTraces(mastra);
const { spans } = await requireStoredTrace(mastra, requireTraceId(result));

const spansWithContext = spans.filter((span) => span.requestContext !== null && span.requestContext !== undefined);
const storedSnapshot = spansWithContext[0]?.requestContext ?? {};
const storedVerbatim = Object.entries(syntheticContext)
    .filter(([key, value]) => storedSnapshot[key] === value)
    .map(([key]) => key);

await reportOutcome(
    'request-context-on-spans',
    outcomeWhen(
        spansWithContext.length > 0 && storedVerbatim.length > 0,
        `${spansWithContext.length}/${spans.length} stored spans carry the RequestContext; keys stored verbatim ` +
            `despite the default sensitive-data filter: ${storedVerbatim.join(', ')}`,
        {
            requestContextKeysConfigured: [],
            spanTypesCarryingContext: [...new Set(spansWithContext.map((span) => span.spanType))],
            storedSnapshotOnFirstSpan: storedSnapshot,
            storedVerbatim,
        },
    ),
);
