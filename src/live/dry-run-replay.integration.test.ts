import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { planRuns, runBed, type RunSpec, type ScoredRun } from '../bed/index.ts';
import { loadQuestions, type CorpusQuestion } from '../corpus/index.ts';
import { flatScoreEntryId } from '../entries/index.ts';
import {
    manifestAt,
    manifestBase,
    fixtureFileNames,
    readFixtureSet,
    startFixtureSet,
    writeFixtureManifest,
    type FixtureSet,
} from '../record/index.ts';
import { replayFixtures } from '../replay/index.ts';
import { usdSchema } from './budget/model.ts';
import { createSpendLedger } from './budget/session-ledger.ts';
import { selectLiveRuns } from './live-plan.ts';
import { recordSession } from './record-session.ts';
import { dryRunModels } from './session-models.ts';
import { instantResilience } from './testing.ts';

/** The first runs of the live plan cover both harnesses and several clean variations. */
const sampledRuns = 6;

const firesFlatScore = (spec: RunSpec): boolean =>
    spec.condition.kind === 'faulted' && spec.condition.entryId === flatScoreEntryId;

/**
 * Mastra draws span ids at random on every execution, so the evidence of a fired verdict cites other ids in the bed
 * and in the recording. Everything else must be equal; of the ids, how many each verdict cites.
 */
const withSpanIdCounts = (run: ScoredRun) => ({
    ...run,
    verdicts: run.verdicts.map((scored) => ({
        ...scored,
        verdict:
            scored.verdict.kind === 'fired'
                ? {
                      ...scored.verdict,
                      evidence: { ...scored.verdict.evidence, spanIds: scored.verdict.evidence.spanIds.length },
                  }
                : scored.verdict,
    })),
});

const byRunId = (left: ScoredRun, right: ScoredRun) => left.runId.localeCompare(right.runId);

let directory = '';
let corpus: readonly CorpusQuestion[] = [];
let fixtures: FixtureSet | null = null;
let bedRuns: readonly ScoredRun[] = [];

beforeAll(async () => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new Error('the corpus did not load');
    }
    corpus = loaded.questions;
    const live = selectLiveRuns(planRuns(corpus, { split: 'held-out', entryId: null }), null).runs;
    const specs = [...live.slice(0, sampledRuns), ...live.filter(firesFlatScore).slice(0, 1)];
    directory = await mkdtemp(path.join(tmpdir(), 'dry-run-fixtures-'));
    await startFixtureSet(directory, { replace: true });
    const startedAt = new Date();
    const models = dryRunModels(false);
    const outcome = await recordSession(specs, {
        fixtureDirectory: directory,
        models,
        ledger: createSpendLedger({ cap: usdSchema.parse(10) }),
        environment: new Map(),
        resilience: instantResilience().resilience,
        onRun: () => Promise.resolve(),
    });
    const base = await manifestBase({
        mode: 'dry-run',
        models,
        startedAt,
        split: 'held-out',
        plannedRuns: specs.length,
    });
    await writeFixtureManifest(directory, manifestAt(base, outcome, new Date()), new Map());
    const read = await readFixtureSet(directory);
    fixtures = read.kind === 'read' ? read.fixtures : null;
    bedRuns = (await runBed(specs)).runs;
});

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe('a dry run recorded through the live path, replayed offline', () => {
    test('records every sampled run, covering both harnesses', () => {
        expect(fixtures?.runs).toHaveLength(sampledRuns + 1);
        expect(new Set(fixtures?.runs.map((run) => run.labels.harness))).toEqual(
            new Set(['single-agent', 'multi-agent']),
        );
        expect(fixtures?.runs.every((run) => run.outcome.kind === 'completed')).toBe(true);
    });

    test('scores to exactly the verdicts, evidence, sweeps and quality the scripted bed gives the same runs', () => {
        if (fixtures === null) {
            throw new Error('the fixture set did not read back');
        }
        const replayed = replayFixtures(fixtures, corpus);
        expect(replayed.unscorable).toEqual([]);
        expect(replayed.scored.every((run) => run.source === 'scripted')).toBe(true);
        expect(replayed.scored.toSorted(byRunId).map(withSpanIdCounts)).toEqual(
            bedRuns.toSorted(byRunId).map(withSpanIdCounts),
        );
        expect(replayed.scored.some((run) => run.verdicts.some((scored) => scored.verdict.kind === 'fired'))).toBe(
            true,
        );
    });

    test('writes no prompt, RequestContext or provider metadata into the fixture', async () => {
        const text = await readFile(path.join(directory, fixtureFileNames.runs), 'utf8');
        expect(text).not.toContain('requestContext');
        expect(text).not.toContain('"scenario"');
        expect(text).not.toContain('providerMetadata');
        expect(text).not.toContain('instructions');
    });
});
