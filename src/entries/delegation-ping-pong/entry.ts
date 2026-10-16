import { defineRunEntry, entryIdSchema } from '../contract.ts';
import { detectDelegationPingPong } from './detector.ts';
import { delegationPingPongThresholds } from './model.ts';

export const delegationPingPongEntryId = entryIdSchema.parse('delegation-ping-pong');

export const delegationPingPongEntry = defineRunEntry({
    id: delegationPingPongEntryId,
    title: 'Delegation ping-pong',
    summary:
        'A supervisor keeps handing the same task back to a worker, or bounces between two workers, ignoring that the work was already returned.',
    family: 'multi-agent',
    status: 'stable',
    thresholds: delegationPingPongThresholds,
    runViewOptions: { retrievalTools: new Map() },
    detect: detectDelegationPingPong,
});
