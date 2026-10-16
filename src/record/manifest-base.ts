import type { ModelId } from '../trace/index.ts';
import type { FixtureManifest, RecordingMode } from './model.ts';
import { fixtureSchemaVersion } from './model.ts';
import { corpusSha256, currentPlatform, installedVersions, tracedPackages } from './provenance.ts';
import { keptSpanTypes } from './sanitize-trace.ts';

/** What a manifest says before any run is recorded: provenance, models and the size of the plan. */
export type ManifestBase = Omit<FixtureManifest, 'finishedAt' | 'recordedRuns' | 'failedRuns' | 'stoppedEarly'>;

export type ManifestBaseInput = {
    readonly mode: RecordingMode;
    readonly models: { readonly agentModelId: ModelId; readonly judgeModelId: ModelId | null };
    readonly startedAt: Date;
    readonly split: FixtureManifest['split'];
    readonly plannedRuns: number;
};

/** How far a session got. While it runs, `stoppedEarly` says it is unfinished, so an interrupted set reads as such. */
export type RecordingProgress = Pick<FixtureManifest, 'recordedRuns' | 'failedRuns' | 'stoppedEarly'>;

export const unfinishedSession = 'the session did not finish: it was interrupted or is still running';

/** The day a recording started, in UTC: the fixture directory name and the date every replayed number carries. */
export const recordingDate = (startedAt: Date): string => startedAt.toISOString().slice(0, 10);

/** Git-free provenance: installed versions, platform and corpus hash, read once per session. */
export const manifestBase = async (input: ManifestBaseInput): Promise<ManifestBase> => ({
    schemaVersion: fixtureSchemaVersion,
    mode: input.mode,
    recordedOn: recordingDate(input.startedAt),
    startedAt: input.startedAt.toISOString(),
    models: { agent: input.models.agentModelId, judge: input.models.judgeModelId },
    platform: currentPlatform(),
    versions: installedVersions(tracedPackages),
    corpusSha256: await corpusSha256(),
    split: input.split,
    plannedRuns: input.plannedRuns,
    keptSpanTypes: [...keptSpanTypes],
});

export const manifestAt = (base: ManifestBase, progress: RecordingProgress, at: Date): FixtureManifest => ({
    ...base,
    finishedAt: at.toISOString(),
    ...progress,
});
