import { z } from 'zod';

import type { IngestionView, RunView, RunViewOptions, SpanId, UnitInterval } from '../trace/index.ts';
import { InvalidThresholdValueError, UnknownThresholdError } from './errors.ts';

export const entryIdSchema = z
    .string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    .brand<'EntryId'>();
export type EntryId = z.infer<typeof entryIdSchema>;

/** What a detector concludes about one view. The scorer adapter maps `not-applicable` to Mastra's `notScorable()`. */
export type Verdict =
    | {
          readonly kind: 'fired';
          /** How much of the run or corpus the failure touches. */
          readonly severity: UnitInterval;
          readonly evidence: { readonly spanIds: readonly SpanId[]; readonly summary: string };
      }
    | { readonly kind: 'clear'; readonly evidence: { readonly summary: string } }
    | { readonly kind: 'not-applicable'; readonly reason: string };

/**
 * A detector constant with the reason for its value; its name is its key in the entry's `Thresholds` record.
 * `invariant`: any violation is a failure, nothing to tune. `prior`: taken from published practice. `dev`: set on
 * the dev split only, frozen before held-out runs.
 */
export type Threshold = {
    readonly value: number;
    readonly basis: string;
    readonly calibratedOn: 'prior' | 'dev' | 'invariant';
};

export type Thresholds = Readonly<Record<string, Threshold>>;

/**
 * The thresholds of one entry by name, with plain `number` values: a detector reads whatever value an override
 * set, never the literal its constant was defined with. Use as `ThresholdSet<keyof typeof myThresholds>`.
 */
export type ThresholdSet<TName extends string> = { readonly [Name in TName]: Threshold };

/**
 * New values for some of an entry's thresholds, keyed by their names, so a misspelt name is a type error. With the
 * default type argument it accepts any name and the entry rejects unknown ones at run time (`UnknownThresholdError`).
 */
export type ThresholdOverrides<TThresholds extends Thresholds = Thresholds> = {
    readonly [Name in keyof TThresholds]?: number;
};

/** A pure function of the view and the thresholds; it never sees Mastra types, faults or harness state. */
export type Detector<TView, TThresholds extends Thresholds> = (view: TView, thresholds: TThresholds) => Verdict;

export type EntryFamily = 'rag' | 'rag-ingest' | 'tool-use' | 'multi-agent';

type EntryDescription = {
    readonly id: EntryId;
    readonly title: string;
    /** One sentence: the symptom, as a user would notice it. */
    readonly summary: string;
    readonly family: EntryFamily;
    readonly status: 'stable' | 'experimental';
};

export type RunEntryDefinition<TThresholds extends Thresholds> = EntryDescription & {
    readonly thresholds: TThresholds;
    readonly runViewOptions: RunViewOptions;
    readonly detect: Detector<RunView, TThresholds>;
};

export type IngestionEntryDefinition<TThresholds extends Thresholds> = EntryDescription & {
    readonly thresholds: TThresholds;
    readonly detect: Detector<IngestionView, TThresholds>;
};

/**
 * A registered entry. Thresholds are fixed at definition; `detect` accepts per-call overrides by name. `detect` is a
 * method so an entry with specific thresholds still fits a list of entries of any thresholds.
 */
export type RunEntry<TThresholds extends Thresholds = Thresholds> = EntryDescription & {
    readonly kind: 'run';
    readonly thresholds: TThresholds;
    readonly runViewOptions: RunViewOptions;
    detect(view: RunView, overrides?: ThresholdOverrides<TThresholds>): Verdict;
};

export type IngestionEntry<TThresholds extends Thresholds = Thresholds> = EntryDescription & {
    readonly kind: 'ingestion';
    readonly thresholds: TThresholds;
    detect(view: IngestionView, overrides?: ThresholdOverrides<TThresholds>): Verdict;
};

export type Entry<TThresholds extends Thresholds = Thresholds> = RunEntry<TThresholds> | IngestionEntry<TThresholds>;

export const applyThresholdOverrides = <TThresholds extends Thresholds>(
    thresholds: TThresholds,
    overrides: ThresholdOverrides<TThresholds>,
): TThresholds =>
    Object.entries(overrides).reduce<TThresholds>((current, [name, value]) => {
        const threshold = current[name];
        if (threshold === undefined) {
            throw new UnknownThresholdError(name, Object.keys(current));
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new InvalidThresholdValueError(name, value);
        }
        return { ...current, [name]: { ...threshold, value } };
    }, thresholds);

export const defineRunEntry = <TThresholds extends Thresholds>({
    detect,
    ...definition
}: RunEntryDefinition<TThresholds>): RunEntry<TThresholds> => ({
    ...definition,
    kind: 'run',
    detect: (view, overrides = {}) => detect(view, applyThresholdOverrides(definition.thresholds, overrides)),
});

export const defineIngestionEntry = <TThresholds extends Thresholds>({
    detect,
    ...definition
}: IngestionEntryDefinition<TThresholds>): IngestionEntry<TThresholds> => ({
    ...definition,
    kind: 'ingestion',
    detect: (view, overrides = {}) => detect(view, applyThresholdOverrides(definition.thresholds, overrides)),
});
