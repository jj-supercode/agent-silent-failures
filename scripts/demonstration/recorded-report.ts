import type { CorpusQuestion } from '../../src/corpus/index.ts';
import { newestDatedDirectory } from '../../src/replay/index.ts';
import {
    readDemonstrationRecording,
    scoreDemonstrationRecording,
    type DemonstrationReport,
} from '../../src/studio/demonstration/index.ts';
import { demonstrationFixtureRoots } from './result-files.ts';

export type RecordedReport =
    | { readonly kind: 'scored'; readonly report: DemonstrationReport }
    | { readonly kind: 'unreadable'; readonly directory: string; readonly reason: string };

/** Reads a demonstration recording and scores it offline: the one way a demonstration report is made. */
export const recordedReport = async (directory: string, corpus: readonly CorpusQuestion[]): Promise<RecordedReport> => {
    const read = await readDemonstrationRecording(directory);
    return read.kind === 'read'
        ? { kind: 'scored', report: scoreDemonstrationRecording(read.recording, corpus) }
        : { kind: 'unreadable', directory: read.directory, reason: read.reason };
};

export type RecordingKind = keyof typeof demonstrationFixtureRoots;

/** The newest committed recording of this kind, or `null` before the first one. */
export const newestRecording = (kind: RecordingKind): Promise<string | null> =>
    newestDatedDirectory(demonstrationFixtureRoots[kind]);
