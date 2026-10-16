import type {
    LanguageModelV4CallOptions,
    LanguageModelV4Middleware,
    LanguageModelV4StreamPart,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';

import { costOf, worstCaseCallCost } from './cost.ts';
import { billedTokenCountSchema, type BilledUsage, type BudgetKey, type CallLimits, type ModelPrice } from './model.ts';
import { estimatePromptTokens } from './prompt-size.ts';
import type { SpendLedger } from './session-ledger.ts';
import { reserveCall, settleCall, type RunBudgetScope } from './spend-ledger.ts';

export type BudgetGuardInput = {
    readonly ledger: SpendLedger;
    readonly price: ModelPrice;
    readonly limits: CallLimits;
    /** The run the current call belongs to, or `null` outside any run. */
    readonly currentRun: () => RunBudgetScope | null;
};

/** A missing provider count is charged at the limit: an unknown is never cheaper than the worst case. */
const billedUsage = (usage: LanguageModelV4Usage, limits: CallLimits): BilledUsage => ({
    inputTokens: billedTokenCountSchema.parse(usage.inputTokens.total ?? limits.maxPromptTokens),
    outputTokens: billedTokenCountSchema.parse(usage.outputTokens.total ?? limits.maxOutputTokens),
});

const limitedOutput = (params: LanguageModelV4CallOptions, limits: CallLimits): LanguageModelV4CallOptions => ({
    ...params,
    maxOutputTokens: Math.min(params.maxOutputTokens ?? limits.maxOutputTokens, limits.maxOutputTokens),
});

/**
 * An AI SDK middleware that holds every model call to the session budget: it caps the output tokens of each call,
 * refuses a call before it is sent when its worst case could cross a cap (or its run is over its call limit), and
 * charges the provider's reported usage afterwards. A failed or cancelled call stays charged at its worst case.
 */
export const budgetGuardMiddleware = ({
    ledger,
    price,
    limits,
    currentRun,
}: BudgetGuardInput): LanguageModelV4Middleware => {
    const worstCase = worstCaseCallCost(price, limits);
    /** Returns the run the call was reserved for; settling must charge that run even if the scope moved on. */
    const reserve = (params: LanguageModelV4CallOptions): BudgetKey => {
        const request = {
            run: currentRun(),
            promptTokens: estimatePromptTokens(params),
            maxPromptTokens: limits.maxPromptTokens,
            worstCase,
        };
        const result = reserveCall(ledger.read(), request, ledger.policy);
        ledger.update(() => result.state);
        if (result.kind === 'refused') {
            throw result.refusal;
        }
        return result.runKey;
    };
    const settle = (runKey: BudgetKey, usage: BilledUsage): void => {
        ledger.update((state) =>
            settleCall(state, {
                runKey,
                reservedWorstCase: worstCase,
                limits,
                charge: { modelId: price.modelId, usage, cost: costOf(usage, price) },
            }),
        );
    };
    const settleAtWorstCase = (runKey: BudgetKey): void =>
        settle(runKey, { inputTokens: limits.maxPromptTokens, outputTokens: limits.maxOutputTokens });
    const chargedAtWorstCaseOnFailure = async <T>(runKey: BudgetKey, call: () => PromiseLike<T>): Promise<T> => {
        try {
            return await call();
        } catch (error) {
            settleAtWorstCase(runKey);
            throw error;
        }
    };
    const settleOnFinish = (
        runKey: BudgetKey,
    ): TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart> => {
        let settled = false;
        return new TransformStream({
            transform: (part, controller) => {
                if (part.type === 'finish' && !settled) {
                    settled = true;
                    settle(runKey, billedUsage(part.usage, limits));
                }
                controller.enqueue(part);
            },
            flush: () => {
                if (!settled) {
                    settleAtWorstCase(runKey);
                }
            },
            cancel: () => {
                if (!settled) {
                    settled = true;
                    settleAtWorstCase(runKey);
                }
            },
        });
    };
    return {
        specificationVersion: 'v4',
        transformParams: ({ params }) => Promise.resolve(limitedOutput(params, limits)),
        wrapGenerate: async ({ doGenerate, params }) => {
            const runKey = reserve(params);
            const result = await chargedAtWorstCaseOnFailure(runKey, doGenerate);
            settle(runKey, billedUsage(result.usage, limits));
            return result;
        },
        wrapStream: async ({ doStream, params }) => {
            const runKey = reserve(params);
            const result = await chargedAtWorstCaseOnFailure(runKey, doStream);
            return { ...result, stream: result.stream.pipeThrough(settleOnFinish(runKey)) };
        },
    };
};
