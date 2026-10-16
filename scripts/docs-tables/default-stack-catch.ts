import { rateOf } from '../../src/bed/index.ts';
import { catalog } from '../../src/catalog/index.ts';
import { embeddingCoverageEntryId } from '../../src/entries/index.ts';
import type { Rate, SeverityCatch, SplitReport } from './model.ts';
import type { HeadlineInput } from './render-headline.ts';

/** The embedding-coverage faults that run over long question-level documents: Mastra's default stack. */
const defaultStackFaultIds: ReadonlySet<string> = new Set(
    catalog
        .filter((item) => item.entry.id === embeddingCoverageEntryId)
        .flatMap((item) => item.faultCases)
        .filter(
            (faultCase) =>
                faultCase.setting.harness === 'single-agent' && faultCase.setting.documents === 'question-contexts',
        )
        .map((faultCase) => faultCase.faultId),
);

const pooledRate = (severities: readonly SeverityCatch[], rateOfSeverity: (severity: SeverityCatch) => Rate) =>
    rateOf(
        severities.reduce((total, severity) => total + rateOfSeverity(severity).events, 0),
        severities.reduce((total, severity) => total + rateOfSeverity(severity).trials, 0),
    );

/** Held-out catches of those faults, pooled over their severities. */
export const defaultStackCatch = (heldOut: SplitReport | undefined): HeadlineInput['defaultStackCatch'] => {
    const severities = (
        heldOut?.detectors.find((detector) => detector.entryId === embeddingCoverageEntryId)?.caughtBySeverity ?? []
    ).filter((severity) => defaultStackFaultIds.has(severity.faultId));
    const [first] = severities;
    return first === undefined
        ? undefined
        : {
              faultId: first.faultId,
              caught: pooledRate(severities, (severity) => severity.caught),
              caughtWhenExpressed: pooledRate(severities, (severity) => severity.caughtWhenExpressed),
              notExpressed: severities.reduce((total, severity) => total + severity.notExpressed, 0),
              firedWhenNotExpressed: severities.reduce((total, severity) => total + severity.firedWhenNotExpressed, 0),
          };
};
