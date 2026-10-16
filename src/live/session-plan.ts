import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RunSpec } from '../bed/index.ts';
import {
    corpusSha256,
    installedVersions,
    manifestBase,
    recordingDate,
    startFixtureSet,
    tracedPackages,
    type ManifestBase,
} from '../record/index.ts';
import type { LiveOptions } from './live-options.ts';
import { selectLiveRuns, type LivePlan } from './live-plan.ts';
import { keepCompletedRuns } from './resume/keep-completed-runs.ts';
import { prepareResume } from './resume/prepare-resume.ts';
import type { RecordingIdentity } from './resume/resume-check.ts';
import { newRecording, type RecordingHistory } from './session-files.ts';
import { sessionModelIds, type SessionModels } from './session-models.ts';

const repoRoot = new URL('../../', import.meta.url);

/** Live sessions record the held-out split: the runs no detector was tuned on. */
export const liveSplit = 'held-out';

/** What a session will record, for the command to print: a new recording's exclusions, or a resumed one's state. */
export type PlanDescription =
    | {
          readonly kind: 'new';
          /** Conditions whose configuration replaces the model, so they run scripted only. */
          readonly scriptedOnly: readonly string[];
          /** Ingestion conditions call no model; their numbers stay scripted. */
          readonly ingestionConditions: number;
          readonly ingestionRuns: number;
      }
    | { readonly kind: 'resume'; readonly directory: string; readonly completedRuns: number };

const describeNewPlan = (plan: LivePlan): PlanDescription => {
    const withoutModel = plan.exclusions.filter((exclusion) => exclusion.reason === 'no-model');
    return {
        kind: 'new',
        scriptedOnly: plan.exclusions
            .filter((exclusion) => exclusion.reason === 'scripted-only')
            .map((exclusion) => exclusion.condition),
        ingestionConditions: withoutModel.length,
        ingestionRuns: withoutModel.reduce((total, exclusion) => total + exclusion.plannedRuns, 0),
    };
};

/** What this checkout would record under: a resumed recording must have been recorded under the same. */
export const currentIdentity = async (options: LiveOptions): Promise<RecordingIdentity> => {
    const models = sessionModelIds(options.mode, options.judge);
    return {
        mode: options.mode,
        corpusSha256: await corpusSha256(),
        models: { agent: models.agentModelId, judge: models.judgeModelId },
        versions: installedVersions(tracedPackages),
        split: liveSplit,
    };
};

/** An opened fixture directory, or the existing recording a new session refuses to touch. */
export type OpenedRecording =
    | { readonly kind: 'opened'; readonly directory: string; readonly base: ManifestBase }
    | { readonly kind: 'exists'; readonly directory: string };

/** A session about to start: its runs, and how to open its fixture directory once the key has loaded. */
type SessionPlan = {
    readonly runs: readonly RunSpec[];
    readonly history: RecordingHistory;
    readonly description: PlanDescription;
    /** Opens (or prepares) the fixture directory. */
    readonly open: (models: SessionModels, startedAt: Date) => Promise<OpenedRecording>;
};

export type SessionPlanning =
    | { readonly kind: 'planned'; readonly plan: SessionPlan }
    | { readonly kind: 'resume-refused'; readonly directory: string; readonly reason: string }
    | { readonly kind: 'nothing-to-resume'; readonly directory: string; readonly completedRuns: number };

/**
 * A live recording goes to `fixtures/live/<date>/`, to be committed. A dry run is a rehearsal, so it records to a
 * fresh temporary directory and leaves the repository untouched; `--out fixtures/dry-run/<date>` records one to commit.
 */
const defaultRecordingDirectory = async (mode: LiveOptions['mode'], startedAt: Date): Promise<string> => {
    switch (mode) {
        case 'live':
            return fileURLToPath(new URL(`fixtures/live/${recordingDate(startedAt)}/`, repoRoot));
        case 'dry-run':
            return mkdtemp(path.join(tmpdir(), 'agent-silent-failures-dry-run-'));
        default:
            return mode satisfies never;
    }
};

const newSessionPlan = (
    specs: readonly RunSpec[],
    options: LiveOptions,
    maxRuns: number | null,
    outputDirectory: string | null,
): SessionPlanning => {
    const plan = selectLiveRuns(specs, maxRuns);
    return {
        kind: 'planned',
        plan: {
            runs: plan.runs,
            history: newRecording,
            description: describeNewPlan(plan),
            open: async (models, startedAt) => {
                const directory = outputDirectory ?? (await defaultRecordingDirectory(options.mode, startedAt));
                const started = await startFixtureSet(directory, { replace: options.mode === 'dry-run' });
                if (started.kind === 'exists') {
                    return { kind: 'exists', directory: started.directory };
                }
                const base = await manifestBase({
                    mode: options.mode,
                    models,
                    startedAt,
                    split: liveSplit,
                    plannedRuns: plan.runs.length,
                });
                return { kind: 'opened', directory, base };
            },
        },
    };
};

const resumedSessionPlan = async (
    specs: readonly RunSpec[],
    options: LiveOptions,
    directory: string,
): Promise<SessionPlanning> => {
    const prepared = await prepareResume(directory, specs, await currentIdentity(options));
    switch (prepared.kind) {
        case 'refused':
            return { kind: 'resume-refused', directory, reason: prepared.reason };
        case 'complete':
            return { kind: 'nothing-to-resume', directory, completedRuns: prepared.completedRuns };
        case 'ready': {
            const { recording, runs, history, manifestBase: base } = prepared;
            return {
                kind: 'planned',
                plan: {
                    runs,
                    history,
                    description: { kind: 'resume', directory, completedRuns: history.completedRuns },
                    open: async () => {
                        if (recording.droppedLines > 0) {
                            await keepCompletedRuns(directory, recording.completedLines);
                        }
                        return { kind: 'opened', directory, base };
                    },
                },
            };
        }
        default:
            return prepared satisfies never;
    }
};

/** Plans a new recording or the rest of a resumed one, or says why there is nothing to record. */
export const planSession = async (specs: readonly RunSpec[], options: LiveOptions): Promise<SessionPlanning> => {
    const { recording } = options;
    switch (recording.kind) {
        case 'new':
            return newSessionPlan(specs, options, recording.maxRuns, recording.outputDirectory);
        case 'resume':
            return await resumedSessionPlan(specs, options, recording.directory);
        default:
            return recording satisfies never;
    }
};

/** The command that records the rest of a recording, in the mode it was made in. */
export const resumeCommand = (options: LiveOptions, directory: string): string =>
    `pnpm demo:live${options.mode === 'dry-run' ? ' --dry-run' : ''} --resume ${directory}`;
