import type { DemonstrationReport } from './model.ts';
import { otherFiredEntries, presetVerdict } from './preset-verdict.ts';

const verdictText = (presetDemonstration: DemonstrationReport['presets'][number]): string => {
    const verdict = presetVerdict(presetDemonstration);
    switch (verdict.kind) {
        case 'fired':
            return `fired on ${verdict.fired}/${verdict.traces}: ${verdict.evidence}`;
        case 'not-fired':
            return `did not fire on ${verdict.traces} (${verdict.failedRuns} failed runs): ${verdict.evidence}`;
        case 'not-run':
            return `not run: ${verdict.reason}`;
        default:
            return verdict satisfies never;
    }
};

const alsoFiredText = (presetDemonstration: DemonstrationReport['presets'][number]): string => {
    const others = otherFiredEntries(presetDemonstration);
    return others.length === 0 ? '' : `; also fired: ${others.join(', ')}`;
};

/** One line per preset: the expected entry, whether it fired, and on what evidence. */
export const demonstrationSummaryLines = (report: DemonstrationReport): readonly string[] =>
    report.presets.map(
        (presetDemonstration) =>
            `${presetDemonstration.preset} -> ${presetDemonstration.expectedEntry}: ${verdictText(presetDemonstration)}` +
            alsoFiredText(presetDemonstration),
    );
