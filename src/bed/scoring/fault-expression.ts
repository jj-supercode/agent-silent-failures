import { catalog, type FaultCase } from '../../catalog/index.ts';
import type { ObservedIngestion } from '../../harness/index.ts';
import type { FaultExpressionStatus, RunCondition, ScoredCondition } from '../model.ts';

const faultCaseOf = (condition: Extract<RunCondition, { readonly kind: 'faulted' }>): FaultCase | undefined =>
    catalog
        .flatMap((item) => item.faultCases)
        .find((faultCase) => faultCase.faultId === condition.faultId && faultCase.severity === condition.severity);

/** Whether the fault took effect, read from the observed ingestion (store and embedder) where the catalog says to. */
export const faultExpressionOf = (
    condition: Extract<RunCondition, { readonly kind: 'faulted' }>,
    observed: ObservedIngestion | null,
): FaultExpressionStatus => {
    const expression = faultCaseOf(condition)?.expression;
    if (expression === undefined) {
        return 'unknown';
    }
    switch (expression.kind) {
        case 'always':
            return 'expressed';
        case 'ingestion':
            return observed === null ? 'unknown' : expression.isExpressed(observed) ? 'expressed' : 'not-expressed';
        default:
            return expression satisfies never;
    }
};

export const scoredCondition = (condition: RunCondition, observed: ObservedIngestion | null): ScoredCondition =>
    condition.kind === 'clean' ? condition : { ...condition, expression: faultExpressionOf(condition, observed) };
