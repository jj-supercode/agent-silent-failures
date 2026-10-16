import { z } from 'zod';

import type { Entry, EntryId } from '../entries/index.ts';
import type { FaultVariant, HarnessConfig, ObservedIngestion } from '../harness/index.ts';

const catalogLabel = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

/** A fault as the catalog names it (the harness `Fault.id`), e.g. `repeated-search`. */
export const faultIdSchema = z.string().regex(catalogLabel).brand<'FaultId'>();
export type FaultId = z.infer<typeof faultIdSchema>;

/** One reproducible level of a fault, e.g. `repeat-5`. A label, never a score: verdict severities are numbers. */
export const severityIdSchema = z.string().regex(catalogLabel).brand<'SeverityId'>();
export type SeverityId = z.infer<typeof severityIdSchema>;

/** A clean configuration in the pool every detector must stay clear on, e.g. `transient-search-error`. */
export const variationIdSchema = z.string().regex(catalogLabel).brand<'VariationId'>();
export type VariationId = z.infer<typeof variationIdSchema>;

/** Which offline stack a configuration runs on. A multi-agent fault on the single-agent harness changes nothing. */
export type HarnessKind = 'single-agent' | 'multi-agent';

/**
 * How corpus questions become documents: one per paragraph (the citation unit), every paragraph twice under two
 * source ids (exact score ties), or one per question context (long documents).
 */
export type DocumentLayout = 'paragraphs' | 'duplicated-paragraphs' | 'question-contexts';

/**
 * Where a configuration runs. Only the single-agent harness offers a document layout choice: the multi-agent
 * workers page through paragraph sources, so their documents are always paragraphs.
 */
export type RunSetting =
    { readonly harness: 'single-agent'; readonly documents: DocumentLayout } | { readonly harness: 'multi-agent' };

/**
 * Whether a fault changed anything observable. Most faults always do (a scripted policy, a rewritten tool output);
 * some are no-ops on some inputs (a batch cap on a corpus smaller than the cap), and a run where the fault did
 * nothing is not a detector miss. The check reads what the ingestion did to the vector store and what the unwrapped
 * embedder computes, never the ingestion report a detector reads and never a verdict.
 */
export type FaultExpression =
    | { readonly kind: 'always'; readonly reason: string }
    | {
          readonly kind: 'ingestion';
          /** What changed when the fault took effect, e.g. "at least one chunk over the embedder window". */
          readonly observable: string;
          readonly isExpressed: (observed: ObservedIngestion) => boolean;
      };

/** One severity of one fault, bound to the setting it reproduces on. */
export type FaultCase = {
    readonly entryId: EntryId;
    readonly faultId: FaultId;
    readonly severity: SeverityId;
    readonly setting: RunSetting;
    readonly expression: FaultExpression;
    readonly apply: FaultVariant['apply'];
};

/** One clean configuration of the shared pool. Hard negatives name the entries they were built to tempt. */
export type CleanVariation = {
    readonly id: VariationId;
    readonly description: string;
    readonly setting: RunSetting;
    readonly hardNegativeFor: readonly EntryId[];
    readonly apply: (config: HarnessConfig) => HarnessConfig;
};

/** The values one named threshold is swept over; the entry's own value is always one of them. */
export type ThresholdSweep = {
    readonly threshold: string;
    readonly values: readonly [number, ...number[]];
    /** Why this range: what the ends of it should show. */
    readonly rationale: string;
};

/** What the bed reproduces and measures for one entry. */
export type CatalogItem = {
    readonly entry: Entry;
    readonly faultCases: readonly [FaultCase, ...FaultCase[]];
    readonly sweeps: readonly ThresholdSweep[];
};
