import {
    recordDemonstrationMatrix,
    scoringDifferences,
    type DemonstrationReport,
    type MatrixRequest,
} from '../../src/studio/demonstration/index.ts';
import type { StudioFaultId } from '../../src/studio/index.ts';
import { recordedReport, type RecordedReport } from './recorded-report.ts';

export type ScoredSession =
    | {
          readonly kind: 'scored';
          readonly report: DemonstrationReport;
          /** Presets whose recorded traces scored differently from Studio's trace scoring. */
          readonly differences: readonly StudioFaultId[];
      }
    | Extract<RecordedReport, { readonly kind: 'unreadable' }>;

/**
 * Records the matrix into its fixture set, then derives the report from that set exactly as `--rescore` will, and
 * checks the derived verdicts against Studio's own: the committed report is regenerable from the committed traces.
 */
export const recordAndScore = async (request: MatrixRequest): Promise<ScoredSession> => {
    const recorded = await recordDemonstrationMatrix(request);
    const scored = await recordedReport(request.recording.directory, request.corpus);
    return scored.kind === 'scored'
        ? { ...scored, differences: scoringDifferences(recorded.studioScored, scored.report) }
        : scored;
};
