import type { BedReport, ReportProvenance } from '../model.ts';

/** The machine-readable report: provenance plus every rate, for docs generation and comparisons between runs. */
export const renderJsonReport = (report: BedReport, provenance: ReportProvenance): string =>
    `${JSON.stringify({ provenance, ...report }, null, 4)}\n`;
