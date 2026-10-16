import { createHash } from 'node:crypto';

import type { QuestionType } from '../../src/corpus/index.ts';
import type { HotpotSourceRow } from './source-row.ts';

export type SubsampleSpec = {
    readonly seed: string;
    readonly perType: Readonly<Record<QuestionType, number>>;
};

const rankKey = (seed: string, id: string): string => createHash('sha256').update(`${seed}:${id}`).digest('hex');

export const goldTitles = (row: HotpotSourceRow): ReadonlySet<string> => new Set(row.supporting_facts.title);

type Selection = {
    readonly picked: readonly HotpotSourceRow[];
    readonly usedGoldTitles: ReadonlySet<string>;
};

const canPick = (selection: Selection, row: HotpotSourceRow, spec: SubsampleSpec): boolean =>
    selection.picked.filter((picked) => picked.type === row.type).length < spec.perType[row.type] &&
    [...goldTitles(row)].every((title) => !selection.usedGoldTitles.has(title));

const pick = (selection: Selection, row: HotpotSourceRow): Selection => ({
    picked: [...selection.picked, row],
    usedGoldTitles: new Set([...selection.usedGoldTitles, ...goldTitles(row)]),
});

/**
 * Seeded, order-independent subsample: rows are ranked by sha256(seed:id) and taken greedily per question type,
 * skipping any row whose gold titles were already used, so no gold paragraph is shared between questions.
 */
export const selectSubsample = (rows: readonly HotpotSourceRow[], spec: SubsampleSpec): readonly HotpotSourceRow[] =>
    rows
        .map((row) => ({ row, key: rankKey(spec.seed, row.id) }))
        .toSorted((left, right) => left.key.localeCompare(right.key))
        .reduce<Selection>((selection, { row }) => (canPick(selection, row, spec) ? pick(selection, row) : selection), {
            picked: [],
            usedGoldTitles: new Set(),
        }).picked;
