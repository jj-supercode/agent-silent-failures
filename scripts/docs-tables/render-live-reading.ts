import type { EntryId } from '../../src/entries/index.ts';
import { presetVerdict, type DemonstrationReport, type PresetVerdict } from '../../src/studio/demonstration/index.ts';
import { presetObservation, studioFaultPresets } from '../../src/studio/index.ts';

const englishList = new Intl.ListFormat('en', { type: 'conjunction' });

const quotedEntries = (entryIds: ReadonlySet<EntryId>): string =>
    englishList.format([...entryIds].map((entryId) => `\`${entryId}\``));

/** One live preset's verdict on its entry, and whether it was scored on the ingestion rather than a chat. */
type LiveVerdict = { readonly entryId: EntryId; readonly verdict: PresetVerdict; readonly onIngestion: boolean };

const liveVerdicts = (live: DemonstrationReport): readonly LiveVerdict[] =>
    live.presets.map((presetRun) => ({
        entryId: presetRun.expectedEntry,
        verdict: presetVerdict(presetRun),
        onIngestion: presetObservation(studioFaultPresets[presetRun.preset]) === 'ingestion',
    }));

const firedEntries = (verdicts: readonly LiveVerdict[], onIngestion: boolean): ReadonlySet<EntryId> =>
    new Set(
        verdicts
            .filter((candidate) => candidate.verdict.kind === 'fired' && candidate.onIngestion === onIngestion)
            .map(({ entryId }) => entryId),
    );

/**
 * What the live column means, derived from its verdicts: entries that fired live, and entries that stayed clear
 * because the model recovered. A clear is never presented as a miss.
 */
export const liveReading = (live: DemonstrationReport | null): string => {
    if (live === null) {
        return '';
    }
    const verdicts = liveVerdicts(live);
    const firedInChats = firedEntries(verdicts, false);
    const firedOnIngestion = firedEntries(verdicts, true);
    const fired = firedInChats.union(firedOnIngestion);
    const recovered = new Set(
        verdicts
            .filter(({ verdict }) => verdict.kind === 'not-fired' && verdict.failedRuns === 0)
            .map(({ entryId }) => entryId)
            .filter((entryId) => !fired.has(entryId)),
    );
    const firedSentence =
        (firedInChats.size === 0
            ? ''
            : ` Live, ${quotedEntries(firedInChats)} fired on the chats with \`${live.agentModel}\`.`) +
        (firedOnIngestion.size === 0
            ? ''
            : ` ${quotedEntries(firedOnIngestion)} fired on the live session's ingestion, which calls no model.`);
    const recoveredSentence =
        recovered.size === 0
            ? ''
            : ` On the presets of ${quotedEntries(recovered)}, \`${live.agentModel}\` recovered on its own (the ` +
              'evidence column says how), so those detectors correctly stayed clear. They are there for when a model ' +
              'does not recover: weaker models, other providers, prompt changes and regressions; the scripted column ' +
              'shows each of them catching the failure.';
    return firedSentence + recoveredSentence;
};
