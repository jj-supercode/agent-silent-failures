import { documentLayoutOf, documentsFor } from '../catalog/index.ts';
import type { CorpusQuestion } from '../corpus/index.ts';
import { planRuns, questionsOf, replan, withPlanSettings, type RunSpec } from '../bed/index.ts';
import type { HarnessSettings } from '../harness/index.ts';

/** Three held-out questions keep `pnpm demo` under a minute warm while still touching every condition and family. */
export const demoQuestionCount = 3;

/**
 * The held-out plan cut to a few questions, with each agent-run harness ingesting only those questions' documents
 * (a small corpus builds in a fraction of a second). Retrieval over 30 paragraphs is easier than over the full
 * corpus, so these numbers show the mechanics, never the published rates.
 */
export const demoSpecs = (
    corpus: readonly CorpusQuestion[],
    settings: Partial<HarnessSettings>,
): readonly RunSpec[] => {
    const questions = questionsOf(corpus, 'held-out').slice(0, demoQuestionCount);
    const kept = new Set(questions.map((question) => question.id));
    const specs = planRuns(corpus, { split: 'held-out', entryId: null }).filter((spec) => kept.has(spec.question.id));
    const onSmallCorpus = replan(specs, (plan, spec) =>
        spec.observation === 'ingestion'
            ? plan
            : { ...plan, documents: documentsFor(documentLayoutOf(plan.setting), questions) },
    );
    return withPlanSettings(onSmallCorpus, settings);
};
