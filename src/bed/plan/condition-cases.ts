import {
    catalog,
    cleanPool,
    variationIdSchema,
    type CatalogItem,
    type RunSetting,
    type VariationId,
} from '../../catalog/index.ts';
import type { Entry, EntryId } from '../../entries/index.ts';
import type { HarnessConfig } from '../../harness/index.ts';
import type { RunCondition } from '../model.ts';

/** One configuration to reproduce: a clean variation or one fault severity, with where it runs. */
export type ConditionCase = {
    readonly condition: RunCondition;
    readonly setting: RunSetting;
    readonly apply: (config: HarnessConfig) => HarnessConfig;
    /** Run once per question per replicate; otherwise once per question. */
    readonly replicated: boolean;
};

/** The pool's reference runs; every other clean variation runs once per question. */
export const replicatedVariations: ReadonlySet<VariationId> = new Set(
    ['baseline', 'multi-agent-baseline'].map((id) => variationIdSchema.parse(id)),
);

const itemsInScope = (entryId: EntryId | null): readonly CatalogItem[] =>
    catalog.filter((item) => entryId === null || item.entry.id === entryId);

/** Which entry kinds a request scores: agent runs are planned for run entries, ingestions for ingestion entries. */
export const entryKindsInScope = (entryId: EntryId | null): ReadonlySet<Entry['kind']> =>
    new Set(itemsInScope(entryId).map((item) => item.entry.kind));

/**
 * The request's own faults plus the whole clean pool, on both harnesses: a false-alarm rate measured on a subset of
 * the pool would differ from the one the full bed publishes.
 */
export const conditionCases = (entryId: EntryId | null): readonly ConditionCase[] => {
    const items = itemsInScope(entryId);
    const clean = cleanPool.map((variation): ConditionCase => ({
        condition: { kind: 'clean', variation: variation.id, hardNegativeFor: variation.hardNegativeFor },
        setting: variation.setting,
        apply: variation.apply,
        replicated: replicatedVariations.has(variation.id),
    }));
    const faulted = items.flatMap((item) =>
        item.faultCases.map((faultCase): ConditionCase => ({
            condition: {
                kind: 'faulted',
                entryId: faultCase.entryId,
                faultId: faultCase.faultId,
                severity: faultCase.severity,
            },
            setting: faultCase.setting,
            apply: faultCase.apply,
            replicated: false,
        })),
    );
    return [...clean, ...faulted];
};

/** A path-like key for ids: `clean/<variation>` or `<fault>/<severity>`. */
export const conditionKey = (condition: RunCondition): string => {
    switch (condition.kind) {
        case 'clean':
            return `clean/${condition.variation}`;
        case 'faulted':
            return `${condition.faultId}/${condition.severity}`;
        default:
            return condition satisfies never;
    }
};
