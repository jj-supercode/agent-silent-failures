import type { LanguageModelV4 } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';

import { agentModelPrice } from './budget/pricing.ts';
import type { SpendLedger } from './budget/session-ledger.ts';
import { abandonedAttemptGate } from './resilience/abandoned-attempt-gate.ts';
import { providerFailureObserver } from './resilience/provider-failure-observer.ts';
import { agentCallLimits } from './run-limits.ts';
import { currentRunScope } from './run-scope.ts';
import { guarded } from './session-models.ts';

const currentFailureLog = () => currentRunScope()?.providerFailures ?? null;

/**
 * The agent model a recorded run calls, layered from the provider outwards; the order is the contract:
 * 1. the failure observer, next to the provider, so it sees every provider error and owns retries;
 * 2. the budget guard, so every call that reaches the provider is reserved and charged;
 * 3. the abandoned-attempt gate, outermost, so a call of an attempt that already failed transiently is refused
 *    before the guard reserves anything: neither sent nor charged.
 */
export const attemptAwareAgentModel = (provider: LanguageModelV4, ledger: SpendLedger): LanguageModelV4 =>
    wrapLanguageModel({
        model: guarded(
            wrapLanguageModel({
                model: provider,
                middleware: providerFailureObserver({ currentLog: currentFailureLog }),
            }),
            ledger,
            agentModelPrice,
            agentCallLimits,
        ),
        middleware: abandonedAttemptGate({ currentLog: currentFailureLog }),
    });
