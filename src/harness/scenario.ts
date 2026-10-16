import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';

import { questionIdSchema } from '../corpus/index.ts';
import { createSearchPositions, searchPositionsKey, type NextSearchPosition } from './search/search-positions.ts';

/**
 * Identifies one scripted run. It travels in Mastra's `RequestContext`, which Mastra stores on every span, so it
 * must never carry fault labels: detectors and trace readers would see them.
 */
export const scenarioContextSchema = z.object({
    questionId: questionIdSchema,
    seed: z.int().nonnegative(),
});
export type ScenarioContext = z.infer<typeof scenarioContextSchema>;

/**
 * The typed shape of the harness `RequestContext`; values read back are still validated, since Studio can send any.
 * The search positions are a function, which Mastra leaves off spans (see `ensureSearchPositions`).
 */
export type ScenarioRequestContext = {
    readonly scenario: ScenarioContext;
    readonly [searchPositionsKey]: NextSearchPosition;
};

/** Used when an agent runs without a scenario, e.g. from the Studio chat. */
export const interactiveScenario: ScenarioContext = {
    questionId: questionIdSchema.parse('interactive'),
    seed: 0,
};

export const toRequestContext = (scenario: ScenarioContext): RequestContext<ScenarioRequestContext> =>
    new RequestContext<ScenarioRequestContext>([
        ['scenario', scenario],
        [searchPositionsKey, createSearchPositions()],
    ]);

export const scenarioFromRequestContext = (requestContext: RequestContext | undefined): ScenarioContext =>
    scenarioContextSchema.safeParse(requestContext?.get('scenario')).data ?? interactiveScenario;
