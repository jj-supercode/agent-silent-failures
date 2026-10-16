import { severityIdSchema, variationIdSchema } from '../../src/catalog/index.ts';
import { ignoredWorkerResultEntryId, toolLoopEntryId } from '../../src/entries/index.ts';

/** The catalog ids the live-run lessons quote, defined once so a renamed variation or severity fails loudly. */
export const searchOutage = variationIdSchema.parse('search-outage');
export const multiAgentSearchOutage = variationIdSchema.parse('multi-agent-search-outage');
export const multiAgentBaseline = variationIdSchema.parse('multi-agent-baseline');
/** The clean variations of the `parallel-retry` hard negative are named `parallel-retry/<severity>`. */
export const parallelRetryPrefix = 'parallel-retry/';
export const retryBeyondBudgetSeverity = severityIdSchema.parse('retry-failing-5');

/** The entries whose rules the live run changed: their scripted catch rates are compared before and after. */
export const changedEntries = [toolLoopEntryId, ignoredWorkerResultEntryId] as const;
