import type { PlanDescription } from './session-plan.ts';

/** `agent-run repeated-search/repeat-3` -> `['repeated-search', 'repeat-3']`; a clean variation keeps its full path. */
const conditionParts = (condition: string): readonly [group: string, member: string] => {
    const key = condition.replace(/^agent-run /, '');
    const [first = key, ...rest] = key.split('/');
    return rest.length === 0 ? [key, ''] : [first, rest.join('/')];
};

/**
 * The scripted-only conditions collapsed to one line per fault or clean family: `repeated-search: repeat-3, repeat-5`.
 * A dry run prints the same plan as a live run, so the grouping keeps it short for both.
 */
export const groupedConditionLines = (conditions: readonly string[]): readonly string[] =>
    [...Map.groupBy(conditions.map(conditionParts), ([group]) => group)].map(
        ([group, members]) => `${group}: ${members.map(([, member]) => member).join(', ')}`,
    );

/** The plan section: why some planned conditions are not recorded, in a few grouped lines. */
export const planDescriptionLines = (description: PlanDescription): readonly string[] => {
    switch (description.kind) {
        case 'new':
            return [
                "Live runs keep each family's retrieval settings (top K, chunking); the scripted phrasing, wording and " +
                    'abstention variations are policy wrappers and apply only to scripted and dry runs.',
                '',
                `Scripted only, ${description.scriptedOnly.length} conditions (the configuration replaces the model):`,
                ...groupedConditionLines(description.scriptedOnly).map((line) => `  ${line}`),
                '',
                `Not recorded: ${description.ingestionConditions} ingestion conditions ` +
                    `(${description.ingestionRuns} planned runs) call no model; their numbers stay scripted.`,
            ];
        case 'resume':
            return [
                `Resuming ${description.directory}: ${description.completedRuns} completed runs kept as recorded; ` +
                    'only failed and missing runs are recorded.',
            ];
        default:
            return description satisfies never;
    }
};
