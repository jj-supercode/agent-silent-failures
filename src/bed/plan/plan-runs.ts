import { documentLayoutOf, documentsFor, type DocumentLayout } from '../../catalog/index.ts';
import type { CorpusQuestion, SourceDocument } from '../../corpus/index.ts';
import type { EntryId } from '../../entries/index.ts';
import {
    harnessKeySchema,
    runIdSchema,
    type HarnessPlan,
    type ModelSource,
    type RunSpec,
    type Split,
} from '../model.ts';
import { conditionCases, conditionKey, entryKindsInScope, type ConditionCase } from './condition-cases.ts';
import { configureHarness } from './configure-harness.ts';
import { familiesBySplit, type Family } from './families.ts';
import { questionsOf } from './question-split.ts';
import { seedFor } from './seeds.ts';

/**
 * Replicates of the two baseline variations: 24 held-out questions x 5 = 120 clean runs, where zero false alarms
 * bound the rate at about 3% (Wilson 95%).
 */
const baselineReplicates = { dev: 3, 'held-out': 5 } as const satisfies Record<Split, number>;

/** Seeds differ between splits (another salt), so a held-out run never replays a dev run's draws. */
const seedSalt = (split: Split): string => `bed-seed-v1-${split}`;

type PlanContext = {
    readonly split: Split;
    /** The whole corpus in each layout, built once and shared by every agent-run harness plan. */
    readonly corpusDocuments: Readonly<Record<DocumentLayout, readonly SourceDocument[]>>;
    readonly questions: readonly CorpusQuestion[];
    readonly families: readonly [Family, ...Family[]];
};

/** Questions rotate through the families: item `index` of a non-empty list, wrapping around. */
const rotating = <T>(items: readonly [T, ...T[]], index: number): T => items[index % items.length] ?? items[0];

type FamilyPlan = { readonly family: Family; readonly plan: HarnessPlan; readonly modelSource: ModelSource };

/** The full-corpus harness one family runs one condition on. */
const agentRunFamilyPlan = (context: PlanContext, conditionCase: ConditionCase, family: Family): FamilyPlan => {
    const { config, modelSource } = configureHarness(family, conditionCase);
    return {
        family,
        modelSource,
        plan: {
            key: harnessKeySchema.parse(`${context.split}/${family.id}/${conditionKey(conditionCase.condition)}`),
            setting: conditionCase.setting,
            config,
            documents: context.corpusDocuments[documentLayoutOf(conditionCase.setting)],
        },
    };
};

const agentRunSpec = (
    context: PlanContext,
    conditionCase: ConditionCase,
    { family, plan, modelSource }: FamilyPlan,
    question: CorpusQuestion,
    replicate: number,
): RunSpec => {
    const key = conditionKey(conditionCase.condition);
    return {
        runId: runIdSchema.parse(`${context.split}/${family.id}/${key}/${question.id}/r${replicate}`),
        split: context.split,
        family: family.id,
        question,
        replicate,
        seed: seedFor([seedSalt(context.split), family.id, key, question.id, replicate]),
        harness: conditionCase.setting.harness,
        condition: conditionCase.condition,
        observation: 'agent-run',
        modelSource,
        plan,
    };
};

/** Agent runs: one harness per (family, condition) over the whole corpus; questions rotate through families. */
const agentRunSpecs = (context: PlanContext, conditionCase: ConditionCase): readonly RunSpec[] => {
    const replicates = conditionCase.replicated ? baselineReplicates[context.split] : 1;
    const [firstFamily, ...otherFamilies] = context.families;
    const familyPlans: readonly [FamilyPlan, ...FamilyPlan[]] = [
        agentRunFamilyPlan(context, conditionCase, firstFamily),
        ...otherFamilies.map((family) => agentRunFamilyPlan(context, conditionCase, family)),
    ];
    return Array.from({ length: replicates }, (_, replicate) =>
        context.questions.map((question, index) =>
            agentRunSpec(context, conditionCase, rotating(familyPlans, index + replicate), question, replicate),
        ),
    ).flat();
};

/**
 * Ingestions: one small harness per (condition, question) over that question's own documents, so the ingestion
 * entry is measured on as many independent corpora as there are questions. Single-agent conditions only: the
 * multi-agent harness ingests through the same path, and its faults change only the model.
 */
const ingestionSpecs = (context: PlanContext, conditionCase: ConditionCase): readonly RunSpec[] => {
    const { setting } = conditionCase;
    if (setting.harness !== 'single-agent') {
        return [];
    }
    const key = conditionKey(conditionCase.condition);
    return context.questions.map((question, index) => {
        const family = rotating(context.families, index);
        const { config, modelSource } = configureHarness(family, conditionCase);
        const runId = `${context.split}/${family.id}/${key}/${question.id}/ingestion`;
        return {
            runId: runIdSchema.parse(runId),
            split: context.split,
            family: family.id,
            question,
            replicate: 0,
            seed: seedFor([seedSalt(context.split), family.id, key, question.id, 'ingestion']),
            harness: setting.harness,
            condition: conditionCase.condition,
            observation: 'ingestion',
            modelSource,
            plan: {
                key: harnessKeySchema.parse(runId),
                setting,
                config,
                documents: documentsFor(setting.documents, [question]),
            },
        };
    });
};

export type PlanRequest = {
    readonly split: Split;
    /** Only this entry's faults and the clean variations on its harnesses; every entry when `null`. */
    readonly entryId: EntryId | null;
};

/**
 * Every run of one split, in a fixed order: agent runs, then ingestions, condition by condition. Pure: the same
 * corpus and request always plan the same runs, seeds and configs.
 */
export const planRuns = (corpus: readonly CorpusQuestion[], { split, entryId }: PlanRequest): readonly RunSpec[] => {
    const context: PlanContext = {
        split,
        corpusDocuments: {
            paragraphs: documentsFor('paragraphs', corpus),
            'duplicated-paragraphs': documentsFor('duplicated-paragraphs', corpus),
            'question-contexts': documentsFor('question-contexts', corpus),
        },
        questions: questionsOf(corpus, split),
        families: familiesBySplit[split],
    };
    const kinds = entryKindsInScope(entryId);
    const cases = conditionCases(entryId);
    return [
        ...(kinds.has('run') ? cases.flatMap((conditionCase) => agentRunSpecs(context, conditionCase)) : []),
        ...(kinds.has('ingestion') ? cases.flatMap((conditionCase) => ingestionSpecs(context, conditionCase)) : []),
    ];
};
