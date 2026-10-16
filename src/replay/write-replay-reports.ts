import path from 'node:path';

import { renderJsonReport, renderMarkdownReport, writeFormattedFile, type BedReport } from '../bed/index.ts';
import { displayPath } from '../command-output/index.ts';
import type { FixtureSet } from '../record/index.ts';
import type { ReplayResult } from './replay-fixtures.ts';
import { renderReplayJson, renderReplayNotes, replayProvenance } from './replay-report.ts';
import { repositoryRoot } from './repository-paths.ts';

/** Writes `report.md`, `report.json` and `replay.json`; returns the paths written, as printed. */
export const writeReplayReports = async (
    outputDirectory: string,
    fixtureName: string,
    fixtures: FixtureSet,
    result: ReplayResult,
    report: BedReport,
): Promise<readonly string[]> => {
    const provenance = replayProvenance(fixtures.manifest, result.source);
    const notes = renderReplayNotes(fixtures.manifest, result, report, fixtureName);
    const files = [
        ['report.md', `${notes}\n${renderMarkdownReport(report, provenance)}`],
        ['report.json', renderJsonReport(report, provenance)],
        ['replay.json', renderReplayJson(fixtures.manifest, result, fixtureName)],
    ] as const;
    return await Array.fromAsync(files, async ([name, content]) => {
        const target = path.join(outputDirectory, name);
        await writeFormattedFile(target, content);
        return displayPath(repositoryRoot, target);
    });
};
