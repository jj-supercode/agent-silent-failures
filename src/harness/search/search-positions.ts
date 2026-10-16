import { RequestContext } from '@mastra/core/request-context';
import type { ContextWithMastra } from '@mastra/core/server';
import { z } from 'zod';

/** Hands out the next 0-based search position of a run, in the order the searches start. */
export type NextSearchPosition = () => number;

/** The `RequestContext` key the run's positions travel under. */
export const searchPositionsKey = 'searchPositions';

export const createSearchPositions = (): NextSearchPosition => {
    let issued = 0;
    return () => issued++;
};

/**
 * A fresh `RequestContext` holding nothing but new search positions: what Studio's server hands each request (see
 * `searchPositionsPerRequest`), for code that drives the Studio agents the way Studio does.
 */
export const studioRequestContext = (): RequestContext =>
    new RequestContext([[searchPositionsKey, createSearchPositions()]]);

/**
 * Studio's server makes one `RequestContext` per request (`@mastra/deployer` 1.77.0 registers its context middleware
 * before this one). Giving each its own search positions here, before the agent runs, lets a supervisor hand the
 * same positions to every worker, so citation labels never repeat within a Studio run.
 */
export const searchPositionsPerRequest = async (
    context: ContextWithMastra,
    next: () => Promise<void>,
): Promise<void> => {
    context.get('requestContext').set(searchPositionsKey, createSearchPositions());
    await next();
};

/** Only code can store a function here: Studio and the API send JSON, which never holds one. */
const nextSearchPositionSchema = z.custom<NextSearchPosition>((value) => typeof value === 'function');

/**
 * The positions of the run that owns `requestContext`. They live in the context as a function on purpose:
 * `RequestContext.toJSON` drops functions, so they never reach a span, and Mastra copies a parent's context entries
 * by reference into each sub-agent's context, so a supervisor and its workers share one sequence
 * (`@mastra/core` 1.77.0, `listAgentTools` and `RequestContext.isSerializable`). The run's edge creates them; a
 * context that arrives without them (a tool driven by other code) gets its own here, which keeps labels unique
 * within that agent's run but not across a supervisor's workers.
 */
export const ensureSearchPositions = (requestContext: RequestContext): NextSearchPosition => {
    const stored = nextSearchPositionSchema.safeParse(requestContext.get(searchPositionsKey));
    if (stored.success) {
        return stored.data;
    }
    const created = createSearchPositions();
    requestContext.set(searchPositionsKey, created);
    return created;
};
