export { SensitiveFixtureError } from './errors.ts';
export {
    appendRecordedRun,
    startFixtureSet,
    writeFixtureJson,
    writeFixtureManifest,
    type AppendResult,
    type FixtureStart,
} from './fixture-writer.ts';
export { parsedJson, readFixtureSet, type FixtureSet, type FixtureSetResult } from './fixture-reader.ts';
export { guardedProcessEnvironment, type EnvironmentValues } from './guarded-environment.ts';
export {
    fixtureFileNames,
    fixtureManifestSchema,
    fixtureSchemaVersion,
    recordedRunSchema,
    toRecordedLabels,
    type FixtureManifest,
    type RecordedLabels,
    type RecordedRun,
    type RecordedRunInput,
    type RecordingMode,
} from './model.ts';
export {
    manifestAt,
    manifestBase,
    recordingDate,
    unfinishedSession,
    type ManifestBase,
    type ManifestBaseInput,
    type RecordingProgress,
} from './manifest-base.ts';
export { corpusSha256, currentPlatform, installedVersions, tracedPackages } from './provenance.ts';
export { keptSpanTypes, sanitizeTrace } from './sanitize-trace.ts';
export { secretLookingVariables, sensitiveFindings, type SensitiveFinding } from './sensitive-strings.ts';
