import { z } from 'zod';

import type { FaultId, HarnessKind, RunSetting, SeverityId, VariationId } from '../catalog/index.ts';
import type { CorpusQuestion, QuestionId, SourceDocument } from '../corpus/index.ts';
import type { EntryId, Verdict } from '../entries/index.ts';
import type { HarnessConfig } from '../harness/index.ts';
import type { UnitInterval } from '../trace/index.ts';

/** Unique within one bed or replay run, e.g. `held-out/h2/tool-loop/repeated-search/repeat-3/<question>/r0`. */
export const runIdSchema = z.string().min(1).brand<'RunId'>();
export type RunId = z.infer<typeof runIdSchema>;

/** A variation family: one retrieval config, query phrasing and answer wording, e.g. `h2`. Dev and held-out never share one. */
export const familyIdSchema = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .brand<'FamilyId'>();
export type FamilyId = z.infer<typeof familyIdSchema>;

/** Where a run came from. Every published number carries this label. */
export type RunSource = 'scripted' | 'recorded' | 'live';

/** Dev families may inform thresholds; held-out families never do, and only held-out numbers are published. */
export type Split = 'dev' | 'held-out';

export const splits = ['dev', 'held-out'] as const satisfies readonly Split[];

export type RunCondition =
    | {
          readonly kind: 'clean';
          readonly variation: VariationId;
          /** Entries this clean variation was built to tempt; their false alarms on it are reported apart. */
          readonly hardNegativeFor: readonly EntryId[];
      }
    | {
          readonly kind: 'faulted';
          /** The entry whose reproduction this fault is; every other entry's verdict on it is cross-fault. */
          readonly entryId: EntryId;
          readonly faultId: FaultId;
          readonly severity: SeverityId;
      };

/** Identifies one harness instance: every run spec with the same key runs on the same harness. */
export const harnessKeySchema = z.string().min(1).brand<'HarnessKey'>();
export type HarnessKey = z.infer<typeof harnessKeySchema>;

/** One harness instance to build: final config (family, condition and policy variations applied) and documents. */
export type HarnessPlan = {
    readonly key: HarnessKey;
    readonly setting: RunSetting;
    readonly config: HarnessConfig;
    readonly documents: readonly SourceDocument[];
};

/**
 * Whether the run's model is the clean scripted policy or one its configuration substituted: a fault, or a hard
 * negative that scripts legitimate but unusual behaviour. A substituted policy has no live counterpart.
 */
export type ModelSource = 'clean-policy' | 'fault-policy';

/**
 * Everything that labels a run, without how to build its harness: what replay reconstructs from a recorded
 * fixture. `scoreRun` needs only this.
 */
export type RunLabels = {
    readonly runId: RunId;
    readonly split: Split;
    readonly family: FamilyId;
    readonly question: CorpusQuestion;
    readonly replicate: number;
    /** The scenario seed: run the agent with `{ questionId: question.id, seed }`. */
    readonly seed: number;
    readonly harness: HarnessKind;
    readonly condition: RunCondition;
    readonly observation: Observation['kind'];
    readonly modelSource: ModelSource;
};

/** One planned run of the bed: its labels plus the harness it runs on. */
export type RunSpec = RunLabels & { readonly plan: HarnessPlan };

/**
 * Whether the fault changed anything observable on this run (see `FaultExpression` in the catalog). `unknown`
 * when the check needs an ingestion report the caller did not have, e.g. replay of an agent run.
 */
export type FaultExpressionStatus = 'expressed' | 'not-expressed' | 'unknown';

/** The run's condition as observed: a faulted run also records whether the fault took effect. */
export type ScoredCondition =
    | Extract<RunCondition, { readonly kind: 'clean' }>
    | (Extract<RunCondition, { readonly kind: 'faulted' }> & { readonly expression: FaultExpressionStatus });

/** One detector run at one threshold value, every other threshold at its default. */
export type SweepPoint = {
    readonly threshold: string;
    readonly value: number;
    /** The entry's own value for this threshold. */
    readonly isDefault: boolean;
    /** The verdict kind at this value: a run may be judged at one value and not applicable at another. */
    readonly outcome: Verdict['kind'];
};

export type EntryVerdict = {
    readonly entryId: EntryId;
    /** At the entry's own thresholds. */
    readonly verdict: Verdict;
    readonly sweep: readonly SweepPoint[];
};

/** Task outcome, independent of any detector: the "accuracy barely moves while a canary fires" columns. */
export type RunQuality = {
    /**
     * The final answer commits to the gold answer (see `goldAnswerFound`); `null` for a yes/no gold the answer gives
     * no yes or no for.
     */
    readonly goldAnswerFound: boolean | null;
    /** Share of gold supporting sentences found in any retrieved row; `null` when no retrieval returned rows. */
    readonly goldSentenceRecall: UnitInterval | null;
};

/** What was observed: an agent run (scored by run entries) or an ingestion (scored by ingestion entries). */
export type Observation = { readonly kind: 'agent-run'; readonly quality: RunQuality } | { readonly kind: 'ingestion' };

/**
 * One observed run with every in-scope detector's verdict. The shared contract of the scripted bed and replay of
 * recorded traces: both produce `ScoredRun`s and hand them to `summarize`.
 */
export type ScoredRun = {
    readonly runId: RunId;
    readonly source: RunSource;
    readonly split: Split;
    readonly family: FamilyId;
    readonly questionId: QuestionId;
    readonly harness: HarnessKind;
    readonly observation: Observation;
    readonly condition: ScoredCondition;
    readonly verdicts: readonly EntryVerdict[];
};

/** A binomial share with its Wilson 95% score interval; `share` and `interval` are `null` when there are no trials. */
export type Rate = {
    readonly events: number;
    readonly trials: number;
    readonly share: UnitInterval | null;
    readonly interval: {
        readonly lower: UnitInterval;
        readonly upper: UnitInterval;
        /** 3 / trials, the rule of three; only when `events` is 0. */
        readonly ruleOfThreeUpper: UnitInterval | null;
    } | null;
};

/**
 * How a detector did on one set of own-fault runs. `caught` counts every run; `caughtWhenExpressed` leaves out runs
 * where the fault changed nothing observable. Expression is measured apart from the detector, so the two can
 * disagree: `firedWhenNotExpressed` counts runs where the detector fired although no effect was observed.
 */
export type FaultCatch = {
    readonly caught: Rate;
    readonly caughtWhenExpressed: Rate;
    readonly notExpressed: number;
    readonly firedWhenNotExpressed: number;
};

export type SeverityRate = FaultCatch & {
    readonly faultId: FaultId;
    readonly severity: SeverityId;
};

export type VariationRate = {
    readonly variation: VariationId;
    readonly hardNegative: boolean;
    readonly falseAlarms: Rate;
    readonly notApplicable: number;
};

/**
 * One detector on one split. Catch rate counts every run of the entry's own faults (a `not-applicable` verdict is a
 * miss); false-alarm rate counts clean runs the detector judged (`not-applicable` runs are reported, not counted).
 */
export type DetectorReport = FaultCatch & {
    readonly entryId: EntryId;
    readonly caughtBySeverity: readonly SeverityRate[];
    readonly notApplicableOnFaulted: number;
    readonly falseAlarms: Rate;
    readonly falseAlarmsByVariation: readonly VariationRate[];
};

/** A condition as tables show it: `clean: <variation>` or `<fault> / <severity>` (fault ids are unique). */
export type ConditionLabel = string;

/** One row of the cross-fault matrix: how often each detector fired on one condition's runs. */
export type ConfusionRow = {
    readonly condition: ConditionLabel;
    readonly ownEntryId: EntryId | null;
    readonly firedByEntry: readonly { readonly entryId: EntryId; readonly fired: Rate }[];
};

/** Catches over own-fault runs where the fault took effect; false alarms over clean runs judged at this value. */
export type SensitivityPoint = {
    readonly value: number;
    readonly isDefault: boolean;
    readonly caught: Rate;
    readonly falseAlarms: Rate;
};

export type ThresholdSensitivity = {
    readonly entryId: EntryId;
    readonly threshold: string;
    readonly points: readonly SensitivityPoint[];
};

/** Task outcome next to the detector that owns the condition: shows a canary firing while accuracy holds. */
export type HeadlineRow = {
    readonly condition: ConditionLabel;
    readonly agentRuns: number;
    readonly firedByEntry: readonly { readonly entryId: EntryId; readonly fired: Rate }[];
    readonly goldAnswerFound: Rate;
    readonly meanGoldSentenceRecall: UnitInterval | null;
};

export type SplitReport = {
    readonly split: Split;
    readonly agentRuns: number;
    readonly ingestions: number;
    readonly detectors: readonly DetectorReport[];
    readonly confusion: readonly ConfusionRow[];
    readonly sensitivity: readonly ThresholdSensitivity[];
    readonly headline: readonly HeadlineRow[];
};

export type BedReport = {
    readonly sources: readonly RunSource[];
    readonly splits: readonly SplitReport[];
};

/** Printed with every table: where the numbers came from. */
export type ReportProvenance = {
    readonly source: RunSource;
    readonly platform: string;
    /** ISO date of the run, in UTC. */
    readonly generatedOn: string;
    readonly versions: Readonly<Record<string, string>>;
};
