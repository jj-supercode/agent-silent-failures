import type { ToolName, UnitInterval } from '../../trace/index.ts';

/** A tool call the model made earlier in this run, paired with what the tool returned. */
export type ToolExchange = {
    readonly toolName: ToolName;
    readonly args: unknown;
    readonly output: unknown;
    /** The SDK marked the result as an error (a thrown tool), as opposed to an error-shaped return value. */
    readonly failed: boolean;
};

/** What a scripted model can see of the run so far, decoded from the provider prompt. */
export type Conversation = {
    readonly question: string;
    readonly exchanges: readonly ToolExchange[];
    readonly assistantTurns: number;
    readonly offeredTools: readonly ToolName[];
};

export type PolicyTurn =
    | { readonly kind: 'call-tool'; readonly toolName: ToolName; readonly args: Readonly<Record<string, unknown>> }
    | { readonly kind: 'answer'; readonly text: string };

/** A seeded uniform draw in [0, 1); the same label in the same turn always draws the same value. */
export type Draw = (label: string) => UnitInterval;

/** Decides the next model turn. Pure: the same conversation and draws give the same turn. */
export type AgentPolicy = (conversation: Conversation, draw: Draw) => PolicyTurn;
