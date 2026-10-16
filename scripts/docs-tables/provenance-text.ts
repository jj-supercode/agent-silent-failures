import type { ReportProvenance, ReproReport } from './model.ts';

const versionsText = (versions: Readonly<Record<string, string>>): string =>
    Object.entries(versions)
        .map(([name, version]) => `${name} ${version}`)
        .join(', ');

/** `scripted, darwin arm64, Node v24.15.0, 2026-10-14, @mastra/core 1.77.0, ...` */
export const bedProvenance = (provenance: ReportProvenance): string =>
    `${provenance.source}, ${provenance.platform}, generated ${provenance.generatedOn}, ${versionsText(provenance.versions)}`;

export const reproProvenance = (report: ReproReport): string =>
    `${report.source} (offline, no model), ${report.platform}, generated ${report.generatedOn}, ` +
    versionsText(report.versions);
