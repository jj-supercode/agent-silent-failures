import { withSearchOutputWrapper, type HarnessConfig } from '../config.ts';
import type { SearchCorpusOutput } from '../search/model.ts';

/**
 * Clean behaviour under infrastructure errors the clean policies handle correctly: hard negatives for the error and
 * loop entries. The payload is the same error-as-result shape a faulty backend returns.
 */
export const searchBackendErrorPayload = {
    error: 'upstream 503: search backend unavailable',
} as const satisfies SearchCorpusOutput;

/** The first search of every agent run fails; the clean policy retries once and succeeds. */
export const withTransientSearchError = (config: HarnessConfig): HarnessConfig =>
    withSearchOutputWrapper(config, (output, call) => (call.priorCalls === 0 ? searchBackendErrorPayload : output));

/** Every search fails; the clean policy retries once, then abstains, and the clean supervisor re-delegates once. */
export const withSearchOutage = (config: HarnessConfig): HarnessConfig =>
    withSearchOutputWrapper(config, () => searchBackendErrorPayload);
