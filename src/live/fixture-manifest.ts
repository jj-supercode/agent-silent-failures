import { z } from 'zod';

import { fixtureManifestSchema, type FixtureManifest, type ManifestBase } from '../record/index.ts';
import { usdSchema } from './budget/model.ts';
import { millisecondsSchema } from './resilience/model.ts';

/** Builds the base of a recording being resumed: the first session's provenance stays the recording's provenance. */
export const manifestBaseOf = (manifest: FixtureManifest): ManifestBase => ({
    schemaVersion: manifest.schemaVersion,
    mode: manifest.mode,
    recordedOn: manifest.recordedOn,
    startedAt: manifest.startedAt,
    models: manifest.models,
    platform: manifest.platform,
    versions: manifest.versions,
    corpusSha256: manifest.corpusSha256,
    split: manifest.split,
    plannedRuns: manifest.plannedRuns,
    keptSpanTypes: manifest.keptSpanTypes,
});

/** One session of a recording: a first session, or a later `--resume` that re-ran failed and missing runs. */
export const sessionRecordSchema = z.object({
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    /** Runs this session wrote a line for. */
    recordedRuns: z.int().nonnegative(),
    failedRuns: z.int().nonnegative(),
    retriedRuns: z.int().nonnegative(),
    networkPaused: millisecondsSchema,
    spentUsd: usdSchema,
    stoppedEarly: z.string().nullable(),
    platform: fixtureManifestSchema.shape.platform,
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

/**
 * The manifest as `demo:live` writes it: the fixture manifest plus the recording's sessions. A reader that does not
 * know `sessions` drops it (zod objects strip unknown keys), so the fixture schema version stays 1. A manifest
 * written before sessions were recorded has none.
 */
export const sessionManifestSchema = fixtureManifestSchema.extend({
    sessions: z.array(sessionRecordSchema).readonly().optional(),
});
export type SessionManifest = FixtureManifest & { readonly sessions: readonly SessionRecord[] };

/** The one session of a recording made before sessions were recorded; it could neither retry nor pause. */
export const sessionBeforeHistory = (
    manifest: FixtureManifest,
    spentUsd: SessionRecord['spentUsd'],
): SessionRecord => ({
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    recordedRuns: manifest.recordedRuns,
    failedRuns: manifest.failedRuns,
    retriedRuns: 0,
    networkPaused: millisecondsSchema.parse(0),
    spentUsd,
    stoppedEarly: manifest.stoppedEarly,
    platform: manifest.platform,
});
