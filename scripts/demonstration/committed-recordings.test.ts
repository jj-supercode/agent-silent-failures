import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions } from '../../src/corpus/index.ts';
import { demonstrationReportSchema } from '../../src/studio/demonstration/index.ts';
import { newestRecording, recordedReport, type RecordingKind } from './recorded-report.ts';
import { demonstrationResultFiles } from './result-files.ts';

const corpus = await loadQuestions();

const committedReport = async (kind: RecordingKind) =>
    demonstrationReportSchema.parse(JSON.parse(await readFile(demonstrationResultFiles[kind], 'utf8')));

describe('committed demonstration results', () => {
    test('the scripted matrix has a committed recording', async () => {
        expect(await newestRecording('scripted')).not.toBeNull();
    });

    test.each(['scripted', 'live'] as const)(
        'results/demonstration/%s.json is exactly what its newest recording scores to',
        async (kind) => {
            const directory = await newestRecording(kind);
            if (directory === null) {
                // Before the first trace-backed live run, live.json is the verdict-only file of an earlier run.
                expect((await committedReport(kind)).basis).toEqual({ kind: 'verdicts-only' });
                return;
            }
            if (corpus.kind === 'failed') {
                throw new CorpusLoadError(corpus.failure);
            }
            const scored = await recordedReport(directory, corpus.questions);
            expect(scored.kind).toBe('scored');
            expect(scored.kind === 'scored' ? scored.report : null).toEqual(await committedReport(kind));
        },
    );
});
