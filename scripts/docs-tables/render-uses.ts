import { countText } from '../../src/command-output/index.ts';
import type { DemonstrationInputs } from './demonstration-inputs.ts';
import type { BedReport, ReplaySummary } from './model.ts';
import { readmeAnchors } from './readme-anchors.ts';
import { cleanRunCount, falseAlarmTotal, heldOutSplitOf } from './report-queries.ts';
import { verdictExample } from './verdict-example.ts';

export type UsesInput = {
    readonly demonstration: DemonstrationInputs;
    readonly replaySummary: ReplaySummary;
    readonly replayReport: BedReport;
};

/** The CI use's example: what a replay of the committed traces measures, with no model or key. */
const replayExample = ({ replaySummary, replayReport }: UsesInput): string => {
    const recorded = heldOutSplitOf(replayReport);
    if (recorded === undefined) {
        return '`pnpm replay` scores committed traces offline, with no model or key.';
    }
    return (
        `\`pnpm replay\` scores ${countText(replaySummary.scoredRuns)} committed traces (\`${replaySummary.source}\`, ` +
        `\`${replaySummary.manifest.models.agent}\`) offline with no model or key: ${countText(falseAlarmTotal(recorded))} firings on ` +
        `${countText(cleanRunCount(recorded))} clean runs.`
    );
};

type Use = { readonly title: string; readonly what: string; readonly example: string };

const usesOf = (input: UsesInput): readonly Use[] => [
    {
        title: 'Before shipping an index',
        what:
            '`embedding-coverage` reads the ingestion trace and flags text the embedder never sees and chunks left ' +
            `without a vector ([the lead finding](${readmeAnchors.leadFinding})).`,
        example: verdictExample(input.demonstration, 'default-chunk-size'),
    },
    {
        title: 'In CI',
        what:
            'score the traces of an eval run with `scoreTraceBatch` and fail the build on a fired verdict ' +
            `([measured on a real model](${readmeAnchors.measuredOnARealModel})).`,
        example: replayExample(input),
    },
    {
        title: 'In Studio',
        what: `open a trace and pick a detector under "Score trace"; the reason names the spans ([Studio](${readmeAnchors.studio})).`,
        example: verdictExample(input.demonstration, 'search-drops-results'),
    },
    {
        title: 'In production monitoring',
        what:
            'score a sample of stored production traces after the fact; retrieval and ingestion faults are caught ' +
            `whatever the model does ([every detector, caught in the act](${readmeAnchors.everyDetectorCaughtInTheAct})).`,
        example: verdictExample(input.demonstration, 'collapsed-embedder'),
    },
    {
        title: 'In multi-agent setups',
        what:
            'catch a supervisor that keeps re-delegating, or answers from its own prior instead of what its workers ' +
            'returned ([delegation-ping-pong](src/entries/delegation-ping-pong/README.md), ' +
            '[ignored-worker-result](src/entries/ignored-worker-result/README.md)).',
        example: verdictExample(input.demonstration, 'worker-reply-dropped'),
    },
];

/** "What it does for you": five uses, each with a real verdict or measured fact as its example, never a mock-up. */
export const usesBlock = (input: UsesInput): string =>
    usesOf(input)
        .map((use) => `- **${use.title}:** ${use.what}\n    - Example: ${use.example}`)
        .join('\n');
