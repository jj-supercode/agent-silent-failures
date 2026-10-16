import type { EntryId } from '../../src/entries/index.ts';
import {
    otherFiredEntries,
    presetVerdict,
    type DemonstrationReport,
    type PresetDemonstration,
    type PresetVerdict,
} from '../../src/studio/demonstration/index.ts';
import { studioFaultPresets } from '../../src/studio/index.ts';
import { markdownRows } from './markdown-rows.ts';
import { excerpt } from './text-excerpt.ts';
import { bedProvenance } from './provenance-text.ts';
import { liveReading } from './render-live-reading.ts';

/** Long enough for a detector's summary sentence, short enough for a table cell. */
const evidenceLength = 160;

const verdictCell = (verdict: PresetVerdict): string => {
    switch (verdict.kind) {
        case 'fired':
            return `fired ${verdict.fired}/${verdict.traces}`;
        case 'not-fired':
            return verdict.failedRuns === 0
                ? `not fired 0/${verdict.traces}`
                : `not fired 0/${verdict.traces} (${verdict.failedRuns} runs failed)`;
        case 'not-run':
            return 'scripted-only, not run live';
        default:
            return verdict satisfies never;
    }
};

const liveCell = (live: PresetDemonstration | undefined): string =>
    live === undefined ? 'not run yet' : verdictCell(presetVerdict(live));

const alsoFired = (demonstration: PresetDemonstration | undefined): string => {
    const others = demonstration === undefined ? [] : otherFiredEntries(demonstration);
    return others.length === 0 ? '' : ` Also fired: ${others.map((entryId) => `\`${entryId}\``).join(', ')}.`;
};

/** The live verdict's evidence when the live run produced one, else the scripted one; labelled either way. */
const evidenceCell = (scripted: PresetDemonstration, live: PresetDemonstration | undefined): string => {
    const liveVerdict = live === undefined ? null : presetVerdict(live);
    if (liveVerdict !== null && liveVerdict.kind !== 'not-run') {
        return `live: ${excerpt(liveVerdict.evidence, evidenceLength)}${alsoFired(live)}`;
    }
    const scriptedVerdict = presetVerdict(scripted);
    return scriptedVerdict.kind === 'not-run'
        ? scriptedVerdict.reason
        : `scripted: ${excerpt(scriptedVerdict.evidence, evidenceLength)}${alsoFired(scripted)}`;
};

const triggerCell = (scripted: PresetDemonstration): string => {
    const preset = studioFaultPresets[scripted.preset];
    return `\`${preset.id}\`: ${preset.breaks}`;
};

const row = (scripted: PresetDemonstration, live: PresetDemonstration | undefined): readonly string[] => [
    `\`${scripted.expectedEntry satisfies EntryId}\``,
    triggerCell(scripted),
    verdictCell(presetVerdict(scripted)),
    liveCell(live),
    evidenceCell(scripted, live),
];

/** Where a column's verdicts come from: the recording they were scored from, or nothing for a verdict-only file. */
const basisText = (report: DemonstrationReport): string => {
    switch (report.basis.kind) {
        case 'recorded-traces':
            return `; scored from the recorded traces in \`${report.basis.fixtures}\``;
        case 'verdicts-only':
            return '';
        default:
            return report.basis satisfies never;
    }
};

const liveSentence = (live: DemonstrationReport | null): string =>
    live === null
        ? 'The live column is not run yet: `pnpm demonstration:live` drives the same presets with Claude and ' +
          'writes `results/demonstration/live.json`.'
        : `Live column: model \`${live.agentModel}\`, ${live.questionCount} questions per preset ` +
          `(${bedProvenance(live.provenance)}${basisText(live)})` +
          (live.spend === null ? '.' : `, USD ${live.spend.usd.toFixed(4)} over ${live.spend.modelCalls} model calls.`);

/**
 * The README's "Every detector, caught in the act" table: each Studio preset, the entry it should make fire, and
 * whether it did, scripted and live. A live run where the entry did not fire stays in the table with its reason.
 */
export const demonstrationBlock = (scripted: DemonstrationReport, live: DemonstrationReport | null): string => {
    const livePresets = new Map(live?.presets.map((presetRun) => [presetRun.preset, presetRun]) ?? []);
    return [
        `Scripted column: model \`${scripted.agentModel}\`, ${scripted.questionCount} questions per preset ` +
            `(${bedProvenance(scripted.provenance)}${basisText(scripted)}). ${liveSentence(live)}`,
        '',
        markdownRows(
            ['Entry', 'Trigger (Studio preset)', 'Scripted', 'Live', 'Evidence'],
            scripted.presets.map((presetRun) => row(presetRun, livePresets.get(presetRun.preset))),
        ),
        '',
        "An ingestion preset is scored on the session's one ingestion trace; every other preset asks each question " +
            'once. "Not fired" on a live run means the detector looked and found no failure: the model recovered, or ' +
            'the fault never showed. That is a correct clear, never a miss, and it is reported, not hidden.' +
            liveReading(live),
    ].join('\n');
};
