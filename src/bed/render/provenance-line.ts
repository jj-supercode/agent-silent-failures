import type { ReportProvenance } from '../model.ts';

const sourceMeaning = {
    scripted: 'offline scripted model, local embeddings',
    recorded: 'traces recorded from a real model run, scored offline',
    live: 'a real model run',
} as const satisfies Record<ReportProvenance['source'], string>;

/** One line naming where every number below came from. */
export const provenanceLine = ({ source, platform, generatedOn, versions }: ReportProvenance): string =>
    `Source: \`${source}\` (${sourceMeaning[source]}). Platform: ${platform}. Generated: ${generatedOn} (UTC). ` +
    `Versions: ${Object.entries(versions)
        .map(([name, version]) => `${name} ${version}`)
        .join(', ')}.`;
