import { fileURLToPath } from 'node:url';

import type { BedReport, ReportProvenance } from '../model.ts';
import { renderJsonReport } from '../render/json-report.ts';
import { renderMarkdownReport } from '../render/markdown-report.ts';
import { writeFormattedFile } from './formatted-file.ts';

const offlineResultsDirectory = new URL('../../../results/offline/', import.meta.url);

/** The committed report under `results/offline/`, as markdown and JSON; returns the paths written. */
export const writeOfflineResults = async (
    report: BedReport,
    provenance: ReportProvenance,
): Promise<readonly string[]> => {
    const markdownPath = fileURLToPath(new URL('report.md', offlineResultsDirectory));
    const jsonPath = fileURLToPath(new URL('report.json', offlineResultsDirectory));
    await writeFormattedFile(markdownPath, renderMarkdownReport(report, provenance));
    await writeFormattedFile(jsonPath, renderJsonReport(report, provenance));
    return [markdownPath, jsonPath];
};
