import { presetVerdict, type DemonstrationReport } from '../../src/studio/demonstration/index.ts';
import { presetObservation, studioFaultPresets, type StudioFaultId } from '../../src/studio/index.ts';
import type { DemonstrationInputs } from './demonstration-inputs.ts';
import { excerpt } from './text-excerpt.ts';

/** Long enough for a verdict's opening clause, short enough for one line. */
const exampleLength = 120;

const firedEvidence = (report: DemonstrationReport | null, preset: StudioFaultId): string | null => {
    const run = report?.presets.find((candidate) => candidate.preset === preset);
    const verdict = run === undefined ? null : presetVerdict(run);
    return verdict?.kind === 'fired' ? verdict.evidence : null;
};

/** Where a live verdict came from: a model's chat, or the session's ingestion, which calls no model. */
const liveSource = (live: DemonstrationReport, preset: StudioFaultId): string =>
    presetObservation(studioFaultPresets[preset]) === 'ingestion'
        ? 'live session, ingestion trace, no model involved'
        : `live, \`${live.agentModel}\``;

/**
 * A real verdict of the preset's entry, quoted with where it came from: the live run when it fired there, else the
 * scripted run. Never a mock-up.
 */
export const verdictExample = ({ scripted, live }: DemonstrationInputs, preset: StudioFaultId): string => {
    const liveEvidence = firedEvidence(live, preset);
    if (live !== null && liveEvidence !== null) {
        return `"${excerpt(liveEvidence, exampleLength)}" (${liveSource(live, preset)}, preset \`${preset}\`)`;
    }
    const scriptedEvidence = firedEvidence(scripted, preset);
    return scriptedEvidence === null
        ? `no firing recorded yet for preset \`${preset}\``
        : `"${excerpt(scriptedEvidence, exampleLength)}" (scripted, preset \`${preset}\`)`;
};
