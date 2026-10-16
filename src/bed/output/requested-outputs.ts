import type { BedReport, ReportProvenance } from '../model.ts';
import { renderJsonReport } from '../render/json-report.ts';
import { writeFormattedFile } from './formatted-file.ts';
import { writeOfflineResults } from './offline-results.ts';

export type OutputRequest = {
    /** `--report-json <path>`, or `null`. */
    readonly reportJsonPath: string | null;
    /** `--write-results`: rewrite the committed `results/offline/`. */
    readonly writeResults: boolean;
};

const writeReportJson = async (
    path: string | null,
    report: BedReport,
    provenance: ReportProvenance,
): Promise<readonly string[]> => {
    if (path === null) {
        return [];
    }
    await writeFormattedFile(path, renderJsonReport(report, provenance));
    return [path];
};

/**
 * Writes what was asked for and returns the paths written; the committed results only from a complete run with no
 * failures. Entry pages and the README are rendered from those results by `pnpm docs:tables`.
 */
export const writeRequestedOutputs = async (
    request: OutputRequest,
    report: BedReport,
    provenance: ReportProvenance,
    complete: boolean,
): Promise<readonly string[]> => [
    ...(await writeReportJson(request.reportJsonPath, report, provenance)),
    ...(request.writeResults && complete ? await writeOfflineResults(report, provenance) : []),
];
